import 'server-only';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { createRuntimeDatabase } from '@capstone/db';
import type { AccountView } from '@capstone/db/auth';
import {
  encryptAccountMail,
  newAccountToken,
  tokenDigest,
} from '@capstone/db/account-mail-crypto';

export interface CommitteeConfig {
  mode: string;
  appOrigin: string;
  key: string;
  keyId: string;
}
import type {
  CommitteeStatus,
  CommitteeManagementOutcome,
} from './committee-types.js';
export type { CommitteeStatus } from './committee-types.js';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const token = /^[A-Za-z0-9_-]{43}$/;
const email = (v: unknown): string => {
  if (
    typeof v !== 'string' ||
    v.length > 254 ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v.trim())
  )
    throw Error('INVALID_INPUT');
  return v.trim().toLowerCase();
};
export function createCommitteeService(
  url: string,
  config: CommitteeConfig,
  verifyOriginal: (f: {
    key: string;
    size: number;
    sha256: string;
  }) => Promise<boolean>,
) {
  const db = createRuntimeDatabase(url);
  const call = async <T>(name: string, values: unknown[]) =>
    (
      await db.query<{ value: T }>(
        `SELECT app.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) value`,
        values,
      )
    )[0]!.value;
  const digest = (purpose: string, value: string) =>
    createHmac('sha256', Buffer.from(config.key, 'base64url'))
      .update(purpose + '|' + value)
      .digest('hex');
  const rate = async (key: string, max = 10) =>
    call<boolean>('account_email_rate', [
      digest('committee-rate', key),
      max,
      60,
    ]);
  const status = (a: AccountView, sub: string) =>
    call<CommitteeStatus>('committee_status', [a.id, a.sessionId, sub]);
  const requireMail = () => {
    const origin = new URL(config.appOrigin);
    const local = ['127.0.0.1', 'localhost'].includes(origin.hostname);
    if (
      config.mode === 'disabled' ||
      (!local && config.mode !== 'zoho') ||
      Buffer.from(config.key, 'base64url').length !== 32
    )
      throw Error('MAIL_NOT_CONFIGURED');
  };
  return {
    status,
    receipt: (a: AccountView, submission: string, command: string) => {
      if (!uuid.test(submission) || !uuid.test(command))
        throw Error('INVALID_INPUT');
      return call<CommitteeManagementOutcome>('committee_management_receipt', [
        a.id,
        a.sessionId,
        submission,
        command,
      ]);
    },
    governance: (a: AccountView) =>
      call<{ cases: unknown[] }>('committee_governance_read', [
        a.id,
        a.sessionId,
      ]),
    async authorizeAmendment(
      a: AccountView,
      c: { invitation: string; head: string; reason: string; command: string },
    ) {
      requireMail();
      if (
        !uuid.test(c.invitation) ||
        !uuid.test(c.head) ||
        !uuid.test(c.command) ||
        c.reason.trim().length < 20 ||
        c.reason.length > 2000
      )
        throw Error('INVALID_INPUT');
      const state = await call<{
        cases: {
          submission: string;
          members: { invitation: string; email: string; name: string }[];
        }[];
      }>('committee_governance_read', [a.id, a.sessionId]);
      const parent = state.cases.find((x) =>
          x.members.some((m) => m.invitation === c.invitation),
        ),
        member = parent?.members.find((m) => m.invitation === c.invitation);
      if (!member) throw Error('NOT_FOUND');
      const secret = newAccountToken(),
        mid = randomUUID(),
        purpose = 'COMMITTEE_INVITE',
        encrypted = encryptAccountMail(
          {
            purpose,
            to: member.email,
            name: member.name,
            locale: 'both',
            submission: parent!.submission,
            amendment: true,
            link: `${config.appOrigin}/en/committee/${c.invitation}#token=${secret}`,
          },
          config.key,
          `${mid}|${purpose}|${c.invitation}`,
        );
      return call('committee_authorize_amendment', [
        a.id,
        a.sessionId,
        c.invitation,
        c.head,
        c.reason,
        c.command,
        tokenDigest(secret),
        mid,
        encrypted,
        config.keyId,
      ]);
    },
    explain: (
      a: AccountView,
      c: { case: string; result: string; reason: string; command: string },
    ) =>
      call('committee_explain', [
        a.id,
        a.sessionId,
        c.case,
        c.result,
        c.reason,
        c.command,
      ]),
    async manage(
      a: AccountView,
      c: {
        submission: string;
        revision: number;
        operation: 'invite' | 'resend' | 'revoke';
        invitation?: string | undefined;
        email?: string | undefined;
        name?: string | undefined;
        locale: 'en' | 'ar';
        reason: string;
        command: string;
      },
    ) {
      if (c.operation !== 'revoke') requireMail();
      if (
        !uuid.test(c.submission) ||
        !uuid.test(c.command) ||
        !Number.isInteger(c.revision) ||
        c.revision < 0 ||
        c.reason.length > 1000 ||
        !['en', 'ar'].includes(c.locale) ||
        !['invite', 'resend', 'revoke'].includes(c.operation)
      )
        throw Error('INVALID_INPUT');
      const prior = await status(a, c.submission),
        member = prior.members.find((x) => x.id === c.invitation);
      const iid = c.operation === 'invite' ? randomUUID() : c.invitation;
      if (!iid || !uuid.test(iid) || (c.operation !== 'invite' && !member))
        throw Error('INVALID_INPUT');
      const address = c.operation === 'invite' ? email(c.email) : member!.email,
        name = c.operation === 'invite' ? (c.name ?? '') : member!.name,
        locale = c.operation === 'invite' ? c.locale : member!.locale;
      if (c.operation !== 'revoke' && address === a.email.trim().toLowerCase())
        throw Error('SUPERVISOR_COMMITTEE_CONFLICT');
      if (name.length > 200 || /[\u0000-\u001f\u007f]/.test(name))
        throw Error('INVALID_INPUT');
      const secret = newAccountToken(),
        mid = randomUUID(),
        purpose = 'COMMITTEE_INVITE';
      const encrypted =
        c.operation === 'revoke'
          ? ''
          : encryptAccountMail(
              {
                purpose,
                to: address,
                name,
                locale,
                submission: c.submission,
                link: `${config.appOrigin}/${locale}/committee/${iid}#token=${secret}`,
              },
              config.key,
              `${mid}|${purpose}|${iid}`,
            );
      return call<CommitteeStatus>('committee_manage', [
        a.id,
        a.sessionId,
        c.submission,
        c.revision,
        c.operation,
        iid,
        address,
        name,
        locale,
        c.reason,
        tokenDigest(secret),
        mid,
        encrypted,
        config.keyId,
        c.command,
      ]);
    },
    async challenge(
      iid: string,
      secret: unknown,
      address: unknown,
      ip: string,
    ) {
      requireMail();
      if (!uuid.test(iid) || typeof secret !== 'string' || !token.test(secret))
        return { accepted: true };
      let recipient: string;
      try {
        recipient = email(address);
      } catch {
        return { accepted: true };
      }
      if (!(await rate('challenge-ip:' + ip, 10))) return { accepted: true };
      if (!(await rate('challenge-invite:' + iid, 3)))
        return { accepted: true };
      const code = String(randomInt(0, 1000000)).padStart(6, '0'),
        mid = randomUUID(),
        purpose = 'COMMITTEE_OTP';
      // The digest is peppered: a stolen database cannot enumerate the million possible codes offline.
      const encrypted = encryptAccountMail(
        { purpose, to: recipient, locale: 'both', invitation: iid, code },
        config.key,
        `${mid}|${purpose}|${iid}`,
      );
      try {
        return await call<{ accepted: true }>('committee_challenge_issue', [
          iid,
          tokenDigest(secret),
          recipient,
          digest('otp', iid + '|' + code),
          mid,
          encrypted,
          config.keyId,
        ]);
      } catch {
        return { accepted: true };
      }
    },
    async verify(
      iid: string,
      secret: unknown,
      address: unknown,
      code: unknown,
      ip: string,
    ) {
      requireMail();
      if (
        !uuid.test(iid) ||
        typeof secret !== 'string' ||
        !token.test(secret) ||
        typeof code !== 'string' ||
        !/^\d{6}$/.test(code) ||
        !(await rate('verify-ip:' + ip, 20)) ||
        !(await rate('verify-invite:' + iid, 10))
      )
        return null;
      let recipient: string;
      try {
        recipient = email(address);
      } catch {
        return null;
      }
      const session = newAccountToken();
      try {
        return (await call<boolean>('committee_verify', [
          iid,
          tokenDigest(secret),
          recipient,
          digest('otp', iid + '|' + code),
          tokenDigest(session),
        ]))
          ? session
          : null;
      } catch {
        return null;
      }
    },
    endSession: (iid: string, session: string) =>
      call<void>('committee_session_end', [iid, tokenDigest(session)]),
    async read<T>(iid: string, session: string) {
      if (!uuid.test(iid) || !token.test(session)) throw Error('NOT_FOUND');
      return call<T>('committee_guest_read', [iid, tokenDigest(session)]);
    },
    async files<T>(iid: string, session: string, fid?: string) {
      if (!uuid.test(iid) || !token.test(session) || (fid && !uuid.test(fid)))
        throw Error('NOT_FOUND');
      return call<T>('committee_file_scope', [
        iid,
        tokenDigest(session),
        fid ?? null,
      ]);
    },
    async write(
      iid: string,
      session: string,
      revision: number,
      payload: unknown,
      command: string,
      finalize: boolean,
    ) {
      if (
        !uuid.test(iid) ||
        !token.test(session) ||
        !uuid.test(command) ||
        !Number.isInteger(revision) ||
        revision < 0
      )
        throw Error('INVALID_INPUT');
      return db.transactions.run(async (tx) => {
        const args = [
          iid,
          tokenDigest(session),
          revision,
          JSON.stringify(payload),
          command,
          finalize,
        ];
        const q =
          'SELECT app.committee_guest_write($1,$2,$3,$4,$5,$6,$7) value';
        const prepared = (
          await tx.query<{
            value: {
              receipt?: unknown;
              files?: { key: string; size: number; sha256: string }[];
            };
          }>(q, [...args, false])
        )[0]!.value;
        if (!finalize || prepared.receipt) return prepared;
        if (!prepared.files?.length) throw Error('EVIDENCE_UNAVAILABLE');
        for (const f of prepared.files)
          if (!(await verifyOriginal(f))) throw Error('EVIDENCE_UNAVAILABLE');
        return (await tx.query<{ value: unknown }>(q, [...args, true]))[0]!
          .value;
      });
    },
    close: () => db.close(),
  };
}
