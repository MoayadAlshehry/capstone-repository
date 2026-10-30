import 'server-only';
import { connect } from 'node:net';
import pg from 'pg';
import { decryptAccountMail } from '@capstone/db/account-mail-crypto';
import type { AccountMailConfig } from '@capstone/config/account-mail';
import { sendApprovedProviderMail } from './account-mail.js';
import {
  committeeTemplate,
  type CommitteeMessage,
} from './committee-mail-template.js';
export { committeeTemplate };
export type { CommitteeMessage };
async function mailpit(
  config: AccountMailConfig,
  id: string,
  m: CommitteeMessage,
  body: ReturnType<typeof committeeTemplate>,
) {
  if (
    config.environment === 'production' ||
    !['127.0.0.1', 'localhost'].includes(new URL(config.appOrigin).hostname) ||
    new URL(config.appOrigin).protocol !== 'http:' ||
    process.env['COMMITTEE_MAIL_MODE'] !== 'mailpit' ||
    process.env['MAILPIT_HOST'] !== '127.0.0.1' ||
    !/[.]local$/i.test(m.to)
  )
    throw Error('MAILPIT_TARGET_REFUSED');
  const port = Number(process.env['MAILPIT_PORT']);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error('MAILPIT_TARGET_REFUSED');
  const boundary = 'capstone-' + id;
  const encode = (s: string) =>
    Buffer.from(s)
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') ?? '';
  const data = [
    `From: ${config.fromName} <${config.fromAddress}>`,
    `To: <${m.to}>`,
    `Subject: =?UTF-8?B?${Buffer.from(body.subject).toString('base64')}?=`,
    `Message-ID: <${id}@capstone.local>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encode(body.textbody),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encode(body.htmlbody),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    let buffer = '',
      step = 0,
      done = false,
      rejected = false;
    const commands = [
      `EHLO capstone.local\r\n`,
      `MAIL FROM:<${config.fromAddress}>\r\n`,
      `RCPT TO:<${m.to}>\r\n`,
      'DATA\r\n',
      data + '\r\n.\r\n',
      'QUIT\r\n',
    ];
    socket.setTimeout(10000);
    socket.on('timeout', () => socket.destroy(Error('SMTP_TIMEOUT')));
    socket.on('error', () => {
      if (!done)
        reject(
          Error(
            step >= 5 && !rejected
              ? 'SMTP_OUTCOME_UNKNOWN'
              : 'SMTP_UNAVAILABLE',
          ),
        );
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 16000) {
        socket.destroy(Error('SMTP_RESPONSE_LIMIT'));
        return;
      }
      let end: number;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (!/^\d{3} /.test(line)) continue;
        const code = Number(line.slice(0, 3));
        if (code >= 400) {
          rejected = true;
          socket.destroy(Error('SMTP_REJECTED'));
          return;
        }
        if (step === 5) {
          done = true;
          socket.end('QUIT\r\n');
          resolve();
          return;
        }
        if (step < commands.length) socket.write(commands[step++]!);
      }
    });
    socket.on('close', () => {
      if (!done)
        reject(
          Error(
            step >= 5 && !rejected ? 'SMTP_OUTCOME_UNKNOWN' : 'SMTP_CLOSED',
          ),
        );
    });
  });
  return { state: 'mailpit_accepted', code: 'MAILPIT_ACCEPTED' } as const;
}
export function createCommitteeMailWorker(
  databaseUrl: string,
  config: AccountMailConfig,
  pollMilliseconds = 2000,
) {
  if (new URL(databaseUrl).username !== 'capstone_jobs')
    throw Error('INVALID_JOB_ROLE');
  const publicOrigin = !['127.0.0.1', 'localhost'].includes(
    new URL(config.appOrigin).hostname,
  );
  if (
    (publicOrigin || config.environment === 'production') &&
    (config.mode !== 'zoho' || process.env['COMMITTEE_MAIL_MODE'] === 'mailpit')
  )
    throw Error('PRODUCTION_COMMITTEE_MAIL_REQUIRED');
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 1500,
    statement_timeout: 5000,
  });
  pool.on('error', () => {});
  let running = false,
    closed = false;
  async function drain() {
    if (running || closed || config.mode === 'disabled') return false;
    running = true;
    try {
      const item = (
        await pool.query('SELECT * FROM app.committee_mail_claim()')
      ).rows[0];
      if (!item) return false;
      let result: { state: string; code: string };
      try {
        if (item.key_id !== config.keyId) throw Error('KEY_UNAVAILABLE');
        const m = decryptAccountMail(
          item.ciphertext,
          config.key,
          `${item.id}|${item.purpose}|${item.invite_id}`,
        ) as CommitteeMessage;
        if (m.to !== item.recipient || m.purpose !== item.purpose)
          throw Error('RECIPIENT_MISMATCH');
        const body = committeeTemplate(m, config.appOrigin);
        result =
          process.env['COMMITTEE_MAIL_MODE'] === 'mailpit'
            ? await mailpit(config, item.id, m, body)
            : await sendApprovedProviderMail(
                config,
                item.id,
                m.to,
                m.name ?? '',
                body,
              );
      } catch (error) {
        result =
          error instanceof Error && error.message === 'SMTP_OUTCOME_UNKNOWN'
            ? { state: 'unknown', code: 'DELIVERY_OUTCOME_UNKNOWN' }
            : { state: 'failed', code: 'DELIVERY_UNAVAILABLE' };
      }
      await pool.query('SELECT app.committee_mail_finish($1,$2,$3,$4)', [
        item.id,
        item.lease,
        result.state,
        result.code,
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
      if (closed) return;
      closed = true;
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 20));
      await pool.end();
    },
  };
}
