import 'server-only';
import { createCommitteeService } from '@capstone/domain/committee-engine';
import { loadAccountMailConfig } from '@capstone/config/account-mail';
import { createNativeStorage } from '@capstone/storage/native';
import { DatabaseError } from '@capstone/db';
import { tokenDigest } from '@capstone/db/account-mail-crypto';
import { currentAccount } from '../auth/server';
import { nativeFileHandler, privateFileHeaders } from '../native-files/server';
import { z } from 'zod';
let service: Promise<ReturnType<typeof createCommitteeService>> | undefined;
export function committee() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    env = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(env))
    throw Error('INVALID_ENVIRONMENT');
  return (service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    env as 'local' | 'test' | 'production',
  ).then((storage) =>
    createCommitteeService(
      process.env['DATABASE_URL'] ?? '',
      loadAccountMailConfig(),
      async (f) =>
        storage.verify(f.key, { size: Number(f.size), sha256: f.sha256 }),
    ),
  ));
}
const cookieName = (iid: string) => 'capstone_committee_' + iid;
function session(request: Request, iid: string) {
  const value = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName(iid) + '='))
    ?.split('=')[1];
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
const reply = (status: number, value: unknown) =>
  Response.json(value, { status, headers: privateFileHeaders });
const manage = z
  .object({
    submission: z.uuid(),
    revision: z.number().int().nonnegative(),
    operation: z.enum(['invite', 'resend', 'revoke']),
    invitation: z.uuid().optional(),
    email: z.string().max(254).optional(),
    name: z.string().max(200).optional(),
    locale: z.enum(['en', 'ar']),
    reason: z.string().max(1000),
    command: z.uuid(),
  })
  .strict();
const guest = z.discriminatedUnion('operation', [
  z
    .object({ operation: z.literal('end-session'), invitation: z.uuid() })
    .strict(),
  z
    .object({
      operation: z.literal('challenge'),
      invitation: z.uuid(),
      token: z.string().max(100),
      email: z.string().max(254),
    })
    .strict(),
  z
    .object({
      operation: z.literal('verify'),
      invitation: z.uuid(),
      token: z.string().max(100),
      email: z.string().max(254),
      code: z.string().regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({
      operation: z.enum(['save', 'finalize']),
      invitation: z.uuid(),
      revision: z.number().int().nonnegative(),
      payload: z.unknown(),
      command: z.uuid(),
    })
    .strict(),
]);
const governance = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('amendment.authorize'),
      invitation: z.uuid(),
      head: z.uuid(),
      reason: z.string().trim().min(20).max(2000),
      command: z.uuid(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('discrepancy.explain'),
      case: z.uuid(),
      result: z.uuid(),
      reason: z.string().trim().min(20).max(2000),
      command: z.uuid(),
    })
    .strict(),
]);
export async function committeeGovernance(request: Request) {
  try {
    const a = await currentAccount(request.headers);
    if (
      !a ||
      a.role !== 'university_admin' ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return reply(404, { code: 'NOT_FOUND' });
    const s = await committee();
    if (request.method === 'GET') return reply(200, await s.governance(a));
    const c = governance.parse(await body(request));
    return reply(
      200,
      c.operation === 'amendment.authorize'
        ? await s.authorizeAmendment(a, c)
        : await s.explain(a, c),
    );
  } catch (e) {
    return reply(
      e instanceof z.ZodError
        ? 400
        : e instanceof DatabaseError && e.sqlState === '40001'
          ? 409
          : 404,
      { code: 'GOVERNANCE_UNAVAILABLE' },
    );
  }
}
async function body(request: Request) {
  if (
    request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
    !request.headers.get('content-type')?.startsWith('application/json') ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw Error('FORBIDDEN');
  const reader = request.body?.getReader();
  if (!reader) throw Error('INVALID_INPUT');
  let n = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const v = await reader.read();
      if (v.done) break;
      n += v.value.byteLength;
      if (n > 131072) {
        await reader.cancel();
        throw Error('BODY_LIMIT');
      }
      chunks.push(v.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(
    new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)),
  ) as unknown;
}
export async function committeeHandler(request: Request, supervisor = false) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return reply(403, { code: 'FORBIDDEN' });
    const s = await committee(),
      u = new URL(request.url);
    if (supervisor) {
      const a = await currentAccount(request.headers);
      if (!a || a.role !== 'faculty_supervisor')
        return reply(404, { code: 'NOT_FOUND' });
      if (
        request.headers.get('X-Workspace-Actor') &&
        request.headers.get('X-Workspace-Actor') !== a.id
      )
        return reply(404, { code: 'NOT_FOUND' });
      if (request.method === 'GET') {
        if (
          [...u.searchParams.keys()].some(
            (k) => !['submission', 'command'].includes(k),
          ) ||
          [...u.searchParams.keys()].some(
            (k) => u.searchParams.getAll(k).length !== 1,
          )
        )
          return reply(400, { code: 'INVALID_INPUT', knownRejected: true });
        const id = z.uuid().parse(u.searchParams.get('submission'));
        const command = u.searchParams.get('command');
        return reply(
          200,
          command
            ? await s.receipt(a, id, z.uuid().parse(command))
            : await s.status(a, id),
        );
      }
      if (request.method !== 'POST' || u.search)
        return reply(405, { code: 'METHOD_NOT_ALLOWED' });
      return reply(200, await s.manage(a, manage.parse(await body(request))));
    }
    if (request.method === 'GET') {
      const iid = z.uuid().parse(u.searchParams.get('invitation'));
      return reply(200, await s.read(iid, session(request, iid)));
    }
    if (request.method !== 'POST' || u.search)
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    const c = guest.parse(await body(request)),
      ip =
        request.headers.get('cf-connecting-ip') ??
        request.headers.get('x-real-ip') ??
        'direct';
    if (c.operation === 'end-session') {
      await s.endSession(c.invitation, session(request, c.invitation));
      const r = reply(200, { ended: true });
      r.headers.append(
        'Set-Cookie',
        `${cookieName(c.invitation)}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${new URL(process.env['AUTH_BASE_URL'] ?? 'http://localhost').protocol === 'https:' ? '; Secure' : ''}`,
      );
      return r;
    }
    if (c.operation === 'challenge')
      return reply(202, await s.challenge(c.invitation, c.token, c.email, ip));
    if (c.operation === 'verify') {
      const value = await s.verify(c.invitation, c.token, c.email, c.code, ip);
      if (!value) return reply(400, { code: 'VERIFICATION_UNAVAILABLE' });
      const r = reply(200, { verified: true });
      r.headers.append(
        'Set-Cookie',
        `${cookieName(c.invitation)}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=7200${new URL(process.env['AUTH_BASE_URL'] ?? 'http://localhost').protocol === 'https:' ? '; Secure' : ''}`,
      );
      return r;
    }
    return reply(
      200,
      await s.write(
        c.invitation,
        session(request, c.invitation),
        c.revision,
        c.payload,
        c.command,
        c.operation === 'finalize',
      ),
    );
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    const bad =
      e instanceof z.ZodError ||
      e instanceof SyntaxError ||
      code === 'INVALID_INPUT' ||
      code === 'SUPERVISOR_COMMITTEE_CONFLICT' ||
      (e instanceof DatabaseError && (e.sqlState ?? '').startsWith('22'));
    const denied =
      code === 'NOT_FOUND' ||
      (e instanceof DatabaseError &&
        ['P0002', '42501'].includes(e.sqlState ?? ''));
    return reply(
      code === 'FORBIDDEN'
        ? 403
        : code === 'BODY_LIMIT'
          ? 413
          : bad
            ? 400
            : denied
              ? 404
              : code === 'EVIDENCE_UNAVAILABLE'
                ? 409
                : e instanceof DatabaseError && e.sqlState === '40001'
                  ? 409
                  : 503,
      {
        knownRejected:
          bad ||
          denied ||
          code === 'EVIDENCE_UNAVAILABLE' ||
          (e instanceof DatabaseError &&
            ['40001', '40P01'].includes(e.sqlState ?? '')),
        code:
          code === 'EVIDENCE_UNAVAILABLE'
            ? 'EVIDENCE_UNAVAILABLE'
            : code === 'SUPERVISOR_COMMITTEE_CONFLICT'
              ? code
              : bad
                ? 'INVALID_INPUT'
                : denied
                  ? 'NOT_FOUND'
                  : e instanceof DatabaseError && e.sqlState === '40001'
                    ? 'CONFLICT'
                    : 'REQUEST_UNAVAILABLE',
      },
    );
  }
}
export async function committeeFiles(request: Request) {
  const iid = new URL(request.url).searchParams.get('invitation');
  if (!iid || !z.uuid().safeParse(iid).success)
    return reply(404, { code: 'NOT_FOUND' });
  const value = session(request, iid);
  if (!value) return reply(404, { code: 'NOT_FOUND' });
  return nativeFileHandler(request, 'committee', undefined, {
    kind: 'committee-guest',
    invitation: iid,
    sessionHash: tokenDigest(value),
  });
}
