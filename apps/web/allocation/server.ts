import 'server-only';
import { createAllocationRepository } from '@capstone/db/allocation';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
let service: ReturnType<typeof createAllocationRepository> | undefined;
export const allocation = () =>
  (service ??= createAllocationRepository(process.env['DATABASE_URL'] ?? ''));
const reply = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export async function allocationHandler(req: Request) {
  if (req.method !== 'GET') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply({ error: 'UNAUTHORIZED' }, 401);
    if (!['platform_admin', 'university_admin'].includes(a.role))
      return reply({ error: 'FORBIDDEN' }, 403);
    const u = new URL(req.url),
      run = u.searchParams.get('run');
    if (
      [...u.searchParams.keys()].some((k) => k !== 'run') ||
      u.searchParams.getAll('run').length > 1 ||
      (run !== null &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          run,
        ))
    )
      return reply({ error: 'INVALID_INPUT' }, 400);
    return reply(await allocation().view(a, run ?? undefined));
  } catch (e) {
    const state = e instanceof DatabaseError ? e.sqlState : '';
    return reply(
      {
        error:
          state === '42501'
            ? 'FORBIDDEN'
            : state === 'P0002'
              ? 'NOT_FOUND'
              : 'UNAVAILABLE',
      },
      state === '42501' ? 403 : state === 'P0002' ? 404 : 503,
    );
  }
}
