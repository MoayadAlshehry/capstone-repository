import 'server-only';
import pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/node-postgres';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { APIError } from 'better-auth/api';
import { createRuntimeDatabase } from './index.js';
import { validNewPassword, newPasswordPolicy } from './password-policy.js';
import {
  authUser,
  authAccount,
  authSession,
  authVerification,
} from './auth-schema.js';
export function authPasswordHash(password: string): Promise<string> {
  return hashPassword(password);
}
export function authPasswordVerify(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  return verifyPassword(input);
}
export interface AccountView {
  id: string;
  name: string;
  email: string;
  role: string;
  universityId: string | null;
  university: string | null;
  universityAr: string | null;
  department: string | null;
  status: string;
  locale: 'en' | 'ar';
  partnerStatus: string | null;
  sessionId: string;
  sessionExpiresAt: string;
}
export interface AuthConfiguration {
  databaseUrl: string;
  secret: string;
  baseURL: string;
  environment: 'local' | 'test' | 'production';
  localProvisioning?: boolean;
  localPublicOrigin?: string;
}
export interface Authentication {
  handler(request: Request): Promise<Response>;
  account(headers: Headers): Promise<AccountView | null>;
  identity(headers: Headers): Promise<string | null>;
  close(): Promise<void>;
}
const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
};
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: privateHeaders });
export function validAuthConfiguration(config: AuthConfiguration) {
  let url: URL;
  try {
    url = new URL(config.baseURL);
  } catch {
    throw Error('Invalid authentication configuration');
  }
  if (
    !/^[A-Za-z0-9_-]{43,128}$/.test(config.secret) ||
    url.origin !== config.baseURL ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (config.environment === 'production' &&
      (url.protocol !== 'https:' || config.localProvisioning)) ||
    (config.localPublicOrigin !== undefined &&
      (config.environment !== 'local' ||
        config.localPublicOrigin !== config.baseURL ||
        url.protocol !== 'https:' ||
        config.localProvisioning)) ||
    (config.environment !== 'production' &&
      !['localhost', '127.0.0.1'].includes(url.hostname) &&
      !(
        config.environment === 'local' &&
        config.localPublicOrigin === config.baseURL &&
        url.protocol === 'https:'
      ))
  )
    throw Error('Invalid authentication configuration');
  return url;
}
// Bounded single-process failed-login control. Keys are SHA-256, not logged emails.
export class CredentialWindow {
  private failures = new Map<string, { start: number; count: number }>();
  constructor(
    private now: () => number = Date.now,
    private max = 10,
    private windowMs = 60000,
  ) {}
  attempt(email: string) {
    const key = createHash('sha256').update(email).digest('hex'),
      now = this.now();
    let row = this.failures.get(key);
    if (!row || now - row.start >= this.windowMs) {
      row = { start: now, count: 0 };
      this.failures.delete(key);
      if (this.failures.size >= 10000)
        this.failures.delete(this.failures.keys().next().value!);
      this.failures.set(key, row);
    }
    if (row.count >= this.max) return false;
    row.count++;
    return true;
  }
  success(email: string) {
    this.failures.delete(createHash('sha256').update(email).digest('hex'));
  }
}
export function createAuthentication(
  config: AuthConfiguration,
): Authentication {
  const base = validAuthConfiguration(config),
    runtime = createRuntimeDatabase(config.databaseUrl);
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 4,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 5000,
  });
  pool.on('error', () => {});
  const auth = betterAuth({
    appName: 'CAPSTONE REPOSITORY',
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(drizzle(pool), {
      provider: 'pg',
      schema: {
        user: authUser,
        account: authAccount,
        session: authSession,
        verification: authVerification,
      },
    }),
    trustedOrigins: [config.baseURL],
    telemetry: { enabled: false },
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
      minPasswordLength: 15,
      maxPasswordLength: 256,
    },
    session: {
      expiresIn: 86400,
      updateAge: 3600,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      storeSessionInDatabase: true,
    },
    account: { accountLinking: { enabled: false } },
    advanced: {
      database: { generateId: () => randomUUID() },
      useSecureCookies: base.protocol === 'https:',
      cookiePrefix: 'capstone-auth',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: [] },
    },
    rateLimit: {
      enabled: true,
      storage: 'memory',
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 100 } },
    },
    disabledPaths: [
      '/sign-up/email',
      '/update-user',
      '/change-email',
      '/delete-user',
      '/request-password-reset',
      '/reset-password',
      '/verify-email',
      '/send-verification-email',
      '/sign-in/social',
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const rows = (
              await pool.query<{ account_status: string }>(
                "SELECT u.account_status FROM app.users u LEFT JOIN app.universities v ON v.id=u.university_id WHERE u.id=$1 AND (u.university_id IS NULL OR v.status='active')",
                [session.userId],
              )
            ).rows;
            if (rows[0]?.account_status !== 'active')
              throw new APIError('UNAUTHORIZED', {
                message: 'Invalid credentials',
              });
            return { data: session };
          },
        },
      },
    },
  });
  const window = new CredentialWindow();
  async function account(headers: Headers): Promise<AccountView | null> {
    try {
      const session = await auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      });
      if (!session) return null;
      const rows = await runtime.query<{
        id: string;
        full_name: string;
        email: string;
        role_code: string;
        university_id: string | null;
        university: string | null;
        university_ar: string | null;
        department: string | null;
        account_status: string;
        locale: 'en' | 'ar';
        partner_status: string | null;
      }>(
        `SELECT u.id,u.full_name,u.email,u.role_code,u.university_id,u.account_status,u.locale,u.partner_status,v.name_en AS university,v.name_ar AS university_ar,d.code AS department FROM app.users u LEFT JOIN app.universities v ON v.id=u.university_id LEFT JOIN app.departments d ON d.id=u.department_id AND d.university_id=u.university_id WHERE u.id=$1 AND (u.university_id IS NULL OR v.status='active')`,
        [session.user.id],
      );
      const row = rows[0];
      if (!row || row.account_status !== 'active') return null;
      return {
        id: row.id,
        name: row.full_name,
        email: row.email,
        role: row.role_code,
        universityId: row.university_id,
        university: row.university,
        universityAr: row.university_ar,
        department: row.department,
        status: row.account_status,
        locale: row.locale,
        partnerStatus: row.partner_status,
        sessionId: session.session.id,
        sessionExpiresAt: session.session.expiresAt.toISOString(),
      };
    } catch {
      return null;
    }
  }
  async function handler(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '');
    if (
      ![
        '/sign-in/email',
        '/sign-out',
        '/get-session',
        '/change-password',
        '/locale',
      ].includes(path)
    )
      return reply(404, { code: 'NOT_FOUND' });
    if (request.method !== 'GET' && request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (path !== '/get-session' && request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      request.method === 'POST' &&
      (request.headers.get('origin') !== config.baseURL ||
        !request.headers.get('content-type')?.startsWith('application/json'))
    )
      return reply(403, { code: 'FORBIDDEN' });
    try {
      if (path === '/get-session') {
        const user = await account(request.headers);
        return user
          ? reply(200, {
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                university: user.university,
                status: user.status,
                locale: user.locale,
              },
              session: { expiresAt: user.sessionExpiresAt },
            })
          : reply(401, { code: 'UNAUTHENTICATED' });
      }
      if (path === '/sign-out') {
        const response = await auth.handler(request);
        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries(privateHeaders)) headers.set(k, v);
        return new Response(JSON.stringify({ success: response.ok }), {
          status: response.status,
          headers,
        });
      }
      const body: unknown = await request.json();
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return reply(400, { code: 'INVALID_INPUT' });
      const fields = body as Record<string, unknown>;
      if (path === '/sign-in/email') {
        if (
          Object.keys(fields).some((k) => !['email', 'password'].includes(k)) ||
          typeof fields['email'] !== 'string' ||
          typeof fields['password'] !== 'string' ||
          Array.from(fields['password']).length > newPasswordPolicy.maximum ||
          fields['email'].length > 254
        )
          return reply(400, { code: 'INVALID_INPUT' });
        const email = fields['email'].trim().toLowerCase();
        if (!window.attempt(email)) return reply(429, { code: 'TRY_LATER' });
        const signIn = () =>
          auth.handler(
            new Request(request.url, {
              method: 'POST',
              headers: request.headers,
              body: JSON.stringify({ email, password: fields['password'] }),
            }),
          );
        const identity = (
          await runtime.query<{ id: string }>(
            'SELECT id FROM app.users WHERE email=$1',
            [email],
          )
        )[0];
        const response = identity
          ? await runtime.transactions.run(async (tx) => {
              await tx.query(
                "SELECT pg_advisory_xact_lock(hashtext('auth_identity:' || $1::text))",
                [identity.id],
              );
              return signIn();
            })
          : await signIn();
        if (!response.ok)
          return reply(response.status === 429 ? 429 : 401, {
            code: response.status === 429 ? 'TRY_LATER' : 'INVALID_CREDENTIALS',
          });
        window.success(email);
        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries(privateHeaders)) headers.set(k, v);
        // Never expose Better Auth's raw session token in JSON.
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers,
        });
      }
      const user = await account(request.headers);
      if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
      if (path === '/locale') {
        if (
          Object.keys(fields).some((k) => k !== 'locale') ||
          !['en', 'ar'].includes(String(fields['locale']))
        )
          return reply(400, { code: 'INVALID_INPUT' });
        await runtime.transactions.run(async (tx) => {
          const current = await tx.query<{ account_status: string }>(
            'SELECT account_status FROM app.users WHERE id=$1 FOR UPDATE',
            [user.id],
          );
          if (current[0]?.account_status !== 'active') throw Error('Inactive');
          const valid = await tx.query(
            'SELECT id FROM app.auth_sessions WHERE id=$1 AND user_id=$2 AND expires_at>now() FOR UPDATE',
            [user.sessionId, user.id],
          );
          if (!valid.length) throw Error('Revoked');
          await tx.query(
            'UPDATE app.users SET locale=$2,updated_at=now() WHERE id=$1',
            [user.id, fields['locale']],
          );
        });
        return reply(200, { success: true });
      }
      if (
        Object.keys(fields).some(
          (k) => !['currentPassword', 'newPassword'].includes(k),
        ) ||
        typeof fields['currentPassword'] !== 'string' ||
        typeof fields['newPassword'] !== 'string' ||
        fields['currentPassword'].length > 256 ||
        !validNewPassword(fields['newPassword'])
      )
        return reply(400, { code: 'INVALID_INPUT' });
      const currentPassword = fields['currentPassword'],
        newPassword = fields['newPassword'];
      if (!window.attempt('password:' + user.id))
        return reply(429, { code: 'TRY_LATER' });
      const changed = await runtime.transactions.run(async (tx) => {
        await tx.query(
          "SELECT pg_advisory_xact_lock(hashtext('auth_identity:' || $1::text))",
          [user.id],
        );
        const actor = (
          await tx.query<{
            role_code: string;
            university_id: string | null;
            account_status: string;
          }>(
            'SELECT role_code,university_id,account_status FROM app.users WHERE id=$1 FOR UPDATE',
            [user.id],
          )
        )[0];
        if (actor?.account_status !== 'active') throw Error('Inactive');
        const sessions = await tx.query(
          'SELECT id FROM app.auth_sessions WHERE id=$1 AND user_id=$2 AND expires_at>now() FOR UPDATE',
          [user.sessionId, user.id],
        );
        if (!sessions.length) throw Error('Revoked');
        const credential = (
          await tx.query<{ id: string; password: string }>(
            "SELECT id,password FROM app.auth_accounts WHERE user_id=$1 AND provider_id='credential' FOR UPDATE",
            [user.id],
          )
        )[0];
        if (
          !credential ||
          !(await verifyPassword({
            hash: credential.password,
            password: currentPassword,
          }))
        )
          return false;
        const hashed = await hashPassword(newPassword);
        await tx.query(
          'UPDATE app.auth_accounts SET password=$2,updated_at=now() WHERE id=$1',
          [credential.id, hashed],
        );
        await tx.query(
          'DELETE FROM app.auth_sessions WHERE user_id=$1 AND id<>$2',
          [user.id, user.sessionId],
        );
        const auditId = randomUUID();
        await tx.query(
          `INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES($1,$2,$3,'user',$4,'auth.password.change','user',$2,'{}','{"scope":"own_account"}','Authenticated password change',$5,$6)`,
          [
            auditId,
            user.id,
            actor.role_code,
            actor.university_id,
            randomUUID(),
            randomUUID(),
          ],
        );
        await tx.query('SELECT app.credential_immediate_notice($1,$2,$3)', [
          auditId,
          user.id,
          actor.university_id,
        ]);
        await tx.query(
          `INSERT INTO app.outbox_events(event_id,kind) VALUES($1,'core.audit.committed')`,
          [auditId],
        );
        return true;
      });
      if (changed) window.success('password:' + user.id);
      return changed
        ? reply(200, { success: true })
        : reply(400, { code: 'INVALID_CREDENTIALS' });
    } catch {
      return reply(400, { code: 'REQUEST_FAILED' });
    }
  }
  return {
    handler,
    account,
    identity: async (headers) => (await account(headers))?.id ?? null,
    close: async () => {
      await Promise.all([pool.end(), runtime.close()]);
    },
  };
}
