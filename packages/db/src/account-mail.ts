import 'server-only';
import { validNewPassword } from './password-policy.js';
import { randomUUID } from 'node:crypto';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import { authPasswordHash, type AccountView } from './auth.js';
import {
  encryptAccountMail,
  newAccountToken,
  tokenDigest,
} from './account-mail-crypto.js';
type Purpose = 'ACCOUNT_SETUP' | 'PASSWORD_RESET';
interface Config {
  mode: string;
  appOrigin: string;
  key: string;
  keyId: string;
}
interface Target {
  id: string;
  university: string | null;
  name: string;
  email: string;
  locale: 'en' | 'ar';
  status?: string;
  returnTo?: string;
  expiresAt?: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeAccountReturn(value: unknown, locale = 'en') {
  if (
    typeof value !== 'string' ||
    value.length > 1200 ||
    !/^\/(en|ar)\//.test(value) ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return `/${locale}/workspace`;
  try {
    if (/[\\\u0000-\u001f]/.test(decodeURIComponent(value)))
      return `/${locale}/workspace`;
    const url = new URL(value, 'https://account.invalid');
    if (
      url.origin !== 'https://account.invalid' ||
      url.username ||
      url.password ||
      url.hash
    )
      return `/${locale}/workspace`;
    return url.pathname + url.search;
  } catch {
    return `/${locale}/workspace`;
  }
}
export function createAccountMail(databaseUrl: string, config: Config) {
  const db = createRuntimeDatabase(databaseUrl);
  async function rate(key: string, maximum = 10, seconds = 60) {
    return (
      (
        await db.query<{ ok: boolean }>(
          'SELECT app.account_email_rate($1,$2,$3) AS ok',
          [tokenDigest(key), maximum, seconds],
        )
      )[0]?.ok === true
    );
  }
  async function queueInTransaction(
    tx: TransactionScope,
    target: Target,
    purpose: Purpose,
    actor: AccountView | null,
    command: string = randomUUID(),
    returnTo?: unknown,
  ) {
    if (config.mode === 'disabled') throw Error('MAIL_NOT_CONFIGURED');
    if (!uuid.test(command) || !uuid.test(target.id))
      throw Error('INVALID_INPUT');
    const token = newAccountToken(),
      id = randomUUID(),
      destination = safeAccountReturn(returnTo, target.locale),
      link = `${config.appOrigin}/${target.locale}/${purpose === 'ACCOUNT_SETUP' ? 'setup-account' : 'reset-password'}#token=${token}`;
    const encrypted = encryptAccountMail(
      {
        purpose,
        to: target.email,
        name: target.name,
        locale: target.locale,
        link,
      },
      config.key,
      `${id}|${purpose}|${target.id}`,
    );
    const result = await tx.query<{ id: string }>(
      'SELECT app.account_email_issue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS id',
      [
        actor?.id ?? null,
        actor?.sessionId ?? null,
        target.id,
        purpose,
        tokenDigest(token),
        id,
        command,
        tokenDigest(
          JSON.stringify({ target: target.id, purpose, destination }),
        ),
        encrypted,
        config.keyId,
        destination,
      ],
    );
    return { id: result[0]!.id, state: 'queued' };
  }
  async function request(
    email: unknown,
    purpose: unknown,
    ip: string,
    returnTo?: unknown,
  ) {
    if (purpose !== 'ACCOUNT_SETUP' && purpose !== 'PASSWORD_RESET')
      throw Error('INVALID_INPUT');
    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email)
    )
      throw Error('INVALID_INPUT');
    const address = email.trim().toLowerCase();
    const allowed = await rate(`request-ip:${ip}`);
    const accountAllowed = await rate(
      `request-address:${address}:${purpose}`,
      3,
      3600,
    );
    if (allowed && accountAllowed && config.mode !== 'disabled') {
      const target = (
        await db.query<{ value: Target | null }>(
          'SELECT app.account_email_target($1,$2) AS value',
          [address, purpose],
        )
      )[0]?.value;
      if (target)
        try {
          await db.transactions.run((tx) =>
            queueInTransaction(
              tx,
              target,
              purpose,
              null,
              randomUUID(),
              returnTo,
            ),
          );
        } catch {
          /* same acknowledgement, no account/status disclosure */
        }
    }
    return { accepted: true };
  }
  async function issue(
    actor: AccountView,
    targetId: string,
    purpose: Purpose,
    command: string,
    returnTo?: unknown,
  ) {
    if (
      !uuid.test(targetId) ||
      !uuid.test(command) ||
      !['ACCOUNT_SETUP', 'PASSWORD_RESET'].includes(purpose)
    )
      throw Error('INVALID_INPUT');
    return db.transactions.run(async (tx) => {
      if (
        !(
          await tx.query<{ ok: boolean }>(
            'SELECT app.account_email_operator($1,$2,$3) AS ok',
            [actor.id, actor.sessionId, targetId],
          )
        )[0]?.ok
      )
        throw Error('FORBIDDEN');
      const target = (
        await tx.query<Target>(
          'SELECT id,university_id AS university,full_name AS name,email,locale FROM app.users WHERE id=$1',
          [targetId],
        )
      )[0];
      if (!target) throw Error('NOT_FOUND');
      return queueInTransaction(tx, target, purpose, actor, command, returnTo);
    });
  }
  async function context(token: unknown, purpose: unknown, ip: string) {
    if (!(await rate(`inspect:${ip}`, 30))) throw Error('TRY_LATER');
    if (
      typeof token !== 'string' ||
      (!/^[A-Za-z0-9_-]{43}$/.test(token) &&
        !/^[-a-f0-9]{36}\.[-a-f0-9]{36}\.[a-f0-9]{64}$/.test(token)) ||
      !['ACCOUNT_SETUP', 'PASSWORD_RESET'].includes(String(purpose))
    )
      throw Error('INVALID_INPUT');
    return (
      await db.query<{ value: Target | null }>(
        'SELECT app.account_email_inspect($1,$2) AS value',
        [tokenDigest(token), purpose],
      )
    )[0]?.value;
  }
  async function inspect(token: unknown, purpose: unknown, ip: string) {
    const value = await context(token, purpose, ip);
    return {
      status: value?.status ?? 'unavailable',
      name: value?.status === 'valid' ? value.name : undefined,
      email: value?.status === 'valid' ? value.email : undefined,
      expiresAt: value?.status === 'valid' ? value.expiresAt : undefined,
    };
  }
  async function complete(
    token: unknown,
    purpose: unknown,
    password: unknown,
    ip: string,
  ) {
    if (!(await rate(`consume:${ip}`, 10))) throw Error('TRY_LATER');
    if (typeof password !== 'string' || !validNewPassword(password))
      throw Error('PASSWORD_LENGTH');
    const target = await context(token, purpose, ip);
    if (!target || target.status !== 'valid')
      return { completed: false, status: target?.status ?? 'unavailable' };
    if (config.mode === 'disabled') throw Error('MAIL_NOT_CONFIGURED');
    const id = randomUUID(),
      encrypted = encryptAccountMail(
        {
          purpose: 'PASSWORD_RESET_COMPLETED',
          to: target.email,
          name: target.name,
          locale: target.locale,
          link: null,
        },
        config.key,
        `${id}|PASSWORD_RESET_COMPLETED|${target.id}`,
      );
    const hash = await authPasswordHash(password);
    const completed =
      (
        await db.query<{ ok: boolean }>(
          'SELECT app.account_email_complete($1,$2,$3,$4,$5,$6) AS ok',
          [
            tokenDigest(String(token)),
            purpose,
            hash,
            id,
            encrypted,
            config.keyId,
          ],
        )
      )[0]?.ok === true;
    return {
      completed,
      status: completed ? 'complete' : 'unavailable',
      ...(completed
        ? { returnTo: safeAccountReturn(target.returnTo, target.locale) }
        : {}),
    };
  }
  return {
    request,
    issue,
    inspect,
    complete,
    queueInTransaction,
    rate,
    delivery: async (user: AccountView) =>
      (
        await db.query<{ value: unknown[] }>(
          'SELECT app.account_email_delivery($1,$2) AS value',
          [user.id, user.sessionId],
        )
      )[0]!.value,
    retry: async (user: AccountView, id: string) => {
      if (!uuid.test(id)) throw Error('INVALID_INPUT');
      return {
        queued:
          (
            await db.query<{ ok: boolean }>(
              'SELECT app.account_email_retry($1,$2,$3) AS ok',
              [user.id, user.sessionId, id],
            )
          )[0]?.ok === true,
      };
    },
    close: () => db.close(),
  };
}
