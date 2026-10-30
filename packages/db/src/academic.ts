import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export function createAcademicRepository(url: string) {
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
    inbox: <T>(a: AccountView) => call<T>('academic_flow_inbox', who(a)),
    flow: <T>(a: AccountView, p: string) =>
      call<T>('academic_flow_state', [...who(a), p]),
    request: <T>(
      a: AccountView,
      c: {
        project: string;
        version: string;
        assignmentRevision: number;
        requestRevision: number;
        note: string;
        command: string;
      },
      digest: string,
    ) =>
      call<T>('academic_request_final', [
        ...who(a),
        c.project,
        c.version,
        c.assignmentRevision,
        c.requestRevision,
        c.note,
        c.command,
        digest,
      ]),
    screenPrepare: (
      a: AccountView,
      c: {
        submission: string;
        revision: number;
        assignmentRevision: number;
        outcome: string;
        reason: string;
        command: string;
      },
      digest: string,
      tx: TransactionScope,
    ) =>
      call<{
        completed?: unknown;
        files?: { key: string; size: number; sha256: string }[];
      }>(
        'academic_screen_prepare',
        [
          ...who(a),
          c.submission,
          c.revision,
          c.assignmentRevision,
          c.outcome,
          c.reason,
          c.command,
          digest,
        ],
        tx,
      ),
    screenCommit: <T>(
      a: AccountView,
      c: {
        submission: string;
        revision: number;
        assignmentRevision: number;
        outcome: string;
        reason: string;
        command: string;
      },
      digest: string,
      tx: TransactionScope,
    ) =>
      call<T>(
        'academic_screen_commit',
        [
          ...who(a),
          c.submission,
          c.revision,
          c.assignmentRevision,
          c.outcome,
          c.reason,
          c.command,
          digest,
        ],
        tx,
      ),
    readiness: <T>(a: AccountView, p: string) =>
      call<T>('academic_readiness', [...who(a), p]),
    round: <T>(a: AccountView, s: string) =>
      call<T>('academic_round_read', [...who(a), s]),
    receipt: <T>(a: AccountView, c: string) =>
      call<T>('academic_receipt', [...who(a), c]),
    finalPrepare: (
      a: AccountView,
      c: {
        project: string;
        version: string;
        revision: number;
        assignmentRevision: number;
        manifestDigest: string;
        command: string;
      },
      digest: string,
      tx: TransactionScope,
    ) =>
      call<{
        completed?: string;
        issues?: string[];
        files?: { key: string; size: number; sha256: string }[];
      }>(
        'academic_final_prepare',
        [
          ...who(a),
          c.project,
          c.version,
          c.revision,
          c.assignmentRevision,
          c.manifestDigest,
          c.command,
          digest,
        ],
        tx,
      ),
    finalCommit: <T>(
      a: AccountView,
      c: {
        project: string;
        version: string;
        revision: number;
        assignmentRevision: number;
        manifestDigest: string;
        command: string;
      },
      digest: string,
      tx: TransactionScope,
    ) =>
      call<T>(
        'academic_final_commit',
        [
          ...who(a),
          c.project,
          c.version,
          c.revision,
          c.assignmentRevision,
          c.manifestDigest,
          c.command,
          digest,
        ],
        tx,
      ),
    draft: <T>(
      a: AccountView,
      c: {
        submission: string;
        revision: number;
        assignmentRevision: number;
        draftRevision: number;
        payload: unknown;
        command: string;
      },
      digest: string,
    ) =>
      call<T>('academic_draft_save', [
        ...who(a),
        c.submission,
        c.revision,
        c.assignmentRevision,
        c.draftRevision,
        JSON.stringify(c.payload),
        c.command,
        digest,
      ]),
    decisionPrepare: (
      a: AccountView,
      c: {
        submission: string;
        revision: number;
        assignmentRevision: number;
        outcome: string;
        reason: string;
        publicManifestDigest: string;
        command: string;
      },
      digest: string,
      tx: TransactionScope,
    ) =>
      call<{
        completed?: unknown;
        files?: { key: string; size: number; sha256: string }[];
      }>(
        'academic_decision_prepare',
        [
          ...who(a),
          c.submission,
          c.revision,
          c.assignmentRevision,
          c.outcome,
          c.reason,
          c.publicManifestDigest,
          c.command,
          digest,
        ],
        tx,
      ),
    decisionCommit: <T>(
      a: AccountView,
      c: {
        submission: string;
        revision: number;
        assignmentRevision: number;
        outcome: string;
        reason: string;
        publicManifestDigest: string;
        command: string;
      },
      digest: string,
      tx: TransactionScope,
    ) =>
      call<T>(
        'academic_decision_commit',
        [
          ...who(a),
          c.submission,
          c.revision,
          c.assignmentRevision,
          c.outcome,
          c.reason,
          c.publicManifestDigest,
          c.command,
          digest,
        ],
        tx,
      ),
    transaction: db.transactions.run.bind(db.transactions),
    close: () => db.close(),
  };
}
