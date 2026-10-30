import 'server-only';
import {
  createEditionEngine,
  EditionError,
} from '@capstone/domain/editions-engine';
import { createNativeStorage } from '@capstone/storage/native';
import {
  submissionUuid,
  type SuccessorCommand,
  type VisibilityCommand,
} from '@capstone/domain';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
import { privateReadError } from '../semester/private-read-error';
let service: Promise<ReturnType<typeof createEditionEngine>> | undefined;
export function editions() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    env = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(env))
    throw Error('INVALID_ENVIRONMENT');
  return (service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    env as 'local' | 'test' | 'production',
  ).then((store) =>
    createEditionEngine(process.env['DATABASE_URL'] ?? '', store),
  ));
}
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: privateFileHeaders });
export async function editionHandler(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return reply(403, { code: 'FORBIDDEN' });
    const actor = await currentAccount(request.headers);
    if (!actor) return reply(404, { code: 'NOT_FOUND' });
    if (
      request.headers.has('X-Workspace-Actor') &&
      request.headers.get('X-Workspace-Actor') !== actor.id
    )
      return reply(404, { code: 'NOT_FOUND' });
    const engine = await editions();
    if (request.method === 'GET') {
      const p = new URL(request.url).searchParams;
      if (p.size !== 1 || !submissionUuid(p.get('project')))
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(200, await engine.history(actor, p.get('project')!));
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
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const x = await reader.read();
        if (x.done) break;
        size += x.value.length;
        if (size > 65536) {
          await reader.cancel();
          return reply(400, { code: 'INVALID_INPUT' });
        }
        chunks.push(x.value);
      }
    } finally {
      reader.releaseLock();
    }
    const c = JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as Record<string, unknown>;
    if (!c || Array.isArray(c) || typeof c !== 'object')
      return reply(400, { code: 'INVALID_INPUT' });
    if (c['operation'] !== 'visibility.batch' && size > 8192)
      return reply(400, { code: 'INVALID_INPUT' });
    if (c['operation'] === 'create') {
      if (
        Object.keys(c).some(
          (k) =>
            ![
              'operation',
              'project',
              'base',
              'assignmentRevision',
              'command',
            ].includes(k),
        )
      )
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(
        200,
        await engine.create(actor, c as unknown as SuccessorCommand),
      );
    }
    if (c['operation'] === 'visibility') {
      if (
        Object.keys(c).some(
          (k) =>
            ![
              'operation',
              'project',
              'version',
              'file',
              'revision',
              'visibility',
              'command',
            ].includes(k),
        )
      )
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(
        200,
        await engine.visibility(actor, c as unknown as VisibilityCommand),
      );
    }
    if (c['operation'] === 'visibility.batch') {
      if (
        Object.keys(c).some(
          (k) => !['operation', 'project', 'version', 'files'].includes(k),
        ) ||
        !Array.isArray(c['files']) ||
        c['files'].some(
          (f) =>
            !f ||
            Array.isArray(f) ||
            typeof f !== 'object' ||
            Object.keys(f).some(
              (k) => !['file', 'revision', 'visibility', 'command'].includes(k),
            ),
        )
      )
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(
        200,
        await engine.visibilityBatch(
          actor,
          c as unknown as Parameters<typeof engine.visibilityBatch>[1],
        ),
      );
    }
    return reply(400, { code: 'INVALID_INPUT' });
  } catch (e) {
    if (request.method === 'GET') {
      const failure = privateReadError(e);
      return reply(failure.status, { code: failure.code });
    }
    return reply(409, {
      code: e instanceof EditionError ? e.code : 'EDITION_CONFLICT',
    });
  }
}
