import 'server-only';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
import type { createAccountMail } from './account-mail.js';
import type { AccountAccessPerson } from './account-access.js';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
interface Result {
  id: string;
  university: string;
  reused: boolean;
}
export function createOnboarding(
  url: string,
  mail: ReturnType<typeof createAccountMail>,
) {
  const db = createRuntimeDatabase(url);
  return {
    async command(
      a: AccountView,
      cid: string,
      operation: string,
      payload: Record<string, unknown>,
    ): Promise<Result> {
      if (!uuid.test(cid)) throw Error('INVALID_INPUT');
      return db.transactions.run(async (tx) => {
        const rows = await tx.query<{
          value: Result & {
            requiresMail: boolean;
            target?: {
              id: string;
              university: string;
              name: string;
              email: string;
              locale: 'en' | 'ar';
            };
          };
        }>('SELECT app.onboarding_prepare($1,$2,$3,$4,$5::jsonb) AS value', [
          a.id,
          a.sessionId,
          cid,
          operation,
          JSON.stringify(payload),
        ]);
        const result = rows[0]!.value;
        if (result.requiresMail) {
          if (!result.target) throw Error('INVALID_STATE');
          await mail.queueInTransaction(
            tx,
            result.target,
            'ACCOUNT_SETUP',
            a,
            cid,
          );
        }
        return (
          await tx.query<{ value: Result }>(
            'SELECT app.onboarding_finish($1,$2,$3) AS value',
            [a.id, a.sessionId, cid],
          )
        )[0]!.value;
      });
    },
    async receipt(a: AccountView, cid: string): Promise<Result | null> {
      if (!uuid.test(cid)) throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: Result | null }>(
          'SELECT app.onboarding_receipt($1,$2,$3) AS value',
          [a.id, a.sessionId, cid],
        )
      )[0]!.value;
    },
    async read<T>(
      a: AccountView,
      kind: string,
      target?: string,
      query: Record<string, string> = {},
    ): Promise<T> {
      if (target && !uuid.test(target)) throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: T }>(
          'SELECT app.onboarding_read($1,$2,$3,$4,$5,$6,$7,$8) AS value',
          [
            a.id,
            a.sessionId,
            kind,
            target ?? null,
            query['q'] ?? '',
            query['status'] ?? '',
            query['role'] ?? '',
            Number(query['page'] ?? 1),
          ],
        )
      )[0]!.value;
    },
    async administratorAccess(
      a: AccountView,
      target: string,
      command?: string,
    ): Promise<AccountAccessPerson> {
      if (
        a.role !== 'platform_admin' ||
        !uuid.test(target) ||
        (command && !uuid.test(command))
      )
        throw Error('FORBIDDEN');
      return (
        await db.query<{ value: AccountAccessPerson }>(
          'SELECT app.onboarding_administrator_access($1,$2,$3,$4) AS value',
          [a.id, a.sessionId, target, command ?? null],
        )
      )[0]!.value;
    },
    async approvals<T>(
      a: AccountView,
      kind: string,
      target?: string,
      query: Record<string, string> = {},
    ): Promise<T> {
      if (target && !uuid.test(target)) throw Error('INVALID_INPUT');
      const value = (
        await db.query<{ value: T }>(
          'SELECT app.onboarding_approvals($1,$2,$3,$4,$5,$6,$7) AS value',
          [
            a.id,
            a.sessionId,
            kind,
            target ?? null,
            query['q'] ?? '',
            query['status'] ?? '',
            Number(query['page'] ?? 1),
          ],
        )
      )[0]!.value;
      if (kind === 'partners' && target && value) {
        const profiles = (
          await db.query<{
            value: { id: string; clarification?: string | null }[];
          }>('SELECT app.partner_view($1,$2,NULL) value', [a.id, a.sessionId])
        )[0]!.value;
        return {
          ...value,
          clarification:
            profiles.find((p) => p.id === target)?.clarification ?? null,
        } as T;
      }
      return value;
    },
    async decisionReceipt(
      a: AccountView,
      cid: string,
      target: string,
      kind: string,
    ) {
      if (!uuid.test(cid) || !uuid.test(target)) throw Error('INVALID_INPUT');
      return (
        await db.query<{
          value: { scope: string; row_version: number } | null;
        }>('SELECT app.onboarding_decision_receipt($1,$2,$3,$4,$5) AS value', [
          a.id,
          a.sessionId,
          cid,
          target,
          kind,
        ])
      )[0]!.value;
    },
    close: () => db.close(),
  };
}
