import 'server-only';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
import { reviewerValidation, type ReviewerContext } from './reviewer-types.js';
import { uuid } from './governance-types.js';
export function createReviewers(url: string) {
  const db = createRuntimeDatabase(url);
  return {
    async view(a: AccountView, status?: string): Promise<ReviewerContext> {
      if (
        status !== undefined &&
        !['pending', 'approved', 'suspended'].includes(status)
      )
        throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: ReviewerContext }>(
          'SELECT app.reviewer_view($1,$2,$3) value',
          [a.id, a.sessionId, status ?? null],
        )
      )[0]!.value;
    },
    async capability(a: AccountView): Promise<boolean> {
      return (
        await db.query<{ value: boolean }>(
          'SELECT app.reviewer_capability($1,$2) value',
          [a.id, a.sessionId],
        )
      )[0]!.value;
    },
    async command(
      a: AccountView,
      c: {
        command: string;
        target: string;
        operation: 'save' | 'approve' | 'suspend' | 'calibrate';
        revision: number;
        body: unknown;
      },
    ) {
      if (
        !uuid(c.command) ||
        !uuid(c.target) ||
        !Number.isInteger(c.revision) ||
        c.revision < 0
      )
        throw Error('INVALID_INPUT');
      const body = c.operation === 'save' ? reviewerValidation(c.body) : c.body;
      if (!body) throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: { scope: string; row_version: number } }>(
          'SELECT app.reviewer_command($1,$2,$3,$4,$5,$6,$7) value',
          [
            a.id,
            a.sessionId,
            c.command,
            c.target,
            c.operation,
            c.revision,
            body,
          ],
        )
      )[0]!.value;
    },
    close: () => db.close(),
  };
}

// Later assignment transactions must supply a locked real offered/accepted count.
// Unknown workload fails closed; this interface never creates an offer.
export interface ReviewerWorkloadRepository {
  activeOfferedOrAccepted(reviewerId: string): Promise<number | undefined>;
}
