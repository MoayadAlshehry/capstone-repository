import { readFile, mkdir, writeFile, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { authPasswordHash, authPasswordVerify } from '@capstone/db/auth';
import {
  withMigrationConnection,
  applyMigrations,
  createDisposableDatabase,
  dropDisposableDatabase,
} from '@capstone/db/migration';
import { root, json, noLinks } from '../automation/core.js';
import {
  loadLocalDatabaseConfig,
  databaseUrl,
  assertLocalTooling,
} from '../local-infrastructure.js';
export interface LocalAccount {
  id: string;
  role: string;
  email: string;
  password: string;
  name: string;
  university: 'DEV_A' | 'DEV_B' | null;
  status: 'active' | 'inactive' | 'suspended';
}
export interface AccountRegistry {
  version: 1;
  workspace: string;
  accounts: LocalAccount[];
}
export const directory = join(root, '.local/accounts'),
  registryPath = join(directory, 'local-accounts.json');
export async function localSecret() {
  assertLocalTooling();
  const dir = join(root, '.local/auth'),
    file = join(dir, 'secret');
  await noLinks(root, dir);
  await noLinks(root, file);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    const secret = await readFile(file, 'utf8');
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret))
      throw Error('Invalid private auth secret');
    return secret;
  } catch (e) {
    if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'))
      throw e;
  }
  const secret = randomBytes(32).toString('base64url');
  await writeFile(file, secret, { flag: 'wx', mode: 0o600 });
  return secret;
}
const templates: Omit<LocalAccount, 'id' | 'password'>[] = [
  {
    role: 'platform_admin',
    email: 'platform.admin@capstone.local',
    name: 'DEV Platform Administrator',
    university: null,
    status: 'active',
  },
  ...(['DEV_A', 'DEV_B'] as const).flatMap((university) =>
    ['university_admin', 'faculty_supervisor', 'student'].map((role) => ({
      role,
      email: `${role}.${university === 'DEV_A' ? 'a' : 'b'}@capstone.local`,
      name: `DEV ${university} ${role}`,
      university,
      status: 'active' as const,
    })),
  ),
  {
    role: 'partner',
    email: 'partner@capstone.local',
    name: 'DEV Partner',
    university: null,
    status: 'active',
  },
  {
    role: 'student',
    email: 'inactive@capstone.local',
    name: 'DEV Inactive Student',
    university: 'DEV_A',
    status: 'inactive',
  },
  {
    role: 'student',
    email: 'suspended@capstone.local',
    name: 'DEV Suspended Student',
    university: 'DEV_A',
    status: 'suspended',
  },
];
export function technicalRegistry(): AccountRegistry {
  return {
    version: 1,
    workspace: root,
    accounts: templates.map((a) => ({
      ...a,
      id: randomUUID(),
      password: randomBytes(24).toString('base64url'),
    })),
  };
}
// Two bounded Phase24 registrations supplement the unchanged ten-account registry.
// This is private local tooling, never imported by an application build.
export async function localPartnerAccounts(): Promise<LocalAccount[]> {
  const file = join(root, '.local/partners/normal-accounts.json');
  await noLinks(root, file);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return [];
    throw error;
  }
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some(
      (a) =>
        !a ||
        a.role !== 'partner' ||
        a.university !== null ||
        a.status !== 'active' ||
        ![
          'partner.phase24.one@capstone.local',
          'partner.phase24.two@capstone.local',
        ].includes(a.email) ||
        typeof a.password !== 'string' ||
        !/^.{24,128}$/.test(a.password) ||
        !/^[-a-f0-9]{36}$/.test(a.id),
    )
  )
    throw Error('Invalid private partner tooling registry');
  return value as LocalAccount[];
}
export async function localReviewerAccounts(): Promise<LocalAccount[]> {
  assertLocalTooling();
  let value: unknown;
  try {
    await noLinks(root, join(root, '.local/external-reviews/accounts.json'));
    value = await json(join(root, '.local/external-reviews/accounts.json'));
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT')
      return [];
    throw e;
  }
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    value.some(
      (a) =>
        a.email !== 'reviewer.workbench.b@capstone.local' ||
        a.role !== 'faculty_supervisor' ||
        a.university !== 'DEV_B' ||
        a.status !== 'active' ||
        typeof a.password !== 'string' ||
        a.password.length < 24 ||
        !/^[-a-f0-9]{36}$/.test(a.id),
    )
  )
    throw Error('Invalid private reviewer registry');
  return value as LocalAccount[];
}
function validate(registry: AccountRegistry) {
  if (
    registry.version !== 1 ||
    registry.workspace !== root ||
    registry.accounts.length !== 10 ||
    new Set(registry.accounts.map((a) => a.email)).size !== 10 ||
    registry.accounts.some(
      (a) => !/^[-a-f0-9]{36}$/.test(a.id) || !/^.{24,128}$/.test(a.password),
    )
  )
    throw Error('Invalid local credential registry');
  return registry;
}
export async function provision(
  url: string,
  registry: AccountRegistry,
  bootstrapOnly = false,
) {
  const hashed = new Map<string, string>();
  for (const a of registry.accounts)
    hashed.set(a.id, await authPasswordHash(a.password));
  return withMigrationConnection(url, async (client) => {
    await client.query('BEGIN');
    try {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('phase09_technical_accounts'))",
      );
      const universities = new Map<string, string>();
      if (!bootstrapOnly)
        for (const code of ['DEV_A', 'DEV_B']) {
          let row = (
            await client.query<{ id: string }>(
              'SELECT id FROM app.universities WHERE code=$1',
              [code],
            )
          ).rows[0];
          if (!row)
            row = (
              await client.query<{ id: string }>(
                'INSERT INTO app.universities(code,name_en,name_ar) VALUES($1,$2,$3) RETURNING id',
                [
                  code,
                  code.replace('_', '-') + ' — Technical test institution',
                  'مؤسسة اختبار تقنية ' + code,
                ],
              )
            ).rows[0];
          universities.set(code, row!.id);
          await client.query(
            "INSERT INTO app.departments(university_id,code,name_en,name_ar) VALUES($1,'CS','Computer Science','علوم الحاسب') ON CONFLICT(university_id,code) DO NOTHING",
            [row!.id],
          );
        }
      let created = 0;
      for (const a of registry.accounts) {
        if (bootstrapOnly && a.role !== 'platform_admin') continue;
        const existing = (
          await client.query<{
            id: string;
            role_code: string;
            university_id: string | null;
            account_status: string;
          }>(
            'SELECT id,role_code,university_id,account_status FROM app.users WHERE email=$1',
            [a.email],
          )
        ).rows[0];
        if (existing) {
          if (
            existing.id !== a.id ||
            existing.role_code !== a.role ||
            existing.university_id !==
              (a.university ? universities.get(a.university) : null) ||
            existing.account_status !== a.status
          )
            throw Error(
              'Existing technical identity drift; no governance overwrite',
            );
          const credential = (
            await client.query<{ password: string }>(
              "SELECT password FROM app.auth_accounts WHERE user_id=$1 AND provider_id='credential'",
              [a.id],
            )
          ).rows[0];
          if (
            !credential ||
            !(await authPasswordVerify({
              hash: credential.password,
              password: a.password,
            }))
          )
            throw Error('Credential registry mismatch; no silent rotation');
          continue;
        }
        if (
          a.role === 'platform_admin' &&
          (
            await client.query(
              "SELECT id FROM app.users WHERE role_code='platform_admin' LIMIT 1",
            )
          ).rowCount
        )
          throw Error('First platform administrator already exists');
        const university = a.university ? universities.get(a.university) : null;
        const department = university
          ? (
              await client.query<{ id: string }>(
                "SELECT id FROM app.departments WHERE university_id=$1 AND code='CS'",
                [university],
              )
            ).rows[0]!.id
          : null;
        await client.query(
          'INSERT INTO app.users(id,full_name,email,role_code,university_id,department_id,account_status,partner_status,organization_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            a.id,
            a.name,
            a.email,
            a.role,
            university ?? null,
            department,
            a.status,
            a.role === 'partner' ? 'approved' : null,
            a.role === 'partner' ? 'DEV technical organization' : null,
          ],
        );
        await client.query(
          "INSERT INTO app.auth_accounts(user_id,account_id,provider_id,password) VALUES($1,$2,'credential',$3)",
          [a.id, a.id, hashed.get(a.id)],
        );
        if (a.role === 'platform_admin')
          await client.query(
            `INSERT INTO app.audit_logs(actor_kind,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES('system','system.auth.bootstrap','user',$1,'{}','{"scope":"first_platform_admin","count":1}','Explicit local first administrator bootstrap',$2,$3)`,
            [a.id, randomUUID(), randomUUID()],
          );
        created++;
      }
      await client.query('COMMIT');
      return { created, total: bootstrapOnly ? 1 : registry.accounts.length };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
}
export async function ensureAccounts() {
  assertLocalTooling();
  await noLinks(root, directory);
  await noLinks(root, registryPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const config = await loadLocalDatabaseConfig();
  let registry: AccountRegistry;
  try {
    registry = validate(await json<AccountRegistry>(registryPath));
  } catch (e) {
    if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'))
      throw e;
    const bootstrapFile = join(directory, 'bootstrap-admin.json');
    let bootstrap: LocalAccount | undefined;
    try {
      bootstrap = await json<LocalAccount>(bootstrapFile);
    } catch (e) {
      if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'))
        throw e;
    }
    const exists = await withMigrationConnection(
      databaseUrl(config, 'migration'),
      async (c) =>
        (
          await c.query(
            "SELECT id FROM app.users WHERE email LIKE '%@capstone.local' OR role_code='platform_admin'",
          )
        ).rows,
    );
    if (
      exists.length &&
      (!bootstrap || exists.length !== 1 || exists[0]?.['id'] !== bootstrap.id)
    )
      throw Error(
        'Technical accounts exist without plaintext registry; credentials are not rotated',
      );
    registry = technicalRegistry();
    if (bootstrap) registry.accounts[0] = bootstrap;
    await writeFile(registryPath, JSON.stringify(registry, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  }
  const result = await provision(databaseUrl(config, 'migration'), registry);
  await localSecret();
  await writeFile(
    join(root, '.local/dev-accounts.json'),
    JSON.stringify(registry, null, 2) + '\n',
    { mode: 0o600 },
  );
  await writeFile(
    join(root, '.local/DEV_ACCOUNTS.md'),
    '# LOCAL DEVELOPMENT ONLY\n\nReveal with corepack pnpm accounts:local --show.\n\n' +
      [
        ...registry.accounts,
        ...(await localPartnerAccounts()),
        ...(await localReviewerAccounts()),
      ]
        .map((a) => `${a.role} | ${a.email} | ${a.password}`)
        .join('\n') +
      '\n',
    { mode: 0o600 },
  );
  return { registry, result };
}
export async function bootstrapAdmin(email: string) {
  assertLocalTooling();
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error('Explicit valid administrator email required');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await noLinks(root, directory);
  await noLinks(root, registryPath);
  const file = join(directory, 'bootstrap-admin.json');
  const config = await loadLocalDatabaseConfig();
  try {
    const existing = await json<LocalAccount>(file);
    if (existing.email !== email)
      throw Error('Bootstrap email differs; no second bootstrap');
    await provision(
      databaseUrl(config, 'migration'),
      { version: 1, workspace: root, accounts: [existing] },
      true,
    );
    return { created: 0, email };
  } catch (e) {
    if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'))
      throw e;
  }
  const present = await withMigrationConnection(
    databaseUrl(config, 'migration'),
    async (c) =>
      (
        await c.query(
          "SELECT id FROM app.users WHERE role_code='platform_admin' LIMIT 1",
        )
      ).rowCount,
  );
  if (present)
    throw Error(
      'First platform administrator already exists; original private registry required',
    );
  const a: LocalAccount = {
    ...templates[0]!,
    email,
    id: randomUUID(),
    password: randomBytes(24).toString('base64url'),
  };
  await writeFile(file, JSON.stringify(a, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  await provision(
    databaseUrl(config, 'migration'),
    { version: 1, workspace: root, accounts: [a] },
    true,
  );
  return { created: 1, email };
}
export interface AuthFixture {
  version: 1;
  run: string;
  database: string;
  marker: string;
  accounts: AccountRegistry;
  secret: string;
}
export async function prepareFixture(
  bootstrapOnly = false,
): Promise<AuthFixture> {
  assertLocalTooling();
  const config = await loadLocalDatabaseConfig(),
    run = randomUUID(),
    database = 'capstone_test_' + randomBytes(8).toString('hex');
  await createDisposableDatabase(
    databaseUrl(config, 'bootstrap', true),
    database,
    'test',
    config.testPort,
  );
  const fixture: AuthFixture = {
    version: 1,
    run,
    database,
    marker: randomBytes(24).toString('hex'),
    accounts: technicalRegistry(),
    secret: randomBytes(32).toString('base64url'),
  };
  try {
    await applyMigrations(
      databaseUrl(config, 'migration', true, database),
      join(root, 'packages/db/migrations'),
    );
    await withMigrationConnection(
      databaseUrl(config, 'migration', true, database),
      async (c) => {
        await c.query(
          'CREATE TABLE app.auth_fixture_marker(marker text PRIMARY KEY)',
        );
        await c.query('INSERT INTO app.auth_fixture_marker VALUES($1)', [
          fixture.marker,
        ]);
      },
    );
    await provision(
      databaseUrl(config, 'migration', true, database),
      fixture.accounts,
      bootstrapOnly,
    );
    const dir = join(root, '.local/auth-fixtures');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(
      join(dir, run + '.json'),
      JSON.stringify(fixture, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    return fixture;
  } catch (e) {
    await dropDisposableDatabase(
      databaseUrl(config, 'bootstrap', true),
      database,
      'test',
      config.testPort,
    );
    throw e;
  }
}
export async function resetFixture(run: string) {
  assertLocalTooling();
  if (!/^[-a-f0-9]{36}$/.test(run))
    throw Error('Marked generated fixture run required');
  const path = join(root, '.local/auth-fixtures', run + '.json');
  await noLinks(root, path);
  const fixture = await json<AuthFixture>(path),
    config = await loadLocalDatabaseConfig();
  if (
    fixture.version !== 1 ||
    fixture.run !== run ||
    !/^capstone_test_[a-f0-9]{16}$/.test(fixture.database) ||
    !/^[-a-f0-9]{48}$/.test(fixture.marker)
  )
    throw Error('Unsafe/unmarked fixture refused');
  const marker = await withMigrationConnection(
    databaseUrl(config, 'migration', true, fixture.database),
    async (c) =>
      (await c.query('SELECT marker FROM app.auth_fixture_marker')).rows,
  );
  if (marker.length !== 1 || marker[0]?.['marker'] !== fixture.marker)
    throw Error('Fixture marker mismatch');
  // Inspection above is the dry-run; deletion is only the verified disposable database.
  await dropDisposableDatabase(
    databaseUrl(config, 'bootstrap', true),
    fixture.database,
    'test',
    config.testPort,
  );
  await rename(path, path + '.disposed');
  return { outcome: 'PASS', run, developmentAccounts: 'untouched' };
}
export async function authStateFingerprint(registry: AccountRegistry) {
  const migrations = await readdir(join(root, 'packages/db/migrations'));
  const migration = Buffer.concat(
    await Promise.all(
      migrations
        .filter((p) => p.endsWith('.sql'))
        .sort()
        .map((p) => readFile(join(root, 'packages/db/migrations', p))),
    ),
  );
  return createHash('sha256')
    .update(JSON.stringify(registry))
    .update(migration)
    .update(await localSecret())
    .update(await readFile(join(root, 'packages/db/src/auth.ts')))
    .update(await readFile(join(root, 'apps/web/auth/server.ts')))
    .update(await readFile(join(root, 'tools/automation/processes.ts')))
    .digest('hex');
}
