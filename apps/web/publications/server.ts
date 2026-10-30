import 'server-only';
import {
  createPublicationEngine,
  PublicationError,
} from '@capstone/domain/publications-engine';
import { createNativeStorage } from '@capstone/storage/native';
import {
  submissionUuid,
  type PublicationCommand,
  type AuditFilter,
} from '@capstone/domain';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
import { privateReadError } from '../semester/private-read-error';
let service: Promise<ReturnType<typeof createPublicationEngine>> | undefined;
export function publications() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    env = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(env))
    throw Error('INVALID_ENVIRONMENT');
  service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    env as 'local' | 'test' | 'production',
  ).then((storage) =>
    createPublicationEngine(process.env['DATABASE_URL'] ?? '', storage),
  );
  return service;
}
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: privateFileHeaders });
export async function publicationHandler(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return reply(403, { code: 'FORBIDDEN' });
    const actor = await currentAccount(request.headers);
    if (!actor) return reply(404, { code: 'NOT_FOUND' });
    const engine = await publications();
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      if (params.size === 1 && params.get('archive') === '1')
        return reply(200, await engine.archive(actor));
      const sub = params.get('submission');
      if (params.size !== 1 || !submissionUuid(sub))
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(200, await engine.state(actor, sub));
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { code: 'INVALID_INPUT' });
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 8192) {
          await reader.cancel();
          return reply(400, { code: 'INVALID_INPUT' });
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    const c = JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as Record<string, unknown>;
    if (!c || Array.isArray(c) || typeof c !== 'object')
      return reply(400, { code: 'INVALID_INPUT' });
    if (c['operation'] === 'audit') {
      if (
        Object.keys(c).some(
          (k) => !['operation', 'filters', 'reason'].includes(k),
        ) ||
        !c['filters'] ||
        typeof c['filters'] !== 'object' ||
        Array.isArray(c['filters']) ||
        typeof c['reason'] !== 'string'
      )
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(
        200,
        await engine.audit(actor, c['filters'] as AuditFilter, c['reason']),
      );
    }
    if (
      Object.keys(c).some(
        (k) =>
          !['submission', 'revision', 'assignmentRevision', 'command'].includes(
            k,
          ),
      )
    )
      return reply(400, { code: 'INVALID_INPUT' });
    return reply(
      200,
      await engine.publish(actor, c as unknown as PublicationCommand),
    );
  } catch (e) {
    if (request.method === 'GET') {
      const failure = privateReadError(e);
      return reply(failure.status, { code: failure.code });
    }
    if (e instanceof PublicationError) return reply(409, { code: e.code });
    return reply(409, {
      code: 'PUBLICATION_UNAVAILABLE',
    });
  }
}
