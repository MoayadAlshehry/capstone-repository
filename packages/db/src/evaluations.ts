import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export function createEvaluationRepository(url: string) {
  const db = createRuntimeDatabase(url);
  const call = async <T>(
    name:
      | 'evaluation_read'
      | 'evaluation_prepare'
      | 'evaluation_commit'
      | 'academic_finalize_draft_guard',
    values: unknown[],
    tx?: TransactionScope,
  ): Promise<T> =>
    (
      await (tx ?? db).query<{ value: T }>(
        `SELECT app.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) value`,
        values,
      )
    )[0]!.value;
  return {
    read: <T>(a: AccountView, s: string) =>
      call<T>('evaluation_read', [a.id, a.sessionId, s]),
    prepare: (
      a: AccountView,
      s: string,
      rev: number,
      assignment: number,
      payload: unknown,
      command: string,
      digest: string,
      tx: TransactionScope,
    ) =>
      call<{
        completed?: string;
        files: { key: string; size: number; sha256: string }[];
      }>(
        'evaluation_prepare',
        [
          a.id,
          a.sessionId,
          s,
          rev,
          assignment,
          JSON.stringify(payload),
          command,
          digest,
        ],
        tx,
      ),
    commit: <T>(
      a: AccountView,
      s: string,
      rev: number,
      assignment: number,
      payload: unknown,
      command: string,
      digest: string,
      tx: TransactionScope,
    ) =>
      call<T>(
        'evaluation_commit',
        [
          a.id,
          a.sessionId,
          s,
          rev,
          assignment,
          JSON.stringify(payload),
          command,
          digest,
        ],
        tx,
      ),
    draftGuard: (
      a: AccountView,
      s: string,
      layer: string,
      revision: number,
      payload: unknown,
      tx: TransactionScope,
    ) =>
      call<void>(
        'academic_finalize_draft_guard',
        [a.id, a.sessionId, s, layer, revision, JSON.stringify(payload)],
        tx,
      ),
    transaction: db.transactions.run.bind(db.transactions),
    close: () => db.close(),
  };
}
