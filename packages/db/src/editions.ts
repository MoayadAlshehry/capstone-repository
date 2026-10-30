import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export function createEditionRepository(url: string) {
  const db = createRuntimeDatabase(url);
  const call = async <T>(
    name:
      | 'edition_history'
      | 'edition_effective_policy'
      | 'successor_prepare'
      | 'successor_commit'
      | 'edition_visibility',
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
    history: <T>(a: AccountView, p: string, tx?: TransactionScope) =>
      call<T>('edition_history', [...who(a), p], tx),
    policy: <T>(a: AccountView, p: string, v: string) =>
      call<T>('edition_effective_policy', [...who(a), p, v]),
    prepare: (
      a: AccountView,
      p: string,
      b: string,
      r: number,
      c: string,
      h: string,
      t: TransactionScope,
    ) =>
      call<{
        completed?: string;
        files: { key: string; size: number; sha256: string }[];
      }>('successor_prepare', [...who(a), p, b, r, c, h], t),
    commit: <T>(
      a: AccountView,
      p: string,
      b: string,
      r: number,
      c: string,
      h: string,
      t: TransactionScope,
    ) => call<T>('successor_commit', [...who(a), p, b, r, c, h], t),
    visibility: <T>(
      a: AccountView,
      p: string,
      v: string,
      f: string,
      r: number,
      intended: string,
      c: string,
      h: string,
      tx?: TransactionScope,
    ) =>
      call<T>(
        'edition_visibility',
        [...who(a), p, v, f, r, intended, c, h],
        tx,
      ),
    transaction: db.transactions.run.bind(db.transactions),
    close: () => db.close(),
  };
}
