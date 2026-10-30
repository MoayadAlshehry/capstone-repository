import 'server-only';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
import {
  uuid,
  stamp,
  validAuditFilters,
  type NoticePage,
  type NoticeLink,
  type AuditPage,
} from './governance-types.js';
const noticeTypes = new Set([
  'evaluation.governance.authorize',
  'evaluation.governance.correct',
  'evaluation.governance.invalidate',
  'evaluation.governance.hold',
  'evaluation.governance.resolve',
  'evaluation.governance.explain',
  'evaluation.governance.retain',
  'evaluation.governance.feedback',
  'academic.final.requested',
  'academic.final.accepted',
  'academic.final.revision_requested',
  'partner.resubmit',
  'core.department.changed',
  'partner.approve',
  'partner-access.request',
  'submission.created',
  'assessment.finalized',
  'evaluation.finalized',
  'evaluation.draft.saved',
  'checkpoint.sent',
  'checkpoint.changes',
  'checkpoint.accept',
  'reminder.review-offer',
  'partner.reject',
  'partner.suspend',
  'partner.reapprove',
  'partner-access.approve',
  'partner-access.deny',
  'partner-access.revoke',
  'partner-access.protective-revoke',
  'review.revision',
  'review.reject',
  'review.published',
  'admin.changed',
  'auth.password.changed',
  'auth.lifecycle.completed',
  'assignment.changed',
  'admin.csv.imported',
  'draft.saved',
  'file.visibility.changed',
  'edition.created',
  'reminder.review-task',
  'external-review.offer',
  'external-review.accept',
  'external-review.decline',
  'external-review.withdraw',
  'external-review.finalize',
  'external-review.cancel',
  'external-review.expire',
]);
export function createGovernance(url: string) {
  const db = createRuntimeDatabase(url);
  return {
    async count(a: AccountView): Promise<number> {
      return Number(
        (
          await db.query<{ value: number }>(
            'SELECT app.notice_count($1,$2) value',
            [a.id, a.sessionId],
          )
        )[0]!.value,
      );
    },
    async notices(
      a: AccountView,
      unread = false,
      before?: string,
      beforeId?: string,
    ): Promise<NoticePage> {
      if (
        (before && !stamp(before)) ||
        (beforeId && !uuid(beforeId)) ||
        Boolean(before) !== Boolean(beforeId)
      )
        throw Error('INVALID_INPUT');
      const value = (
        await db.query<{ value: NoticePage }>(
          'SELECT app.notice_query($1,$2,$3,$4,$5) value',
          [a.id, a.sessionId, unread, before ?? null, beforeId ?? null],
        )
      )[0]!.value;
      value.items = value.items.map((n) => ({
        ...n,
        type: noticeTypes.has(n.type) ? n.type : 'workflow.updated',
      }));
      return value;
    },
    async read(a: AccountView, id?: string) {
      if (id !== undefined && !uuid(id)) throw Error('INVALID_INPUT');
      await db.query('SELECT app.notice_read($1,$2,$3)', [
        a.id,
        a.sessionId,
        id ?? null,
      ]);
    },
    async target(a: AccountView, id: string): Promise<NoticeLink> {
      if (!uuid(id)) throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: NoticeLink }>(
          'SELECT app.notice_target($1,$2,$3) value',
          [a.id, a.sessionId, id],
        )
      )[0]!.value;
    },
    async context(
      a: AccountView,
      id: string,
    ): Promise<{
      link: NoticeLink;
      project: string | null;
      request: string | null;
      context: string | null;
    }> {
      if (!uuid(id)) throw Error('INVALID_INPUT');
      return (
        await db.query<{
          value: {
            link: NoticeLink;
            project: string | null;
            request: string | null;
            context: string | null;
          };
        }>('SELECT app.notice_context($1,$2,$3) value', [a.id, a.sessionId, id])
      )[0]!.value;
    },
    async audit(
      a: AccountView,
      filters: unknown,
      oversight?: string,
      reason?: string,
      command?: string,
    ): Promise<AuditPage> {
      if (
        !validAuditFilters(filters) ||
        (oversight !== undefined &&
          (!uuid(oversight) ||
            !uuid(command) ||
            typeof reason !== 'string' ||
            [...reason.trim()].length < 3 ||
            [...reason].length > 400))
      )
        throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: AuditPage }>(
          'SELECT app.governance_audit($1,$2,$3,$4,$5,$6) value',
          [
            a.id,
            a.sessionId,
            filters,
            oversight ?? null,
            reason ?? null,
            command ?? null,
          ],
        )
      )[0]!.value;
    },
    close: () => db.close(),
  };
}
export function createJobRepository(url: string) {
  const u = new URL(url);
  if (
    (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') ||
    u.username !== 'capstone_jobs' ||
    !u.password ||
    u.hash ||
    u.search
  )
    throw Error('INVALID_JOB_CONFIGURATION');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  pool.on('error', () => {
    // pg disposes the failed idle client. Real job/probe calls still reject
    // and the worker keeps its existing retry and readiness behavior.
  });
  return {
    async prepareQueue(sql: string) {
      if (
        createHash('sha256').update(sql).digest('hex') !==
        '0555d471519998db42501e884c33350f073989c152ec113a58f7c98eb775192d'
      )
        throw Error('UNRECOGNIZED_QUEUE_SCHEMA');
      const c = await pool.connect();
      try {
        await c.query(
          "SELECT pg_advisory_lock(hashtextextended(current_database()||'.queue-bootstrap-v1',26))",
        );
        const exists = (
          await c.query<{ present: boolean }>(
            "SELECT to_regclass('jobs.version') IS NOT NULL present",
          )
        ).rows[0]!.present;
        if (!exists) await c.query(sql);
      } catch {
        await c.query('ROLLBACK');
        throw Error('QUEUE_SCHEMA_SETUP_FAILED');
      } finally {
        await c.query(
          "SELECT pg_advisory_unlock(hashtextextended(current_database()||'.queue-bootstrap-v1',26))",
        );
        c.release();
      }
    },
    register: async (
      id: string,
      recipient: string,
      kind: 'review-offer' | 'review-task',
      deadline: string,
    ) => {
      if (!uuid(id) || !uuid(recipient) || !stamp(deadline))
        throw Error('INVALID_INPUT');
      await pool.query('SELECT app.reminder_register($1,$2,$3,$4)', [
        id,
        recipient,
        kind,
        deadline,
      ]);
    },
    resolve: async (id: string) => {
      if (!uuid(id)) throw Error('INVALID_INPUT');
      await pool.query('SELECT app.reminder_resolve($1)', [id]);
    },
    deliver: async (id: string) => {
      if (!uuid(id)) throw Error('INVALID_INPUT');
      return (
        await pool.query<{ value: string }>(
          'SELECT app.reminder_deliver($1) value',
          [id],
        )
      ).rows[0]!.value;
    },
    cleanup: async (
      remove: (key: string, kind: 'object' | 'transfer') => Promise<void>,
    ) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query("SET LOCAL statement_timeout='30s'");
        const rows = (
          await c.query<{ key: string; kind: 'object' | 'transfer' }>(
            'SELECT * FROM app.worker_cleanup()',
          )
        ).rows;
        for (const row of rows) await remove(row.key, row.kind);
        await c.query('COMMIT');
        return rows.length;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    reminderEvidence: async (id: string) =>
      (
        await pool.query<{
          value: { key: string; size: number; sha256: string }[] | null;
        }>('SELECT app.external_reminder_evidence($1) value', [id])
      ).rows[0]!.value,
    pendingReviewReminders: async () =>
      (
        await pool.query<{ value: { id: string; deadline: string }[] }>(
          'SELECT app.external_pending_reminders() value',
        )
      ).rows[0]!.value,
    events: async () =>
      Number(
        (
          await pool.query<{ value: string }>(
            'SELECT app.worker_event_check() value',
          )
        ).rows[0]!.value,
      ),
    allocationEvents: async () =>
      (
        await pool.query<{ id: string }>(
          'SELECT app.allocation_pending_events() id',
        )
      ).rows.map((r) => r.id),
    allocationEventQueued: async (id: string) => {
      await pool.query('SELECT app.allocation_event_queued($1)', [id]);
    },
    close: () => pool.end(),
  };
}
