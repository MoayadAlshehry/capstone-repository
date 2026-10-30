import 'server-only';
import { createGovernance } from '@capstone/db/governance';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
import { uuid } from '@capstone/domain/notification-types';
let service: ReturnType<typeof createGovernance> | undefined;
export const governance = () =>
  (service ??= createGovernance(process.env['DATABASE_URL'] ?? ''));
function reply(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
async function input(req: Request) {
  if (
    req.headers.get('Origin') !==
      new URL(process.env['AUTH_BASE_URL'] ?? 'http://localhost:3000').origin ||
    !req.headers.get('Content-Type')?.startsWith('application/json')
  )
    throw Error('FORBIDDEN');
  let size = 0;
  const parts: Uint8Array[] = [];
  if (req.body)
    for await (const part of req.body) {
      size += part.length;
      if (size > 16384) throw Error('INVALID_INPUT');
      parts.push(part);
    }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw Error('INVALID_INPUT');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('INVALID_INPUT');
  return value as Record<string, unknown>;
}
export async function governanceHandler(
  req: Request,
  kind: 'notifications' | 'audit',
) {
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply({ error: 'UNAUTHORIZED' }, 401);
    if (
      req.headers.has('X-Workspace-Actor') &&
      req.headers.get('X-Workspace-Actor') !== a.id
    )
      return reply({ error: 'FORBIDDEN' }, 403);
    const url = new URL(req.url);
    if (kind === 'notifications' && req.method === 'GET') {
      if (
        [...url.searchParams.keys()].some(
          (k) => !['unread', 'before', 'beforeId', 'mode'].includes(k),
        )
      )
        return reply({ error: 'INVALID_INPUT' }, 400);
      if (
        url.searchParams.has('unread') &&
        !['true', 'false'].includes(url.searchParams.get('unread')!)
      )
        return reply({ error: 'INVALID_INPUT' }, 400);
      if (
        url.searchParams.has('mode') &&
        url.searchParams.get('mode') !== 'count'
      )
        return reply({ error: 'INVALID_INPUT' }, 400);
      if (url.searchParams.get('mode') === 'count')
        return reply({ unread: await governance().count(a), role: a.role });
      const page = await governance().notices(
        a,
        url.searchParams.get('unread') === 'true',
        url.searchParams.get('before') ?? undefined,
        url.searchParams.get('beforeId') ?? undefined,
      );
      return reply(
        url.searchParams.get('mode') === 'count'
          ? { unread: page.unread, role: a.role }
          : page,
      );
    }
    if (req.method !== 'POST')
      return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    const body = await input(req);
    if (kind === 'notifications') {
      if (Object.keys(body).some((k) => !['operation', 'id'].includes(k)))
        return reply({ error: 'INVALID_INPUT' }, 400);
      if (body['operation'] === 'read' && uuid(body['id']))
        await governance().read(a, body['id']);
      else if (body['operation'] === 'read-all' && body['id'] === undefined)
        await governance().read(a);
      else return reply({ error: 'INVALID_INPUT' }, 400);
      return reply({ outcome: 'PASS' });
    }
    if (
      Object.keys(body).some(
        (k) => !['filters', 'oversight', 'reason', 'command'].includes(k),
      ) ||
      (body['oversight'] !== undefined &&
        typeof body['oversight'] !== 'string') ||
      (body['reason'] !== undefined && typeof body['reason'] !== 'string') ||
      (body['command'] !== undefined && typeof body['command'] !== 'string')
    )
      return reply({ error: 'INVALID_INPUT' }, 400);
    return reply(
      await governance().audit(
        a,
        body['filters'] ?? {},
        body['oversight'] as string | undefined,
        body['reason'] as string | undefined,
        body['command'] as string | undefined,
      ),
    );
  } catch (e) {
    const code =
      e instanceof DatabaseError
        ? e.sqlState
        : e instanceof Error
          ? e.message
          : '';
    return reply(
      {
        error:
          code === 'P0002'
            ? 'NOT_FOUND'
            : code === '42501' || code === 'FORBIDDEN'
              ? 'FORBIDDEN'
              : code === 'INVALID_INPUT' || code?.startsWith('22')
                ? 'INVALID_INPUT'
                : 'UNAVAILABLE',
      },
      code === 'P0002'
        ? 404
        : code === '42501' || code === 'FORBIDDEN'
          ? 403
          : code === 'INVALID_INPUT' || code?.startsWith('22')
            ? 400
            : 503,
    );
  }
}
