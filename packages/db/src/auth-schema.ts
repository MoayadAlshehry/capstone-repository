import 'server-only';
import { pgSchema, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
const app = pgSchema('app');
const date = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3, mode: 'date' });
// Better Auth's user is the existing domain identity, never a second user table.
export const authUser = app.table('users', {
  id: uuid('id').primaryKey(),
  name: text('full_name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('auth_email_verified').notNull(),
  image: text('auth_image'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
});
export const authAccount = app.table('auth_accounts', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  scope: text('scope'),
  accessTokenExpiresAt: date('access_token_expires_at'),
  refreshTokenExpiresAt: date('refresh_token_expires_at'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
});
export const authSession = app.table('auth_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  token: text('token').notNull(),
  expiresAt: date('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
});
export const authVerification = app.table('auth_verifications', {
  id: uuid('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: date('expires_at').notNull(),
  createdAt: date('created_at').notNull(),
  updatedAt: date('updated_at').notNull(),
});
