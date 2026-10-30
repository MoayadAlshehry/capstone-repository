import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export function createPublicationRepository(url: string) {
  const db = createRuntimeDatabase(url),
    who = (a: AccountView) => [a.id, a.sessionId];
  const call = async <T>(
    name:
      | 'publication_state'
      | 'publication_prepare'
      | 'publication_commit'
      | 'publication_projection'
      | 'institutional_archive'
      | 'publication_audit',
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
    state: <T>(a: AccountView, s: string) =>
      call<T>('publication_state', [...who(a), s]),
    prepare: (
      a: AccountView,
      s: string,
      rev: number,
      assignment: number,
      command: string,
      digest: string,
      tx: TransactionScope,
    ) =>
      call<{
        completed?: string;
        files: { key: string; size: number; sha256: string }[];
      }>(
        'publication_prepare',
        [...who(a), s, rev, assignment, command, digest],
        tx,
      ),
    commit: <T>(
      a: AccountView,
      s: string,
      rev: number,
      assignment: number,
      command: string,
      digest: string,
      tx: TransactionScope,
    ) =>
      call<T>(
        'publication_commit',
        [...who(a), s, rev, assignment, command, digest],
        tx,
      ),
    projection: <T>(p: string) => call<T>('publication_projection', [p]),
    archive: <T>(a: AccountView) => call<T>('institutional_archive', who(a)),
    audit: <T>(a: AccountView, f: unknown, reason: string) =>
      call<T>('publication_audit', [...who(a), JSON.stringify(f), reason]),
    transaction: db.transactions.run.bind(db.transactions),
    close: () => db.close(),
  };
}
