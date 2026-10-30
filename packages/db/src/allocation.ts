import 'server-only';
import pg from 'pg';
import { createRuntimeDatabase, safeDatabaseError } from './index.js';
import type { AccountView } from './auth.js';
export function createAllocationRepository(url: string) {
  const db = createRuntimeDatabase(url);
  return {
    async view<T>(a: AccountView, run?: string) {
      return (
        await db.query<{ value: T }>(
          'SELECT app.allocation_view($1,$2,$3) value',
          [a.id, a.sessionId, run ?? null],
        )
      )[0]!.value;
    },
    close: db.close,
  };
}
export function createAllocationJobs(url: string) {
  if (new URL(url).username !== 'capstone_jobs')
    throw Error('INVALID_JOB_ROLE');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  pool.on('error', () => {
    // A lost idle connection is discarded by pg. The next real operation
    // reports availability safely and obtains a replacement connection.
  });
  return {
    async hasCases(): Promise<boolean> {
      try {
        const value = (
          await pool.query(
            'SELECT app.allocation_has_cases() AS value',
          )
        ).rows[0]?.value;
        if (typeof value !== 'boolean')
          throw Error('INVALID_ALLOCATION_SNAPSHOT');
        return value;
      } catch (e) {
        throw safeDatabaseError(e, 'ALLOCATION_SNAPSHOT_UNAVAILABLE');
      }
    },
    async transaction<T>(
      run: string,
      work: (tx: {
        snapshot: <S>() => Promise<S>;
        prepare: (
          reviewer: string,
          packet: string,
          slot: number,
        ) => Promise<{
          files: { key: string; size: number; sha256: string }[];
        }>;
        commit: (
          revision: number,
          inputs: unknown,
          outputs: unknown,
          selected?: { reviewer: string; packet: string; slot: number },
        ) => Promise<T>;
      }) => Promise<T>,
    ): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = (
          await client.query('SELECT app.allocation_result($1) value', [run])
        ).rows[0].value;
        if (existing) {
          await client.query('COMMIT');
          return existing as T;
        }
        const value = await work({
          snapshot: async <S>() =>
            (await client.query('SELECT app.allocation_snapshot() value'))
              .rows[0].value as S,
          prepare: async (reviewer, packet, slot) => {
            await client.query(
              "SELECT app.external_policy_register($1,'scheduler-v1')",
              [run],
            );
            return (
              await client.query(
                'SELECT app.external_offer($1,$2,$3,$4,$3,false) value',
                [reviewer, packet, run, slot],
              )
            ).rows[0].value;
          },
          commit: async (revision, inputs, outputs, selected) =>
            (
              await client.query(
                'SELECT app.allocation_commit($1,$2,$3,$4,$5,$6,$7) value',
                [
                  run,
                  revision,
                  JSON.stringify(inputs),
                  JSON.stringify(outputs),
                  selected?.reviewer ?? null,
                  selected?.packet ?? null,
                  selected?.slot ?? null,
                ],
              )
            ).rows[0].value as T,
        });
        await client.query('COMMIT');
        return value;
      } catch (e) {
        await client.query('ROLLBACK');
        throw safeDatabaseError(e, 'ALLOCATION_FAILED');
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
