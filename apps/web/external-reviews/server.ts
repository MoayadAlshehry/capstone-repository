import 'server-only';
import {
  createExternalReviewEngine,
  ExternalReviewError,
} from '@capstone/domain/external-reviews-engine';
import { createNativeStorage } from '@capstone/storage/native';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
let service: Promise<ReturnType<typeof createExternalReviewEngine>> | undefined;
export function externalReviews() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    env = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(env))
    throw Error('INVALID_ENVIRONMENT');
  return (service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    env as 'local' | 'test' | 'production',
  ).then((s) =>
    createExternalReviewEngine(process.env['DATABASE_URL'] ?? '', s),
  ));
}
const reply = (value: unknown, status = 200) =>
  Response.json(
    value && typeof value === 'object' && 'error' in value
      ? {
          ...value,
          code: value.error,
          knownRejected: status < 500 || status === 503,
        }
      : value,
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
export async function externalReviewHandler(req: Request) {
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply({ error: 'UNAUTHORIZED' }, 401);
    if (
      req.headers.has('X-Workspace-Actor') &&
      req.headers.get('X-Workspace-Actor') !== a.id
    )
      return reply({ error: 'FORBIDDEN' }, 403);
    const r = await externalReviews(),
      u = new URL(req.url);
    if (req.method === 'GET') {
      if (
        [...u.searchParams.keys()].some(
          (k) => !['assignment', 'command'].includes(k),
        ) ||
        u.searchParams.getAll('assignment').length > 1 ||
        u.searchParams.getAll('command').length > 1
      )
        return reply({ error: 'INVALID_INPUT' }, 400);
      if (u.searchParams.has('command'))
        return reply({
          receipt: await r.receipt(
            a,
            u.searchParams.get('assignment') ?? '',
            u.searchParams.get('command') ?? '',
          ),
        });
      return reply(
        await r.view(a, u.searchParams.get('assignment') ?? undefined),
      );
    }
    if (req.method !== 'POST')
      return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (
      req.headers.get('Origin') !==
        new URL(process.env['AUTH_BASE_URL'] ?? 'http://localhost:3000')
          .origin ||
      !req.headers.get('Content-Type')?.startsWith('application/json')
    )
      return reply({ error: 'FORBIDDEN' }, 403);
    const parts: Uint8Array[] = [];
    let size = 0;
    if (req.body)
      for await (const part of req.body) {
        size += part.length;
        if (size > 1048576) return reply({ error: 'INVALID_INPUT' }, 400);
        parts.push(part);
      }
    const b = JSON.parse(Buffer.concat(parts).toString()) as Record<
      string,
      unknown
    >;
    if (
      !b ||
      Array.isArray(b) ||
      Object.keys(b).some(
        (k) =>
          !['assignment', 'operation', 'revision', 'body', 'command'].includes(
            k,
          ),
      ) ||
      typeof b.assignment !== 'string' ||
      typeof b.operation !== 'string' ||
      typeof b.revision !== 'number' ||
      typeof b.command !== 'string'
    )
      return reply({ error: 'INVALID_INPUT' }, 400);
    if (b.operation === 'check')
      return reply(await r.check(a, b.assignment, b.revision, b.body));
    return reply(
      await r.command(a, {
        assignment: b.assignment,
        operation: b.operation,
        revision: b.revision,
        command: b.command,
        body: b.body,
      }),
    );
  } catch (e) {
    if (e instanceof ExternalReviewError)
      return reply(
        { error: e.code, issues: e.issues },
        e.code === 'EVIDENCE_UNAVAILABLE' ? 503 : 400,
      );
    if (
      e instanceof DatabaseError &&
      (!e.sqlState || e.sqlState.startsWith('08'))
    )
      return reply({ code: 'OUTCOME_UNKNOWN', knownRejected: false }, 503);
    if (e instanceof DatabaseError)
      return reply(
        {
          error:
            e.sqlState === '40001'
              ? 'CONFLICT'
              : e.sqlState === '42501'
                ? 'FORBIDDEN'
                : 'NOT_FOUND',
        },
        e.sqlState === '40001'
          ? 409
          : e.sqlState === '42501'
            ? 403
            : e.sqlState?.startsWith('22')
              ? 400
              : 404,
      );
    return e instanceof SyntaxError
      ? reply({ error: 'INVALID_INPUT' }, 400)
      : reply({ error: 'OUTCOME_UNKNOWN', knownRejected: false }, 500);
  }
}
