import 'server-only';
import { createHash } from 'node:crypto';
import { createEvaluationRepository } from '@capstone/db/evaluations';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import {
  assessmentIssues,
  type AssessmentCommand,
  type AssessmentInput,
} from './evaluations.js';
import { submissionUuid } from './submissions.js';
import { systemClock, type Clock } from './clock.js';
export class EvaluationError extends Error {
  constructor(
    readonly code: string,
    readonly issues: string[] = [],
  ) {
    super(code);
  }
}
export function createEvaluationEngine(
  url: string,
  storage: NativeStorage,
  clock: Clock = systemClock,
) {
  const repository = createEvaluationRepository(url);
  return {
    read: <T>(a: AccountView, s: string) => repository.read<T>(a, s),
    async finalize(a: AccountView, c: AssessmentCommand) {
      const context = await repository.read<{
        contract?: string;
        committeeWorkflow?: boolean;
      }>(a, c.submission);
      const simple = context.contract === 'ACADEMIC_FINAL_V1';
      const issues = assessmentIssues(
        c,
        clock.now().toISOString().slice(0, 10),
        simple && !context.committeeWorkflow,
      );
      if (
        !submissionUuid(c.submission) ||
        !submissionUuid(c.command) ||
        !Number.isSafeInteger(c.revision) ||
        c.revision < 0 ||
        !Number.isSafeInteger(c.assignmentRevision) ||
        c.assignmentRevision < 0 ||
        (simple &&
          (!Number.isSafeInteger(c.draftRevision) ||
            (c.draftRevision ?? 0) < 1)) ||
        issues.length
      )
        throw new EvaluationError('INVALID_ASSESSMENT', issues);
      const {
        submission,
        revision,
        assignmentRevision,
        command,
        draftRevision,
        ...payload
      } = c;
      const p: AssessmentInput = payload;
      const digest = createHash('sha256')
        .update(
          JSON.stringify(
            simple
              ? [
                  'ACADEMIC_FINAL_V1',
                  submission,
                  revision,
                  assignmentRevision,
                  draftRevision,
                  p,
                ]
              : [submission, revision, assignmentRevision, p],
          ),
        )
        .digest('hex');
      let failure: EvaluationError | undefined;
      try {
        return await repository.transaction(async (tx) => {
          if (simple)
            await repository.draftGuard(
              a,
              submission,
              p.layer,
              draftRevision!,
              p,
              tx,
            );
          const prepared = await repository.prepare(
            a,
            submission,
            revision,
            assignmentRevision,
            p,
            command,
            digest,
            tx,
          );
          if (prepared.completed)
            return JSON.parse(prepared.completed) as {
              id: string;
              total: number;
              layer: string;
              submission: string;
              rubric: string;
            };
          for (const file of prepared.files)
            if (
              !(await storage.verify(file.key, {
                size: Number(file.size),
                sha256: file.sha256,
              }))
            ) {
              failure = new EvaluationError('EVIDENCE_UNAVAILABLE');
              throw failure;
            }
          return repository.commit<{
            id: string;
            total: number;
            layer: string;
            submission: string;
            rubric: string;
          }>(
            a,
            submission,
            revision,
            assignmentRevision,
            p,
            command,
            digest,
            tx,
          );
        });
      } catch (e) {
        throw failure ?? e;
      }
    },
    close: repository.close,
  };
}
