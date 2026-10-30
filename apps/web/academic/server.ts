import 'server-only';
import {
  createAcademicEngine,
  AcademicError,
} from '@capstone/domain/academic-engine';
import { academicCommandSchema, submissionUuid } from '@capstone/domain';
import { EvaluationError } from '@capstone/domain/evaluations-engine';
import { DatabaseError } from '@capstone/db';
import { createNativeStorage } from '@capstone/storage/native';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
import { privateReadError } from '../semester/private-read-error';
let service: Promise<ReturnType<typeof createAcademicEngine>> | undefined;
export function academic() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    env = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(env))
    throw Error('INVALID_ENVIRONMENT');
  return (service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    env as 'local' | 'test' | 'production',
  ).then((storage) =>
    createAcademicEngine(process.env['DATABASE_URL'] ?? '', storage),
  ));
}
const reply = (status: number, value: unknown) =>
  Response.json(value, { status, headers: privateFileHeaders });
export async function academicHandler(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return reply(403, { code: 'FORBIDDEN', knownRejected: true });
    const a = await currentAccount(request.headers);
    if (
      !a ||
      !['student', 'faculty_supervisor', 'university_admin'].includes(a.role)
    )
      return reply(404, { code: 'NOT_FOUND', knownRejected: true });
    const expectedActor = request.headers.get('X-Workspace-Actor');
    if (expectedActor && expectedActor !== a.id)
      return reply(404, { code: 'AUTHORITY_UNAVAILABLE', knownRejected: true });
    const engine = await academic(),
      url = new URL(request.url);
    if (request.method === 'GET') {
      if (
        url.searchParams.size !== 1 ||
        [...url.searchParams.keys()].some(
          (k) => url.searchParams.getAll(k).length !== 1,
        )
      )
        return reply(400, { code: 'INVALID_INPUT' });
      for (const key of ['project', 'round', 'command']) {
        const id = url.searchParams.get(key);
        if (submissionUuid(id))
          return reply(
            200,
            key === 'project'
              ? await engine.readiness(a, id)
              : key === 'round'
                ? await engine.round(a, id)
                : { receipt: await engine.receipt(a, id) },
          );
      }
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
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const x = await reader.read();
        if (x.done) break;
        bytes += x.value.length;
        if (bytes > 131072) {
          await reader.cancel();
          return reply(413, { code: 'BODY_LIMIT', knownRejected: true });
        }
        chunks.push(x.value);
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
    const parsed = academicCommandSchema.safeParse(value);
    if (!parsed.success)
      return reply(400, {
        code: 'INVALID_INPUT',
        knownRejected: true,
        fields: parsed.error.issues.map((x) => ({
          path: x.path.join('.'),
          code: x.code,
        })),
      });
    return reply(200, await engine.command(a, parsed.data));
  } catch (e) {
    if (request.method === 'GET') {
      const failure = privateReadError(e);
      return reply(failure.status, { code: failure.code });
    }
    if (e instanceof AcademicError || e instanceof EvaluationError)
      return reply(409, {
        code: e.code,
        issues: e.issues,
        knownRejected: true,
      });
    const known =
      e instanceof DatabaseError &&
      !!e.sqlState &&
      (['40001', '40P01', '42501', 'P0002', 'P0001'].includes(e.sqlState) ||
        e.sqlState.startsWith('22') ||
        e.sqlState.startsWith('23'));
    return reply(known ? 409 : 503, {
      code:
        e instanceof DatabaseError && e.sqlState === '40001'
          ? 'CONFLICT'
          : e instanceof DatabaseError &&
              ['42501', 'P0002'].includes(e.sqlState ?? '')
            ? 'AUTHORITY_UNAVAILABLE'
            : 'COMMAND_UNAVAILABLE',
      knownRejected: known,
    });
  }
}
