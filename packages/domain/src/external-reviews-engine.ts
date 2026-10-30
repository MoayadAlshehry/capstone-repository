import 'server-only';
import { assessmentEntryPayload } from './assessment-entry.js';
import { createExternalRepository } from '@capstone/db/external-reviews';
import { DatabaseError } from '@capstone/db';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import {
  externalFormIssues,
  concealProjection,
  type ExternalForm,
  type ReviewTask,
} from './external-reviews.js';
import { submissionUuid } from './submissions.js';
export class ExternalReviewError extends Error {
  constructor(
    readonly code: string,
    readonly issues: string[] = [],
  ) {
    super(code);
  }
}
export function createExternalReviewEngine(
  url: string,
  storage: NativeStorage,
) {
  const r = createExternalRepository(url);
  return {
    async view(a: AccountView, id?: string) {
      if (id && !submissionUuid(id)) throw new ExternalReviewError('NOT_FOUND');
      const state = await r.view<
        ReviewTask | { items: ReviewTask[]; serverTime: string }
      >(a, id);
      for (const task of 'items' in state ? state.items : [state])
        if (task.project) task.project = concealProjection(task.project);
      if (id && 'status' in state && state.status === 'accepted') {
        state.usable = false;
        try {
          const p = await r.readiness(a, id);
          state.usable = !!p.files?.length;
          for (const f of p.files)
            if (
              !(await storage.verify(f.key, {
                size: Number(f.size),
                sha256: f.sha256,
              }))
            )
              state.usable = false;
        } catch (error) {
          if (
            !(error instanceof DatabaseError) ||
            !['42501', 'P0002', '40001', '23514'].includes(
              error.sqlState ?? '',
            )
          )
            throw error;
          state.usable = false;
        }
      }
      return state;
    },
    async receipt(a: AccountView, id: string, command: string) {
      if (!submissionUuid(id) || !submissionUuid(command))
        throw new ExternalReviewError('INVALID_INPUT');
      return r.receipt(a, id, command);
    },
    async check(a: AccountView, id: string, revision: number, body: unknown) {
      if (
        !submissionUuid(id) ||
        !Number.isSafeInteger(revision) ||
        revision < 0
      )
        throw new ExternalReviewError('INVALID_INPUT');
      const readiness = await r.readiness(a, id);
      for (const f of readiness.files)
        if (
          !(await storage.verify(f.key, {
            size: Number(f.size),
            sha256: f.sha256,
          }))
        )
          throw new ExternalReviewError('EVIDENCE_UNAVAILABLE');
      return r.check(a, id, revision, body);
    },
    async command(
      a: AccountView,
      c: {
        assignment: string;
        operation: string;
        revision: number;
        body: unknown;
        command: string;
      },
    ) {
      if (
        !submissionUuid(c.assignment) ||
        !submissionUuid(c.command) ||
        !Number.isSafeInteger(c.revision) ||
        c.revision < 0 ||
        !['accept', 'decline', 'withdraw', 'save', 'finalize'].includes(
          c.operation,
        )
      )
        throw new ExternalReviewError('INVALID_INPUT');
      if (c.operation === 'save' || c.operation === 'finalize') {
        const body = assessmentEntryPayload(c.body) as ExternalForm;
        if (
          !body ||
          typeof body.overall !== 'string' ||
          !Array.isArray(body.criteria) ||
          body.criteria.some(
            (x) =>
              !x ||
              typeof x.comment !== 'string' ||
              !Array.isArray(x.locators) ||
              x.locators.some(
                (l) =>
                  !l ||
                  typeof l.file !== 'string' ||
                  typeof l.reference !== 'string',
              ),
          )
        )
          throw new ExternalReviewError('INVALID_FORM');
        c.body = {
          ...body,
          overall: body.overall.trim().normalize('NFC'),
          criteria: body.criteria.map((x) => ({
            ...x,
            comment: x.comment.trim().normalize('NFC'),
            locators: x.locators.map((l) => ({
              ...l,
              file: l.file.toLowerCase(),
              reference: l.reference.trim().normalize('NFC'),
            })),
          })),
        };
      }
      if (c.operation === 'save' || c.operation === 'finalize') {
        const receipt = await r.receipt(a, c.assignment, c.command);
        if (receipt)
          return r
            .transaction((tx) =>
              r.command(
                a,
                c.assignment,
                c.operation,
                c.revision,
                c.body,
                c.command,
                false,
                tx,
              ),
            )
            .then((p) => p.completed);
        const t = await r.view<ReviewTask>(a, c.assignment);
        const issues = externalFormIssues(
          c.body,
          (t.manifest?.entries ?? []).map((f) => f.id),
          c.operation === 'finalize',
          true,
        );
        if (issues.length)
          throw new ExternalReviewError('INVALID_FORM', issues);
      }
      let failure: ExternalReviewError | undefined;
      try {
        return await r.transaction(async (tx) => {
          const p = await r.command(
            a,
            c.assignment,
            c.operation,
            c.revision,
            c.body,
            c.command,
            false,
            tx,
          );
          if (p.completed) return p.completed;
          for (const f of p.files ?? []) {
            try {
              if (
                !(await storage.verify(f.key, {
                  size: Number(f.size),
                  sha256: f.sha256,
                }))
              )
                throw Error();
            } catch {
              failure = new ExternalReviewError('EVIDENCE_UNAVAILABLE');
              throw failure;
            }
          }
          return r.command(
            a,
            c.assignment,
            c.operation,
            c.revision,
            c.body,
            c.command,
            true,
            tx,
          );
        });
      } catch (e) {
        throw failure ?? e;
      }
    },
    concealed: r.concealed,
    close: r.close,
  };
}
