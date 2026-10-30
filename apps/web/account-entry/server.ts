import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAccountMail } from '@capstone/db/account-mail';
import { loadAccountMailConfig } from '@capstone/config/account-mail';
import { currentAccount } from '../auth/server';
import { accountAccess } from './access-service';
let service: ReturnType<typeof createAccountMail> | undefined;
export function accountMail() {
  return (service ??= createAccountMail(
    process.env['DATABASE_URL'] ?? '',
    loadAccountMailConfig(),
  ));
}
function peer(request: Request) {
  const ip = request.headers.get('x-capstone-client-ip') ?? '',
    sig = request.headers.get('x-capstone-client-signature') ?? '';
  if (ip.length > 64 || !/^[a-f0-9]{64}$/.test(sig)) return 'unknown';
  const expected = createHmac('sha256', process.env['AUTH_SECRET'] ?? '')
    .update(`account-email-ip.v1:${ip}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(sig, 'hex')) ? ip : 'unknown';
}
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export async function boundedCredentialJson(
  request: Request,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw Error('INVALID_INPUT');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 6000) {
      await reader.cancel();
      throw Error('BODY_TOO_LARGE');
    }
    chunks.push(part.value);
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
  );
}
export async function accountMailHandler(request: Request) {
  try {
    if (request.method === 'GET') {
      const user = await currentAccount(request.headers);
      if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
      if (user.role !== 'university_admin')
        return reply(403, { code: 'FORBIDDEN' });
      const target = new URL(request.url).searchParams.get('person');
      if (!target) return reply(400, { code: 'PERSON_REQUIRED' });
      return reply(200, {
        messages: (await accountAccess().person(user, target)).messages,
      });
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    const body: unknown = await boundedCredentialJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return reply(400, { code: 'INVALID_INPUT' });
    const b = body as Record<string, unknown>;
    if (
      Object.keys(b).some(
        (k) =>
          ![
            'operation',
            'email',
            'purpose',
            'returnTo',
            'token',
            'password',
            'target',
            'command',
            'id',
          ].includes(k),
      )
    )
      return reply(400, { code: 'INVALID_INPUT' });
    const ip = peer(request),
      mail = accountMail();
    if (b['operation'] === 'request')
      return reply(
        200,
        await mail.request(b['email'], b['purpose'], ip, b['returnTo']),
      );
    if (b['operation'] === 'inspect')
      return reply(200, await mail.inspect(b['token'], b['purpose'], ip));
    if (b['operation'] === 'complete')
      return reply(
        200,
        await mail.complete(b['token'], b['purpose'], b['password'], ip),
      );
    const user = await currentAccount(request.headers);
    if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
    if (b['operation'] === 'issue')
      return reply(
        200,
        await mail.issue(
          user,
          String(b['target']),
          b['purpose'] as 'ACCOUNT_SETUP' | 'PASSWORD_RESET',
          String(b['command']),
          b['returnTo'],
        ),
      );
    if (b['operation'] === 'retry')
      return reply(200, await mail.retry(user, String(b['id'])));
    return reply(400, { code: 'INVALID_INPUT' });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return reply(
      code === 'FORBIDDEN' ? 403 : code === 'TRY_LATER' ? 429 : 400,
      {
        code: [
          'FORBIDDEN',
          'TRY_LATER',
          'PASSWORD_LENGTH',
          'MAIL_NOT_CONFIGURED',
        ].includes(code)
          ? code
          : 'REQUEST_FAILED',
      },
    );
  }
}
