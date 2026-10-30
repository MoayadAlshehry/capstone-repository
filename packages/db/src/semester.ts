import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export function createSemesterRepository(url: string) {
  const db = createRuntimeDatabase(url),
    who = (a: AccountView) => [a.id, a.sessionId];
  const call = async <T>(
    name: string,
    args: unknown[],
    tx?: TransactionScope,
  ): Promise<T> =>
    (
      await (tx ?? db).query<{ value: T }>(
        `SELECT app.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS value`,
        args,
      )
    )[0]!.value;
  return {
    state: <T>(a: AccountView, p: string) =>
      call<T>('semester_state', [...who(a), p]),
    collection: <T>(a: AccountView, queue = false) =>
      call<T>('semester_collection', [...who(a), queue]),
    round: <T>(a: AccountView, s: string) =>
      call<T>('checkpoint_read', [...who(a), s]),
    receipt: <T>(a: AccountView, c: string) =>
      call<T>('semester_receipt', [...who(a), c]),
    save: <T>(
      a: AccountView,
      c: {
        project: string;
        version: string;
        revision: number;
        fields: unknown;
        command: string;
      },
    ) =>
      call<T>('semester_metadata_save', [
        ...who(a),
        c.project,
        c.version,
        c.revision,
        JSON.stringify(c.fields),
        c.command,
      ]),
    prepare: (
      a: AccountView,
      c: {
        project: string;
        version: string;
        revision: number;
        assignmentRevision: number;
        manifestDigest: string;
        command: string;
      },
      tx: TransactionScope,
    ) =>
      call<{
        completed?: unknown;
        issues?: string[];
        files?: { key: string; size: number; sha256: string }[];
      }>(
        'checkpoint_prepare',
        [
          ...who(a),
          c.project,
          c.version,
          c.revision,
          c.assignmentRevision,
          c.manifestDigest,
          c.command,
        ],
        tx,
      ),
    commit: <T>(
      a: AccountView,
      c: {
        project: string;
        version: string;
        revision: number;
        assignmentRevision: number;
        manifestDigest: string;
        command: string;
      },
      tx: TransactionScope,
    ) =>
      call<T>(
        'checkpoint_commit',
        [
          ...who(a),
          c.project,
          c.version,
          c.revision,
          c.assignmentRevision,
          c.manifestDigest,
          c.command,
        ],
        tx,
      ),
    decide: <T>(
      a: AccountView,
      c: {
        submission: string;
        revision: number;
        assignmentRevision: number;
        operation: string;
        comment: string;
        command: string;
      },
    ) =>
      call<T>('checkpoint_decide', [
        ...who(a),
        c.submission,
        c.revision,
        c.assignmentRevision,
        c.operation,
        c.comment,
        c.command,
      ]),
    transaction: db.transactions.run.bind(db.transactions),
    close: db.close,
  };
}
