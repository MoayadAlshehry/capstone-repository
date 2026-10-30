import type {
  RuntimeDatabase,
  TransactionRunner,
  TransactionScope,
} from './ports.js';
export type {
  RuntimeDatabase,
  TransactionRunner,
  TransactionScope,
} from './ports.js';
import 'server-only';
import { randomUUID } from 'node:crypto';
import pg, { type QueryResultRow, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { BASELINE_HASH } from './baseline.js';
export {
  coreRepository,
  CoreSession,
  type PrincipalRow,
  type DepartmentRow,
  type AuditRow,
} from './core.js';

export class DatabaseError extends Error {
  constructor(
    readonly code: string,
    readonly sqlState?: string,
  ) {
    super(
      'Database operation failed. Check service availability, role privileges and migrations.',
    );
    this.name = 'DatabaseError';
  }
}
export function safeDatabaseError(error: unknown, code: string): DatabaseError {
  const state =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[0-9A-Z]{5}$/.test(error.code)
      ? error.code
      : undefined;
  return new DatabaseError(code, state);
}
export function createRuntimeDatabase(
  connectionString: string,
): RuntimeDatabase {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new DatabaseError('INVALID_CONNECTION');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.username !== 'capstone_runtime' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new DatabaseError('INVALID_RUNTIME_ROLE');
  const pool = new pg.Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 1500,
    idleTimeoutMillis: 5000,
    statement_timeout: 3000,
  });
  pool.on('error', () => {
    /* next real probe reports failure; never log driver connection details */
  });
  const orm = drizzle(pool);
  const query = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> => {
    try {
      return (await pool.query<T>(text, [...values])).rows;
    } catch (error) {
      throw safeDatabaseError(error, 'QUERY_FAILED');
    }
  };
  const transactions: TransactionRunner = {
    async run<T>(
      operation: (scope: TransactionScope) => Promise<T>,
    ): Promise<T> {
      let client: PoolClient;
      try {
        client = await pool.connect();
      } catch (error) {
        throw safeDatabaseError(error, 'CONNECT_FAILED');
      }
      let broken = false;
      try {
        await client.query('BEGIN');
        const result = await operation({
          transactionId: randomUUID(),
          query: async <R extends QueryResultRow = QueryResultRow>(
            text: string,
            values: readonly unknown[] = [],
          ) => (await client.query<R>(text, [...values])).rows,
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          broken = true;
        }
        throw safeDatabaseError(error, 'TRANSACTION_FAILED');
      } finally {
        client.release(broken);
      }
    },
  };
  return {
    query,
    transactions,
    async ready(): Promise<void> {
      try {
        await orm.execute(sql`SELECT 1`);
        const identity = await query<{ safe: boolean }>(
          "SELECT current_user='capstone_runtime' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT has_database_privilege(current_user,current_database(),'CREATE') AS safe FROM pg_roles WHERE rolname=current_user",
        );
        if (!identity[0]?.safe) throw new DatabaseError('INVALID_RUNTIME_ROLE');
        const result = await query<{ extension: boolean; baseline: boolean }>(
          "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS extension, EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1) AS baseline",
          [BASELINE_HASH],
        );
        if (!result[0]?.extension || !result[0].baseline)
          throw new DatabaseError('BASELINE_MISSING');
      } catch (error) {
        if (error instanceof DatabaseError) throw error;
        throw safeDatabaseError(error, 'READINESS_FAILED');
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
