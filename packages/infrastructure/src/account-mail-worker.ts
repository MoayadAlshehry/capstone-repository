import 'server-only';
import pg from 'pg';
import { decryptAccountMail } from '@capstone/db/account-mail-crypto';
import {
  sendAccountMail,
  purgeAccountCapture,
  type AccountMessage,
} from './account-mail.js';
import type { AccountMailConfig } from '@capstone/config/account-mail';
export function createAccountMailWorker(
  databaseUrl: string,
  config: AccountMailConfig,
  sender = sendAccountMail,
  pollMilliseconds = 2000,
) {
  if (new URL(databaseUrl).username !== 'capstone_jobs')
    throw Error('INVALID_JOB_ROLE');
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 1500,
    statement_timeout: 3000,
  });
  pool.on('error', () => {});
  let running = false,
    closed = false;
  async function drain() {
    if (running || closed || config.mode === 'disabled') return false;
    running = true;
    try {
      await purgeAccountCapture(config);
      const item = (await pool.query('SELECT * FROM app.account_email_claim()'))
        .rows[0];
      if (!item) return false;
      let result: {
        state: 'captured' | 'provider_accepted' | 'failed' | 'unknown';
        code: string;
        retryAfterSeconds?: number;
      };
      try {
        if (
          !(
            await pool.query('SELECT app.account_email_current($1,$2) AS ok', [
              item.id,
              item.lease,
            ])
          ).rows[0]?.ok
        )
          return false;
        if (item.key_id !== config.keyId)
          throw Error('MAIL_CONTENT_UNAVAILABLE');
        const message = decryptAccountMail(
          item.ciphertext,
          config.key,
          `${item.id}|${item.purpose}|${item.user_id}`,
        ) as AccountMessage;
        result = await sender(config, item.id, message);
      } catch {
        result = { state: 'failed', code: 'MAIL_CONTENT_UNAVAILABLE' };
      }
      await pool.query('SELECT app.account_email_finish($1,$2,$3,$4,$5)', [
        item.id,
        item.lease,
        result.state,
        result.code,
        Math.min(
          3600,
          Math.max(
            30,
            result.retryAfterSeconds ?? 30 * 2 ** (item.attempts - 1),
          ),
        ),
      ]);
      return true;
    } finally {
      running = false;
    }
  }
  const timer = setInterval(() => {
    void drain().catch(() => {});
  }, pollMilliseconds);
  timer.unref();
  return {
    drain,
    ready: async () => {
      await pool.query('SELECT 1');
    },
    close: async () => {
      closed = true;
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 20));
      await pool.end();
    },
  };
}
