import 'server-only';
import pg from 'pg';
import {
  createRuntimeDatabase,
  safeDatabaseError,
  type TransactionScope,
} from './index.js';
import type { AccountView } from './auth.js';
export function createExternalRepository(url: string) {
  const db = createRuntimeDatabase(url);
  const call = async <T>(
    name: string,
    values: unknown[],
    tx?: TransactionScope,
  ) =>
    (
      await (tx ?? db).query<{ value: T }>(
        `SELECT app.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) value`,
        values,
      )
    )[0]!.value;
  return {
    view: <T>(a: AccountView, id?: string) =>
      call<T>('external_view', [a.id, a.sessionId, id ?? null]),
    command: (
      a: AccountView,
      id: string,
      operation: string,
      revision: number,
      body: unknown,
      command: string,
      commit: boolean,
      tx: TransactionScope,
    ) =>
      call<{
        completed?: unknown;
        files?: { key: string; size: number; sha256: string }[];
      }>(
        'external_command',
        [
          a.id,
          a.sessionId,
          id,
          operation,
          revision,
          JSON.stringify(body),
          command,
          commit,
        ],
        tx,
      ),
    receipt: (a: AccountView, id: string, command: string) =>
      call<unknown>('external_receipt', [a.id, a.sessionId, id, command]),
    check: (a: AccountView, id: string, revision: number, body: unknown) =>
      call<{
        total: number;
        quarterPoints: number;
        revision: number;
        rubric: string;
      }>('external_check', [
        a.id,
        a.sessionId,
        id,
        revision,
        JSON.stringify(body),
      ]),
    readiness: (a: AccountView, id: string) =>
      call<{ files: { key: string; size: number; sha256: string }[] }>(
        'external_task_readiness',
        [a.id, a.sessionId, id],
      ),
    concealed: (a: AccountView, project?: string) =>
      call<{ project: string; version: string }[]>('external_concealed', [
        a.id,
        a.sessionId,
        project ?? null,
      ]),
    transaction: db.transactions.run.bind(db.transactions),
    close: db.close,
  };
}
// Jobs-only. No route or human account can register allocation provenance or offer.
export function createExternalAllocator(url: string) {
  const u = new URL(url);
  if (u.username !== 'capstone_jobs' || u.search || u.hash)
    throw Error('INVALID_JOB_ROLE');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  pool.on('error', () => {
    // Keep background connection failures out of uncaught process errors.
    // Actual operations still reject through the safe database boundary.
  });
  return {
    async offer(
      c: {
        reviewer: string;
        packet: string;
        run: string;
        slot: number;
        command: string;
      },
      verify: (
        files: { key: string; size: number; sha256: string }[],
      ) => Promise<void>,
    ) {
      const tx = await pool.connect();
      try {
        await tx.query('BEGIN');
        const values = [c.reviewer, c.packet, c.run, c.slot, c.command];
        const p = (
          await tx.query(
            'SELECT app.external_offer($1,$2,$3,$4,$5,false) value',
            values,
          )
        ).rows[0].value;
        if (!p.replayed) await verify(p.files ?? []);
        const r = (
          await tx.query(
            'SELECT app.external_offer($1,$2,$3,$4,$5,true) value',
            values,
          )
        ).rows[0].value;
        await tx.query('COMMIT');
        return r as { assignment: string; status: string };
      } catch (e) {
        await tx.query('ROLLBACK');
        throw safeDatabaseError(e, 'ALLOCATION_FAILED');
      } finally {
        tx.release();
      }
    },
    async register(run: string, kind: 'technical-fixture-v1' | 'scheduler-v1') {
      if (
        kind === 'technical-fixture-v1' &&
        !['local', 'test'].includes(process.env['APP_ENV'] ?? 'local')
      )
        throw Error('TECHNICAL_ALLOCATOR_REFUSES_SERVER');
      await pool.query('SELECT app.external_policy_register($1,$2)', [
        run,
        kind,
      ]);
    },
    close: () => pool.end(),
  };
}
