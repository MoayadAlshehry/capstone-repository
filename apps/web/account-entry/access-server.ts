import 'server-only';
import { accountAccess } from './access-service';
import { currentAccount } from '../auth/server';
import { accountMail, boundedCredentialJson } from './server';
export { accountAccess } from './access-service';
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
export async function accountAccessHandler(request: Request) {
  try {
    const user = await currentAccount(request.headers);
    if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
    if (user.role !== 'university_admin' || !user.universityId)
      return reply(403, { code: 'FORBIDDEN' });
    const url = new URL(request.url),
      target = url.searchParams.get('person') ?? '',
      command = url.searchParams.get('command') ?? undefined;
    if (
      [...url.searchParams.keys()].some(
        (k) => !['person', 'command'].includes(k),
      )
    )
      return reply(400, { code: 'INVALID_INPUT' });
    const person = await accountAccess().person(user, target, command);
    if (request.method === 'GET') return reply(200, person);
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    const body = await boundedCredentialJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return reply(400, { code: 'INVALID_INPUT' });
    const b = body as Record<string, unknown>;
    if (
      Object.keys(b).some(
        (k) => !['operation', 'command', 'message', 'purpose'].includes(k),
      )
    )
      return reply(400, { code: 'INVALID_INPUT' });
    if (b['operation'] === 'issue') {
      const purpose =
        person.status === 'inactive' ? 'ACCOUNT_SETUP' : 'PASSWORD_RESET';
      if (b['purpose'] !== purpose)
        return reply(409, { code: 'STATE_CHANGED' });
      if (person.status === 'suspended')
        return reply(409, { code: 'INELIGIBLE' });
      return reply(
        200,
        await accountMail().issue(
          user,
          person.id,
          purpose,
          String(b['command']),
        ),
      );
    }
    if (b['operation'] === 'retry') {
      if (!person.messages.some((m) => m.id === b['message'] && m.canRetry))
        return reply(409, { code: 'INELIGIBLE' });
      return reply(200, await accountMail().retry(user, String(b['message'])));
    }
    return reply(400, { code: 'INVALID_INPUT' });
  } catch {
    return reply(404, { code: 'NOT_AVAILABLE' });
  }
}
