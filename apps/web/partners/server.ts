import 'server-only';
import {
  createPartners,
  partnerStates,
  type PartnerStatus,
} from '@capstone/db/partners';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
let service: ReturnType<typeof createPartners> | undefined;
export function partners() {
  return (service ??= createPartners(process.env['DATABASE_URL'] ?? ''));
}
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
async function boundedBody(request: Request): Promise<unknown> {
  if (
    Number(request.headers.get('content-length') ?? 0) > 8192 ||
    !request.body
  )
    throw Error('INVALID_INPUT');
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw Error('INVALID_INPUT');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  ) as unknown;
}
export async function partnerHandler(request: Request) {
  if (
    request.method === 'POST' &&
    (request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json'))
  )
    return reply(403, { code: 'FORBIDDEN' });
  try {
    const url = new URL(request.url);
    if (url.pathname === '/api/partners/register') {
      if (request.method !== 'POST')
        return reply(405, { code: 'METHOD_NOT_ALLOWED' });
      if (Number(request.headers.get('content-length') ?? 0) > 8192)
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(201, await partners().register(await boundedBody(request)));
    }
    const user = await currentAccount(request.headers);
    if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
    if (
      request.headers.has('X-Workspace-Actor') &&
      request.headers.get('X-Workspace-Actor') !== user.id
    )
      return reply(403, { code: 'FORBIDDEN' });
    if (!['partner', 'platform_admin'].includes(user.role))
      return reply(403, { code: 'FORBIDDEN' });
    if (request.method === 'GET') {
      const filter = url.searchParams.get('status');
      if (
        [...url.searchParams.keys()].some((k) => k !== 'status') ||
        (filter !== null && !partnerStates.includes(filter as PartnerStatus))
      )
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(
        200,
        await partners().view(
          user,
          (filter as PartnerStatus | undefined) ?? undefined,
        ),
      );
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    return reply(
      200,
      await partners().command(user, await boundedBody(request)),
    );
  } catch (error) {
    const code = error instanceof DatabaseError ? error.sqlState : undefined;
    const message = error instanceof Error ? error.message : '';
    const status =
      code === '42501'
        ? 403
        : code === '28000'
          ? 401
          : code === '40001'
            ? 409
            : message === 'TRY_LATER'
              ? 429
              : code && !['22023', '23514', '23505'].includes(code)
                ? 503
                : 400;
    return reply(status, {
      code:
        status === 403
          ? 'FORBIDDEN'
          : status === 409
            ? 'CONFLICT'
            : status === 429
              ? 'TRY_LATER'
              : 'REQUEST_FAILED',
    });
  }
}
