import 'server-only';
import { createOnboarding } from '@capstone/db/onboarding';
import { DatabaseError } from '@capstone/db';
import { onboardingSchemas } from '@capstone/domain';
import { currentAccount } from '../auth/server';
import { accountMail, boundedCredentialJson } from '../account-entry/server';
let service: ReturnType<typeof createOnboarding> | undefined;
export const onboarding = () =>
  (service ??= createOnboarding(
    process.env['DATABASE_URL'] ?? '',
    accountMail(),
  ));
const reply = (status: number, value: unknown) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Cookie',
    },
  });
export async function onboardingHandler(req: Request) {
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply(401, { code: 'UNAUTHENTICATED' });
    if (!['platform_admin', 'university_admin'].includes(a.role))
      return reply(403, { code: 'FORBIDDEN' });
    const url = new URL(req.url);
    if (req.method === 'GET') {
      if ([...url.searchParams.keys()].some((k) => !['command'].includes(k)))
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(200, {
        receipt: await onboarding().receipt(
          a,
          url.searchParams.get('command') ?? '',
        ),
      });
    }
    if (req.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      req.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !req.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    const input = await boundedCredentialJson(req);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return reply(400, { code: 'INVALID_INPUT' });
    const b = input as Record<string, unknown>;
    if (
      Object.keys(b).some(
        (k) => !['command', 'operation', 'payload'].includes(k),
      )
    )
      return reply(400, { code: 'INVALID_INPUT' });
    const operation = String(b['operation']) as keyof typeof onboardingSchemas,
      schema = onboardingSchemas[operation];
    if (!Object.hasOwn(onboardingSchemas, operation) || !schema)
      return reply(400, { code: 'INVALID_INPUT' });
    const parsed = schema.safeParse(b['payload']);
    if (!parsed.success)
      return reply(400, {
        code: 'INVALID_INPUT',
        fields: [...new Set(parsed.error.issues.map((x) => x.path[0]))],
      });
    return reply(
      200,
      await onboarding().command(
        a,
        String(b['command']),
        operation,
        parsed.data,
      ),
    );
  } catch (e) {
    const state = e instanceof DatabaseError ? e.sqlState : undefined;
    return reply(
      state === '42501'
        ? 403
        : state === '23505' || state === '40001'
          ? 409
          : state === '22023'
            ? 400
            : 503,
      {
        code:
          state === '23505'
            ? 'DUPLICATE_CODE'
            : state === '40001'
              ? 'STATE_CONFLICT'
              : state === '42501'
                ? 'FORBIDDEN'
                : 'UNAVAILABLE',
      },
    );
  }
}
export async function administratorAccessHandler(req: Request) {
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply(401, { code: 'UNAUTHENTICATED' });
    if (a.role !== 'platform_admin') return reply(403, { code: 'FORBIDDEN' });
    const u = new URL(req.url);
    if (
      [...u.searchParams.keys()].some((k) => !['person', 'command'].includes(k))
    )
      return reply(400, { code: 'INVALID_INPUT' });
    const p = await onboarding().administratorAccess(
      a,
      u.searchParams.get('person') ?? '',
      u.searchParams.get('command') ?? undefined,
    );
    if (req.method === 'GET') return reply(200, p);
    if (req.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      req.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !req.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    const input = await boundedCredentialJson(req);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return reply(400, { code: 'INVALID_INPUT' });
    const b = input as Record<string, unknown>;
    if (
      Object.keys(b).some(
        (k) => !['operation', 'command', 'message', 'purpose'].includes(k),
      )
    )
      return reply(400, { code: 'INVALID_INPUT' });
    if (b['operation'] === 'issue') {
      const purpose =
        p.status === 'inactive' ? 'ACCOUNT_SETUP' : 'PASSWORD_RESET';
      if (p.status === 'suspended' || b['purpose'] !== purpose)
        return reply(409, { code: 'STATE_CHANGED' });
      return reply(
        200,
        await accountMail().issue(a, p.id, purpose, String(b['command'])),
      );
    }
    if (
      b['operation'] === 'retry' &&
      p.messages.some((m) => m.id === b['message'] && m.canRetry)
    )
      return reply(200, await accountMail().retry(a, String(b['message'])));
    return reply(400, { code: 'INVALID_INPUT' });
  } catch {
    return reply(404, { code: 'NOT_AVAILABLE' });
  }
}
