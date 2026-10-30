import 'server-only';
import { createCorrectionsEngine } from '@capstone/domain/corrections-engine';
import { createNativeStorage } from '@capstone/storage/native';
import { submissionUuid } from '@capstone/domain';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
import { privateReadError } from '../semester/private-read-error';
import { DatabaseError } from '@capstone/db';
let service: Promise<ReturnType<typeof createCorrectionsEngine>> | undefined;
export function corrections() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    environment = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(environment))
    throw Error('INVALID_ENVIRONMENT');
  service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    environment as 'local' | 'test' | 'production',
  ).then((storage) =>
    createCorrectionsEngine(process.env['DATABASE_URL'] ?? '', storage),
  );
  return service;
}
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: privateFileHeaders });
export async function governanceHandler(request: Request) {
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
    const engine = await corrections();
    if (request.method === 'GET') {
      const q = new URL(request.url).searchParams;
      if (q.has('receipt')) {
        if (
          [...q.keys()].some((key) => key !== 'receipt') ||
          q.getAll('receipt').length !== 1 ||
          !submissionUuid(q.get('receipt'))
        )
          return reply(400, { code: 'INVALID_INPUT' });
        return reply(200, {
          receipt: await engine.receipt(actor, q.get('receipt')!),
        });
      }
      if (
        [...q.keys()].some((k) => !['case', 'issue', 'feedback'].includes(k)) ||
        [...q.entries()].some(([k, v]) =>
          k === 'feedback' ? v !== 'true' : !submissionUuid(v),
        ) ||
        q.getAll('case').length > 1 ||
        q.getAll('issue').length > 1 ||
        q.getAll('feedback').length > 1
      )
        return reply(400, { code: 'INVALID_INPUT' });
      if (q.get('feedback') === 'true') {
        if (!submissionUuid(q.get('case')) || q.has('issue'))
          return reply(400, { code: 'INVALID_INPUT' });
        return reply(200, await engine.feedback(actor, q.get('case')!));
      }
      return reply(
        200,
        await engine.view(
          actor,
          q.get('case') ?? undefined,
          q.get('issue') ?? undefined,
        ),
      );
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
        if (size > 131072) {
          await reader.cancel();
          return reply(400, { code: 'INVALID_INPUT' });
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    let c: {
      operation: string;
      body: Record<string, unknown>;
      command: string;
    };
    try {
      c = JSON.parse(
        new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)),
      ) as typeof c;
    } catch {
      return reply(400, { code: 'INVALID_INPUT' });
    }
    if (
      !c ||
      typeof c !== 'object' ||
      Array.isArray(c) ||
      Object.keys(c).some((k) => !['operation', 'body', 'command'].includes(k))
    )
      return reply(400, { code: 'INVALID_INPUT' });
    return reply(200, await engine.command(actor, c));
  } catch (error) {
    if (request.method === 'GET') {
      const result = privateReadError(error);
      return reply(result.status, { code: result.code });
    }
    const message = error instanceof Error ? error.message : '',
      state = error instanceof DatabaseError ? error.sqlState : undefined,
      status =
        message === 'NOT_FOUND' || ['P0002', '42501'].includes(state ?? '')
          ? 404
          : ['INVALID_INPUT', 'INVALID_ASSESSMENT'].includes(message) ||
              state?.startsWith('22')
            ? 400
            : message === 'EVIDENCE_UNAVAILABLE' ||
                ['P0001', '23505', '23503', '23514', '40001', '40P01'].includes(
                  state ?? '',
                )
              ? 409
              : 503;
    return reply(status, {
      code:
        status === 404
          ? 'NOT_FOUND'
          : status === 400
            ? 'INVALID_INPUT'
            : status === 409
              ? 'GOVERNANCE_CONFLICT'
              : 'GOVERNANCE_UNAVAILABLE',
    });
  }
}
