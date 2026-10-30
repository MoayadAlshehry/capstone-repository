import 'server-only';
import { createHash } from 'node:crypto';
import { createAcademicRepository } from '@capstone/db/academic';
import { createEvaluationEngine } from './evaluations-engine.js';
import {
  academicCommandSchema,
  finalizedInput,
  type AcademicCommand,
  type AcademicReadiness,
  type AcademicRound,
} from './academic.js';
import { coreQuarterPoints } from './evaluations.js';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
export class AcademicError extends Error {
  constructor(
    readonly code: string,
    readonly issues: string[] = [],
  ) {
    super(code);
  }
}
export function createAcademicEngine(url: string, storage: NativeStorage) {
  const db = createAcademicRepository(url),
    evaluation = createEvaluationEngine(url, storage);
  const digest = (c: unknown) =>
    createHash('sha256')
      .update(JSON.stringify(['ACADEMIC_FINAL_V1', c]))
      .digest('hex');
  const verify = async (
    files: { key: string; size: number; sha256: string }[],
  ) => {
    for (const f of files)
      if (
        !(await storage.verify(f.key, {
          size: Number(f.size),
          sha256: f.sha256,
        }))
      )
        throw new AcademicError('EVIDENCE_UNAVAILABLE');
  };
  return {
    inbox: (a: AccountView) =>
      db.inbox<{
        items: {
          id: string;
          type: string;
          created_at: string;
          read_at: string | null;
          project: string | null;
          title: string | null;
          route: string | null;
        }[];
      }>(a),
    readiness: (a: AccountView, p: string) =>
      db.readiness<AcademicReadiness>(a, p),
    async round(a: AccountView, s: string) {
      const value = await db.round<AcademicRound>(a, s);
      for (const draft of value.assessment?.drafts ?? [])
        draft.total = draft.payload.criteria.every((c) => c.level !== null)
          ? coreQuarterPoints(finalizedInput(draft.payload).criteria) / 4
          : null;
      return value;
    },
    receipt: (a: AccountView, c: string) => db.receipt<unknown>(a, c),
    async command(a: AccountView, value: AcademicCommand) {
      const c = academicCommandSchema.parse(value),
        hash = digest(c);
      if (c.operation === 'final.request')
        return db.request<unknown>(a, c, hash);
      if (c.operation === 'assessment.save')
        return db.draft<unknown>(a, c, hash);
      if (
        c.operation === 'assessment.finalize' &&
        c.payload.criteria.some((x) => x.level === null)
      )
        throw new AcademicError('SEVEN_SCORES_REQUIRED');
      if (c.operation === 'assessment.finalize')
        return evaluation.finalize(a, {
          ...finalizedInput(c.payload),
          submission: c.submission,
          revision: c.revision,
          assignmentRevision: c.assignmentRevision,
          command: c.command,
          draftRevision: c.draftRevision,
        });
      let failure: AcademicError | undefined;
      return db
        .transaction(async (tx) => {
          try {
            if (c.operation === 'final.screen') {
              const prep = await db.screenPrepare(a, c, hash, tx);
              if (prep.completed) return prep.completed;
              await verify(prep.files ?? []);
              return db.screenCommit<unknown>(a, c, hash, tx);
            }
            if (c.operation === 'final.submit') {
              const prep = await db.finalPrepare(a, c, hash, tx);
              if (prep.completed) return JSON.parse(prep.completed) as unknown;
              if (prep.issues?.length)
                throw new AcademicError('NOT_READY', prep.issues);
              await verify(prep.files ?? []);
              return db.finalCommit<unknown>(a, c, hash, tx);
            }
            const prep = await db.decisionPrepare(a, c, hash, tx);
            if (prep.completed) return prep.completed;
            await verify(prep.files ?? []);
            return db.decisionCommit<unknown>(a, c, hash, tx);
          } catch (error) {
            if (error instanceof AcademicError) failure = error;
            throw error;
          }
        })
        .catch((error) => {
          throw failure ?? error;
        });
    },
    async close() {
      await Promise.all([db.close(), evaluation.close()]);
    },
  };
}
