import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { localComposeProject } from './local-docker-policy.js';

export const workspaceRoot = resolve(
  fileURLToPath(new URL('..', import.meta.url)),
);
export interface LocalDatabaseConfig {
  version: 1;
  workspaceRoot: string;
  developmentPort: number;
  testPort: number;
  passwords: {
    bootstrap: string;
    migration: string;
    runtime: string;
    jobs: string;
  };
}
export const localDirectory = resolve(workspaceRoot, '.local/database');
export function assertLocalTooling() {
  if (!['local', 'test'].includes(process.env['APP_ENV'] ?? 'local'))
    throw new Error(
      'Local infrastructure tooling refuses a server/non-local environment.',
    );
}
export async function loadLocalDatabaseConfig(): Promise<LocalDatabaseConfig> {
  assertLocalTooling();
  let config: LocalDatabaseConfig;
  try {
    config = JSON.parse(
      await readFile(join(localDirectory, 'config.json'), 'utf8'),
    ) as LocalDatabaseConfig;
  } catch {
    throw new Error(
      'Local database configuration unavailable. Run db:setup; private values are not printed.',
    );
  }
  if (
    config.version !== 1 ||
    config.workspaceRoot !== workspaceRoot ||
    !Object.values(config.passwords).every((value) =>
      /^[A-Za-z0-9_-]{43}$/.test(value),
    )
  )
    throw new Error(
      'Local database configuration invalid. Do not regenerate against an existing volume.',
    );
  return config;
}
export function databaseUrl(
  config: LocalDatabaseConfig,
  role: keyof LocalDatabaseConfig['passwords'],
  test = false,
  database = 'capstone_local',
) {
  const usernames = {
    bootstrap: 'capstone_bootstrap',
    migration: 'capstone_migrator',
    runtime: 'capstone_runtime',
    jobs: 'capstone_jobs',
  };
  return `postgresql://${usernames[role]}:${config.passwords[role]}@127.0.0.1:${test ? config.testPort : config.developmentPort}/${database}`;
}
export async function portIsFree(port: number) {
  return await new Promise<boolean>((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
  });
}
export async function setupLocalDatabase() {
  assertLocalTooling();
  try {
    await access(join(localDirectory, 'config.json'));
    await loadLocalDatabaseConfig();
    console.log('Existing local infrastructure secrets retained.');
    return;
  } catch (error) {
    if (!(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ))
      throw error;
  }
  for (const volume of [
    `${localComposeProject}_pg_development`,
    `${localComposeProject}_pg_test`,
  ]) {
    const result = spawnSync('docker', ['volume', 'inspect', volume], {
      stdio: 'ignore',
    });
    if (result.status === 0)
      throw new Error(
        'Existing owned database volumes require original private credentials. Restore .local/database; do not regenerate or reset volumes.',
      );
  }
  const developmentPort = (await portIsFree(5432))
    ? 5432
    : (await portIsFree(5433))
      ? 5433
      : 15432;
  const testPort =
    developmentPort !== 5433 && (await portIsFree(5433)) ? 5433 : 15433;
  if (!(await portIsFree(developmentPort)) || !(await portIsFree(testPort)))
    throw new Error(
      'Candidate database ports occupied. Resolve the conflict without stopping unrelated services.',
    );
  const config: LocalDatabaseConfig = {
    version: 1,
    workspaceRoot,
    developmentPort,
    testPort,
    passwords: {
      bootstrap: randomBytes(32).toString('base64url'),
      migration: randomBytes(32).toString('base64url'),
      runtime: randomBytes(32).toString('base64url'),
      jobs: randomBytes(32).toString('base64url'),
    },
  };
  await mkdir(localDirectory, { recursive: true, mode: 0o700 });
  for (const role of ['bootstrap', 'migration', 'runtime', 'jobs'] as const)
    await writeFile(
      join(localDirectory, `${role}.password`),
      config.passwords[role],
      { flag: 'wx', mode: 0o600 },
    );
  await writeFile(
    join(localDirectory, 'compose.env'),
    `CAPSTONE_COMPOSE_PROJECT=${localComposeProject}\nDB_PORT=${developmentPort}\nDB_TEST_PORT=${testPort}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  await writeFile(join(localDirectory, 'config.json'), JSON.stringify(config), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    `Local infrastructure secrets created in ignored .local/database; ports ${developmentPort}/${testPort}. No product accounts created.`,
  );
}
