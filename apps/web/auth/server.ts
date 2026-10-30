import 'server-only';
import {
  createAuthentication,
  type Authentication,
  type AccountView,
} from '@capstone/db/auth';
import { authorize, roleCode } from '@capstone/domain';
import type { ServerIdentitySource } from '@capstone/domain/server';
import { headers } from 'next/headers';
let auth: Authentication | undefined;
export function authentication() {
  const environment = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(environment))
    throw Error('Invalid auth environment');
  auth ??= createAuthentication({
    databaseUrl: process.env['DATABASE_URL'] ?? '',
    secret: process.env['AUTH_SECRET'] ?? '',
    baseURL: process.env['AUTH_BASE_URL'] ?? '',
    environment: environment as 'local' | 'test' | 'production',
    localProvisioning: process.env['LOCAL_PROVISIONING'] === 'true',
    ...(process.env['LOCAL_PUBLIC_ORIGIN']
      ? { localPublicOrigin: process.env['LOCAL_PUBLIC_ORIGIN'] }
      : {}),
  });
  return auth;
}
export async function currentAccount(
  input?: Headers,
): Promise<AccountView | null> {
  const user = await authentication().account(input ?? (await headers()));
  if (!user) return null;
  const role = roleCode(user.role);
  if (!role) return null;
  return authorize(
    {
      userId: user.id,
      role,
      universityId: user.universityId,
      active: user.status === 'active',
      partnerApproved: user.partnerStatus === 'approved',
      correlationId: 'account-read',
    },
    'account.read',
    {
      kind: 'account',
      userId: user.id,
      universityId: user.universityId,
      visible: true,
    },
  ) === 'allow'
    ? user
    : null;
}
export function sessionIdentity(input: Headers): ServerIdentitySource {
  return { userId: async () => (await currentAccount(input))?.id ?? null };
}
