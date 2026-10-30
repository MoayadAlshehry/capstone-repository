import 'server-only';
import { createHash } from 'node:crypto';
import { createSubmissionRepository } from '@capstone/db/submissions';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import {
  submissionUuid,
  decisionCommentValid,
  type SubmitCommand,
  type DecisionCommand,
  type SubmissionState,
  type SubmissionRound,
  type SubmissionResult,
} from './submissions.js';
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class SubmissionError extends Error {
  constructor(
    readonly code: string,
    readonly issues: string[] = [],
  ) {
    super(code);
  }
}
const expected = (c: {
  revision: number;
  assignmentRevision: number;
  command: string;
}) =>
  Number.isSafeInteger(c.revision) &&
  c.revision >= 0 &&
  Number.isSafeInteger(c.assignmentRevision) &&
  c.assignmentRevision >= 0 &&
  submissionUuid(c.command);
export function createSubmissionEngine(url: string, storage: NativeStorage) {
  const repository = createSubmissionRepository(url);
  return {
    state: (a: AccountView, p: string, v: string) =>
      repository.state<SubmissionState>(a, p, v),
    read: (a: AccountView, s: string) => repository.read<SubmissionRound>(a, s),
    queue: (a: AccountView) =>
      repository.queue<{
        items: {
          id: string;
          project: string;
          version: string;
          round: number;
          title: string;
          submittedAt: string;
        }[];
      }>(a),
    async submit(actor: AccountView, c: SubmitCommand) {
      if (
        !submissionUuid(c.project) ||
        !submissionUuid(c.version) ||
        !expected(c)
      )
        throw new SubmissionError('INVALID_INPUT');
      const digest = hash([
        'submit',
        c.project,
        c.version,
        c.revision,
        c.assignmentRevision,
      ]);
      let failure: SubmissionError | undefined;
      try {
        return await repository.transaction(async (tx) => {
          const prepared = await repository.prepare(
            actor,
            c.project,
            c.version,
            c.revision,
            c.assignmentRevision,
            c.command,
            digest,
            tx,
          );
          if (prepared.completed)
            return JSON.parse(prepared.completed) as SubmissionResult;
          if (prepared.issues) {
            failure = new SubmissionError('NOT_READY', prepared.issues);
            throw failure;
          }
          for (const file of prepared.files ?? [])
            if (
              !(await storage.verify(file.key, {
                size: Number(file.size),
                sha256: file.sha256,
              }))
            ) {
              failure = new SubmissionError('INTEGRITY_FAILED', [
                'FILE_INTEGRITY',
              ]);
              throw failure;
            }
          return repository.commit<SubmissionResult>(
            actor,
            c.project,
            c.version,
            c.revision,
            c.assignmentRevision,
            c.command,
            digest,
            tx,
          );
        });
      } catch (e) {
        throw failure ?? e;
      }
    },
    async decide(actor: AccountView, c: DecisionCommand) {
      if (
        !submissionUuid(c.submission) ||
        !expected(c) ||
        !['revision', 'reject'].includes(c.operation) ||
        !decisionCommentValid(c.comment)
      )
        throw new SubmissionError('INVALID_DECISION');
      return repository.decide<SubmissionResult>(
        actor,
        c.submission,
        c.revision,
        c.assignmentRevision,
        c.operation,
        c.comment,
        c.command,
        hash([
          c.operation,
          c.submission,
          c.revision,
          c.assignmentRevision,
          c.comment,
        ]),
      );
    },
    close: repository.close,
  };
}
