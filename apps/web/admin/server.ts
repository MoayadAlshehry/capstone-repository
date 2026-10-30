import 'server-only';
import { createAdministration } from '@capstone/db/administration';
import {
  authorize,
  roleCode,
  validAdministrationInput,
} from '@capstone/domain';
import { authentication, currentAccount } from '../auth/server';
import { DatabaseError } from '@capstone/db';
import { accountMail, boundedCredentialJson } from '../account-entry/server';
import { randomUUID } from 'node:crypto';
let service: ReturnType<typeof createAdministration> | undefined;
export function administration() {
  service ??= createAdministration(
    process.env['DATABASE_URL'] ?? '',
    authentication(),
  );
  return service;
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
export async function administrationHandler(request: Request) {
  const path = new URL(request.url).pathname;
  if (
    request.method === 'POST' &&
    (request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json'))
  )
    return reply(403, { code: 'FORBIDDEN' });
  try {
    if (path === '/api/lifecycle' && request.method === 'POST') {
      const body: unknown = await boundedCredentialJson(request);
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return reply(400, { code: 'INVALID_INPUT' });
      const fields = body as Record<string, unknown>;
      const consume = fields['operation'] === 'complete';
      if (!['inspect', 'complete'].includes(String(fields['operation'])))
        return reply(400, { code: 'INVALID_INPUT' });
      delete fields['operation'];
      if (consume) {
        if (
          Object.keys(fields).some(
            (k) =>
              ![
                'token',
                'email',
                'purpose',
                'password',
                'confirmation',
              ].includes(k),
          ) ||
          !['activation', 'reset'].includes(String(fields['purpose'])) ||
          typeof fields['password'] !== 'string' ||
          fields['password'] !== fields['confirmation']
        )
          return reply(400, { code: 'INVALID_INPUT' });
        await administration().lifecycle(
          {
            token: fields['token'],
            email: fields['email'],
            purpose: fields['purpose'],
          },
          false,
        );
        const result = await accountMail().complete(
          fields['token'],
          fields['purpose'] === 'activation'
            ? 'ACCOUNT_SETUP'
            : 'PASSWORD_RESET',
          fields['password'],
          'legacy-boundary',
        );
        if (!result.completed) throw Error('INVALID_CREDENTIAL');
        return reply(200, { success: true });
      }
      return reply(200, await administration().lifecycle(fields, consume));
    }
    const user = await currentAccount(request.headers);
    if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
    if (request.method === 'GET')
      return reply(
        200,
        await administration().view(
          user,
          new URL(request.url).searchParams.get('university') ?? undefined,
        ),
      );
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    const body: unknown = await boundedCredentialJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return reply(400, { code: 'INVALID_INPUT' });
    const input = body as Record<string, unknown>,
      command = String(input['command']);
    if (
      Object.keys(input).some((k) => !['command', 'fields'].includes(k)) ||
      !validAdministrationInput(command, input['fields'])
    )
      return reply(400, { code: 'INVALID_INPUT' });
    const role = roleCode(user.role);
    if (!role) return reply(403, { code: 'FORBIDDEN' });
    const action =
      command === 'profile.update'
        ? 'admin.profile'
        : command.startsWith('university.') ||
            command.startsWith('administrator.')
          ? 'admin.platform'
          : 'admin.tenant';
    if (
      authorize(
        {
          userId: user.id,
          role,
          universityId: user.universityId,
          active: true,
          partnerApproved: user.partnerStatus === 'approved',
          correlationId: 'administration',
        },
        action,
        {
          kind: action === 'admin.profile' ? 'account' : 'institution',
          userId: user.id,
          universityId: user.universityId,
          visible: true,
        },
      ) !== 'allow'
    )
      return reply(403, { code: 'FORBIDDEN' });
    if (
      ['activation.issue', 'reset.issue', 'administrator.activation'].includes(
        command,
      )
    )
      return reply(
        200,
        await accountMail().issue(
          user,
          String((input['fields'] as Record<string, unknown>)['id']),
          command === 'reset.issue' ? 'PASSWORD_RESET' : 'ACCOUNT_SETUP',
          randomUUID(),
        ),
      );
    return reply(
      200,
      await administration().command(user, command, input['fields']),
    );
  } catch (error) {
    // Driver text/IDs and supplied values never escape this boundary.
    const message = error instanceof Error ? error.message : '';
    const status =
      message === 'NOT_FOUND'
        ? 404
        : message === 'FORBIDDEN'
          ? 403
          : message === 'TRY_LATER'
            ? 429
            : message === 'CONFLICT'
              ? 409
              : error instanceof DatabaseError &&
                  ['23505', '40001'].includes(error.sqlState ?? '')
                ? 409
                : 400;
    return reply(status, {
      code:
        status === 404
          ? 'NOT_FOUND'
          : status === 403
            ? 'FORBIDDEN'
            : status === 409
              ? 'CONFLICT'
              : 'REQUEST_FAILED',
    });
  }
}
