import 'server-only';
import { createPartnerAccess } from '@capstone/db/grants';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
import type { AccountView } from '@capstone/db/auth';
import { nativeReader } from '../native-files/server';
import { knownUnavailableFile } from '../semester/private-read-error';
let service: ReturnType<typeof createPartnerAccess> | undefined;
export function partnerAccess() {
  return (service ??= createPartnerAccess(process.env['DATABASE_URL'] ?? ''));
}
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export async function accessHandler(request: Request) {
  let actor: AccountView | null = null,
    input: unknown;
  if (
    request.method === 'POST' &&
    (request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json'))
  )
    return reply(403, { code: 'FORBIDDEN' });
  try {
    const user = await currentAccount(request.headers);
    if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
    actor = user;
    if (
      request.headers.has('X-Workspace-Actor') &&
      request.headers.get('X-Workspace-Actor') !== user.id
    )
      return reply(403, { code: 'FORBIDDEN' });
    if (request.method === 'GET') {
      const u = new URL(request.url);
      if (
        [...u.searchParams.keys()].some((k) => k !== 'grant') ||
        u.searchParams.getAll('grant').length > 1
      )
        return reply(400, { code: 'INVALID_INPUT' });
      const view = await partnerAccess().view(user);
      if (u.searchParams.has('grant')) {
        if (user.role !== 'partner') return reply(404, { code: 'NOT_FOUND' });
        const grant = view.grants.find(
          (g) => g.id === u.searchParams.get('grant'),
        );
        if (!grant) return reply(404, { code: 'NOT_FOUND' });
        let usable = false;
        if (grant.canRead)
          try {
            await (
              await nativeReader()
            ).list(
              { kind: 'partner-grant', actor: user, grant: grant.id },
              grant.project,
              grant.version,
            );
            usable = true;
          } catch (error) {
            if (!knownUnavailableFile(error)) throw error;
          }
        return reply(200, { usable, grant: { ...grant, canRead: usable } });
      }
      return reply(200, view);
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    const reader = request.body?.getReader();
    if (!reader) throw Error('INVALID_INPUT');
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const c = await reader.read();
        if (c.done) break;
        size += c.value.byteLength;
        if (size > 16000) {
          await reader.cancel();
          throw Error('INVALID_INPUT');
        }
        chunks.push(c.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let n = 0;
    for (const c of chunks) {
      bytes.set(c, n);
      n += c.length;
    }
    input = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
    return reply(200, await partnerAccess().command(user, input));
  } catch (e) {
    const state = e instanceof DatabaseError ? e.sqlState : undefined;
    if (state === '40001' && actor) {
      try {
        const existing = await partnerAccess().existing(actor, input);
        if (existing) return reply(200, existing);
      } catch {}
    }
    return reply(
      e instanceof DatabaseError && !state
        ? 503
        : state === '42501'
          ? 403
          : state === '40001' || state === '23505'
            ? 409
            : state && state !== '22023'
              ? 503
              : state === '22023' ||
                  e instanceof SyntaxError ||
                  (e instanceof Error && e.message === 'INVALID_INPUT')
                ? 400
                : 503,
      {
        code:
          state === '42501'
            ? 'FORBIDDEN'
            : state === '40001' || state === '23505'
              ? 'CONFLICT'
              : 'REQUEST_FAILED',
      },
    );
  }
}
