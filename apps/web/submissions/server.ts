import 'server-only';
import {
  createSubmissionEngine,
  SubmissionError,
} from '@capstone/domain/submissions-engine';
import { createNativeStorage } from '@capstone/storage/native';
import {
  submissionUuid,
  type SubmitCommand,
  type DecisionCommand,
} from '@capstone/domain';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
import { privateReadError } from '../semester/private-read-error';
let service: Promise<ReturnType<typeof createSubmissionEngine>> | undefined;
export function submissions() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    environment = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(environment))
    throw Error('INVALID_ENVIRONMENT');
  service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    environment as 'local' | 'test' | 'production',
  ).then((storage) =>
    createSubmissionEngine(process.env['DATABASE_URL'] ?? '', storage),
  );
  return service;
}
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: privateFileHeaders });
export async function submissionHandler(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return reply(403, { code: 'FORBIDDEN' });
    const actor = await currentAccount(request.headers);
    if (!actor) return reply(404, { code: 'NOT_FOUND' });
    const engine = await submissions(),
      url = new URL(request.url);
    if (request.method === 'GET') {
      if (url.searchParams.size === 1 && url.searchParams.get('queue') === '1')
        return reply(200, await engine.queue(actor));
      const sub = url.searchParams.get('submission');
      if (url.searchParams.size === 1 && submissionUuid(sub))
        return reply(200, await engine.read(actor, sub));
      const project = url.searchParams.get('project'),
        version = url.searchParams.get('version');
      if (
        url.searchParams.size === 2 &&
        submissionUuid(project) &&
        submissionUuid(version)
      )
        return reply(200, await engine.state(actor, project, version));
      return reply(400, { code: 'INVALID_INPUT' });
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (request.headers.get('origin') !== process.env['AUTH_BASE_URL'])
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
        if (size > 16384) {
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
    if (!['submit', 'revision', 'reject'].includes(String(c['operation'])))
      return reply(400, { code: 'PUBLICATION_UNAVAILABLE' });
    const allowed =
      c['operation'] === 'submit'
        ? [
            'operation',
            'project',
            'version',
            'revision',
            'assignmentRevision',
            'command',
          ]
        : [
            'operation',
            'submission',
            'revision',
            'assignmentRevision',
            'command',
            'comment',
          ];
    if (Object.keys(c).some((k) => !allowed.includes(k)))
      return reply(400, { code: 'INVALID_INPUT' });
    if (c['operation'] === 'submit')
      return reply(
        200,
        await engine.submit(actor, c as unknown as SubmitCommand),
      );
    return reply(
      200,
      await engine.decide(actor, c as unknown as DecisionCommand),
    );
  } catch (e) {
    if (request.method === 'GET') {
      const failure = privateReadError(e);
      return reply(failure.status, { code: failure.code });
    }
    if (e instanceof SubmissionError)
      return reply(409, { code: e.code, issues: e.issues });
    return reply(409, {
      code: 'SUBMISSION_UNAVAILABLE',
    });
  }
}
