import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export function createSubmissionRepository(url: string) {
  const db = createRuntimeDatabase(url);
  const call = async <T>(
    name: string,
    values: unknown[],
    tx?: TransactionScope,
  ): Promise<T> =>
    (
      await (tx ?? db).query<{ value: T }>(
        `SELECT app.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) value`,
        values,
      )
    )[0]!.value;
  const who = (a: AccountView) => [a.id, a.sessionId];
  return {
    state: <T>(a: AccountView, p: string, v: string) =>
      call<T>('submission_state', [...who(a), p, v]),
    read: <T>(a: AccountView, s: string) =>
      call<T>('submission_read', [...who(a), s]),
    queue: <T>(a: AccountView) => call<T>('submission_queue', who(a)),
    prepare: (
      a: AccountView,
      p: string,
      v: string,
      rev: number,
      assignment: number,
      command: string,
      digest: string,
      tx: TransactionScope,
    ) =>
      call<{
        completed?: string;
        issues?: string[];
        files?: { id: string; key: string; size: number; sha256: string }[];
      }>(
        'submission_prepare',
        [...who(a), p, v, rev, assignment, command, digest],
        tx,
      ),
    commit: <T>(
      a: AccountView,
      p: string,
      v: string,
      rev: number,
      assignment: number,
      command: string,
      digest: string,
      tx: TransactionScope,
    ) =>
      call<T>(
        'submission_commit',
        [...who(a), p, v, rev, assignment, command, digest],
        tx,
      ),
    decide: <T>(
      a: AccountView,
      s: string,
      rev: number,
      assignment: number,
      operation: string,
      comment: string,
      command: string,
      digest: string,
    ) =>
      call<T>('submission_decide', [
        ...who(a),
        s,
        rev,
        assignment,
        operation,
        comment,
        command,
        digest,
      ]),
    transaction: db.transactions.run.bind(db.transactions),
    close: () => db.close(),
  };
}
