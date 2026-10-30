import 'server-only';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { DatabaseError, safeDatabaseError } from './index.js';

export async function applyMigrations(
  connectionString: string,
  migrationsFolder: string,
): Promise<void> {
  try {
    const url = new URL(connectionString);
    if (
      url.username !== 'capstone_migrator' ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.search !== '' ||
      url.hash !== ''
    )
      throw new DatabaseError('INVALID_MIGRATION_ROLE');
  } catch {
    throw new DatabaseError('INVALID_MIGRATION_CONNECTION');
  }
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 2000,
    statement_timeout: 10000,
  });
  pool.on('error', () => {});
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } catch (error) {
    throw safeDatabaseError(error, 'MIGRATION_FAILED');
  } finally {
    await pool.end();
  }
}
const testName = /^capstone_test_[a-f0-9]{16}$/;
export function assertDisposableTarget(
  urlValue: string,
  database: string,
  environment: string,
  expectedPort: number,
) {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new DatabaseError('UNSAFE_TEST_TARGET');
  }
  if (
    environment !== 'test' ||
    url.hostname !== '127.0.0.1' ||
    Number(url.port) !== expectedPort ||
    url.username !== 'capstone_bootstrap' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.search !== '' ||
    url.hash !== '' ||
    !testName.test(database)
  )
    throw new DatabaseError('UNSAFE_TEST_TARGET');
}
export async function withBootstrap<T>(
  urlValue: string,
  operation: (client: pg.Client) => Promise<T>,
): Promise<T> {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new DatabaseError('UNSAFE_BOOTSTRAP_TARGET');
  }
  if (
    url.username !== 'capstone_bootstrap' ||
    url.hostname !== '127.0.0.1' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new DatabaseError('UNSAFE_BOOTSTRAP_TARGET');
  const client = new pg.Client({
    connectionString: urlValue,
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    return await operation(client);
  } catch (error) {
    throw safeDatabaseError(error, 'BOOTSTRAP_OPERATION_FAILED');
  } finally {
    await client.end();
  }
}
export async function withMigrationConnection<T>(
  urlValue: string,
  operation: (client: pg.Client) => Promise<T>,
): Promise<T> {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new DatabaseError('INVALID_MIGRATION_ROLE');
  }
  if (
    url.username !== 'capstone_migrator' ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new DatabaseError('INVALID_MIGRATION_ROLE');
  const client = new pg.Client({
    connectionString: urlValue,
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    return await operation(client);
  } catch (error) {
    throw safeDatabaseError(error, 'MIGRATION_OPERATION_FAILED');
  } finally {
    await client.end();
  }
}
export async function createDisposableDatabase(
  bootstrapUrl: string,
  database: string,
  environment: string,
  expectedPort: number,
) {
  assertDisposableTarget(bootstrapUrl, database, environment, expectedPort);
  await withBootstrap(bootstrapUrl, async (client) => {
    await client.query(
      `CREATE DATABASE "${database}" TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C.UTF-8'`,
    );
    await client.query(
      `COMMENT ON DATABASE "${database}" IS 'capstone disposable infrastructure test'`,
    );
    await client.query(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`);
    await client.query(
      `GRANT CONNECT, CREATE ON DATABASE "${database}" TO capstone_migrator`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE "${database}" TO capstone_runtime, capstone_jobs`,
    );
  });
  const url = new URL(bootstrapUrl);
  url.pathname = `/${database}`;
  await withBootstrap(url.href, async (client) => {
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await client.query('GRANT CREATE ON SCHEMA public TO capstone_migrator');
  });
}
export async function dropDisposableDatabase(
  bootstrapUrl: string,
  database: string,
  environment: string,
  expectedPort: number,
) {
  assertDisposableTarget(bootstrapUrl, database, environment, expectedPort);
  await withBootstrap(bootstrapUrl, async (client) => {
    const marker = await client.query<{ marker: string }>(
      "SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=$1",
      [database],
    );
    if (marker.rows[0]?.marker !== 'capstone disposable infrastructure test')
      throw new DatabaseError('UNSAFE_TEST_TARGET');
    await client.query(`DROP DATABASE "${database}"`);
  });
}
