import 'server-only';
import { createReviewers } from '@capstone/db/reviewers';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
let service: ReturnType<typeof createReviewers> | undefined;
export const reviewers = () =>
  (service ??= createReviewers(process.env['DATABASE_URL'] ?? ''));
const reply = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export async function reviewerHandler(req: Request) {
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply({ error: 'UNAUTHORIZED' }, 401);
    if (
      req.headers.has('X-Workspace-Actor') &&
      req.headers.get('X-Workspace-Actor') !== a.id
    )
      return reply({ error: 'FORBIDDEN' }, 403);
    const url = new URL(req.url);
    if (req.method === 'GET') {
      if (
        [...url.searchParams.keys()].some(
          (k) => !['status', 'mode'].includes(k),
        )
      )
        return reply({ error: 'INVALID_INPUT' }, 400);
      if (url.searchParams.get('mode') === 'capability')
        return reply({ capable: await reviewers().capability(a) });
      if (url.searchParams.has('mode'))
        return reply({ error: 'INVALID_INPUT' }, 400);
      return reply(
        await reviewers().view(a, url.searchParams.get('status') ?? undefined),
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
    let size = 0;
    const parts: Uint8Array[] = [];
    if (req.body)
      for await (const part of req.body) {
        size += part.length;
        if (size > 16384) return reply({ error: 'INVALID_INPUT' }, 400);
        parts.push(part);
      }
    const b = JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      !b ||
      typeof b !== 'object' ||
      Array.isArray(b) ||
      Object.keys(b).length !== 5 ||
      Object.keys(b).some(
        (k) =>
          !['command', 'target', 'operation', 'revision', 'body'].includes(k),
      ) ||
      typeof b['command'] !== 'string' ||
      typeof b['target'] !== 'string' ||
      !['save', 'approve', 'suspend', 'calibrate'].includes(
        String(b['operation']),
      ) ||
      typeof b['revision'] !== 'number'
    )
      return reply({ error: 'INVALID_INPUT' }, 400);
    return reply(
      await reviewers().command(a, {
        command: b['command'],
        target: b['target'],
        operation: b['operation'] as
          'save' | 'approve' | 'suspend' | 'calibrate',
        revision: b['revision'],
        body: b['body'],
      }),
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
          code === '40001'
            ? 'CONFLICT'
            : code === '42501'
              ? 'FORBIDDEN'
              : code === 'INVALID_INPUT' || code?.startsWith('22')
                ? 'INVALID_INPUT'
                : 'UNAVAILABLE',
      },
      code === '40001'
        ? 409
        : code === '42501'
          ? 403
          : code === 'INVALID_INPUT' ||
              code?.startsWith('22') ||
              e instanceof SyntaxError
            ? 400
            : 503,
    );
  }
}
