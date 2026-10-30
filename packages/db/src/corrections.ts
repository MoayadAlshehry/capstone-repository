import 'server-only';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
export function createCorrectionsRepository(url: string) {
  const db = createRuntimeDatabase(url);
  return {
    transaction: db.transactions.run.bind(db.transactions),
    receipt: async <T>(a: AccountView, command: string): Promise<T | null> =>
      (
        await db.query<{ value: T | null }>(
          'SELECT app.governance_receipt($1,$2,$3) value',
          [a.id, a.sessionId, command],
        )
      )[0]!.value,
    view: async <T>(
      a: AccountView,
      caseId?: string,
      issue?: string,
    ): Promise<T> =>
      (
        await db.query<{ value: T }>(
          'SELECT app.governance_view($1,$2,$3,$4) value',
          [a.id, a.sessionId, caseId ?? null, issue ?? null],
        )
      )[0]!.value,
    feedback: async <T>(a: AccountView, caseId: string): Promise<T> =>
      (
        await db.query<{ value: T }>(
          'SELECT app.author_feedback($1,$2,$3) value',
          [a.id, a.sessionId, caseId],
        )
      )[0]!.value,
    close: db.close,
  };
}
