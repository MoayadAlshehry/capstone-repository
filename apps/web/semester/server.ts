import 'server-only';
import {
  createSemesterEngine,
  SemesterError,
} from '@capstone/domain/semester-engine';
import { createNativeStorage } from '@capstone/storage/native';
import { semesterCommandSchema, submissionUuid } from '@capstone/domain';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
let service: Promise<ReturnType<typeof createSemesterEngine>> | undefined;
export function semester() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    env = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(env))
    throw Error('INVALID_ENVIRONMENT');
  return (service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    env as 'local' | 'test' | 'production',
  ).then((storage) =>
    createSemesterEngine(process.env['DATABASE_URL'] ?? '', storage),
  ));
}
const reply = (status: number, value: unknown) =>
  Response.json(value, { status, headers: privateFileHeaders });
export async function semesterHandler(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return reply(403, { code: 'FORBIDDEN', knownRejected: true });
    const actor = await currentAccount(request.headers);
    if (!actor || !['student', 'faculty_supervisor'].includes(actor.role))
      return reply(404, { code: 'NOT_FOUND', knownRejected: true });
    if (
      request.headers.has('X-Workspace-Actor') &&
      request.headers.get('X-Workspace-Actor') !== actor.id
    )
      return reply(409, { code: 'ACTOR_CHANGED', knownRejected: true });
    const url = new URL(request.url),
      engine = await semester();
    if (request.method === 'GET') {
      if (
        [...url.searchParams.keys()].some(
          (k) => url.searchParams.getAll(k).length !== 1,
        ) ||
        url.searchParams.size !== 1
      )
        return reply(400, { code: 'INVALID_INPUT' });
      const command = url.searchParams.get('command'),
        project = url.searchParams.get('project'),
        round = url.searchParams.get('round');
      if (submissionUuid(command))
        return reply(200, { receipt: await engine.receipt(actor, command) });
      if (submissionUuid(project))
        return reply(200, await engine.state(actor, project));
      if (submissionUuid(round))
        return reply(200, await engine.round(actor, round));
      if (
        url.searchParams.get('collection') === 'projects' ||
        url.searchParams.get('collection') === 'needs-review'
      )
        return reply(
          200,
          await engine.collection(
            actor,
            url.searchParams.get('collection') === 'needs-review',
          ),
        );
      return reply(400, { code: 'INVALID_INPUT' });
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      url.search ||
      request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN', knownRejected: true });
    const reader = request.body?.getReader();
    if (!reader)
      return reply(400, { code: 'INVALID_INPUT', knownRejected: true });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        bytes += r.value.length;
        if (bytes > 100000) {
          await reader.cancel();
          return reply(413, { code: 'BODY_LIMIT', knownRejected: true });
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    let value: unknown;
    try {
      value = JSON.parse(
        new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch {
      return reply(400, { code: 'INVALID_INPUT', knownRejected: true });
    }
    const parsed = semesterCommandSchema.safeParse(value);
    if (!parsed.success)
      return reply(400, {
        code: 'VALIDATION',
        knownRejected: true,
        fields: parsed.error.issues.map((x) => ({
          path: x.path.join('.'),
          code: x.message,
        })),
      });
    return reply(200, await engine.command(actor, parsed.data));
  } catch (error) {
    if (error instanceof SemesterError)
      return reply(409, {
        code: error.code,
        issues: error.issues,
        knownRejected: true,
      });
    const state = error instanceof DatabaseError ? error.sqlState : undefined;
    if (state === 'P0002' || state === '42501')
      return reply(404, { code: 'NOT_FOUND', knownRejected: true });
    if (state === '40001')
      return reply(409, { code: 'CONFLICT', knownRejected: true });
    if (state?.startsWith('22') || state?.startsWith('23'))
      return reply(400, {
        code: 'INVALID_OR_CHANGED_STATE',
        knownRejected: true,
      });
    return reply(503, { code: 'OUTCOME_UNCONFIRMED', knownRejected: false });
  }
}
export function uploadEndpoint() {
  const configured = process.env['UPLOAD_BROWSER_ORIGIN'];
  if (!configured) return '/files';
  const parsed = new URL(configured);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/' ||
    !['http:', 'https:'].includes(parsed.protocol)
  )
    throw Error('INVALID_UPLOAD_ORIGIN');
  return parsed.origin + '/files';
}
