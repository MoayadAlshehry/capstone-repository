/**
 * Bounded allocation/committee contention regression on an owned synthetic Demo.
 * The source database is preserved in a private dump; all allocation and assessment test writes occur
 * in a uniquely marked temporary database. No host or application service stops.
 * Keep generated authentication, database backup and detailed result files private.
 */
import { readFile, writeFile, open, mkdir, statfs } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const F = process.cwd();
process.umask(0o077);
assert.deepEqual(
  process.argv.slice(2),
  ['--run-owned-demo'],
  'Explicit disposable Demo verification flag required',
);
const available = Number(
  (await readFile('/proc/meminfo', 'utf8')).match(
    /^MemAvailable:\s+(\d+)/m,
  )?.[1],
);
assert(
  available >= 1500000,
  'Insufficient memory for bounded clone verification',
);
const disk = await statfs(F);
assert(
  disk.bavail * disk.bsize >= 4 * 1024 ** 3,
  'Insufficient free disk space',
);
const W =
  F +
  '/.local/release-checks/allocation-' +
  Date.now() +
  '-' +
  randomBytes(4).toString('hex');
await mkdir(W, { recursive: true, mode: 0o700 });
const { base, state } = await (
  await import(F + '/scripts/verify-owned.mjs')
).verifyOwned();
assert.equal(state.demo, true, 'Original synthetic Demo profile required');
assert.equal(
  JSON.parse(await readFile(F + '/.local/demo/journal.json', 'utf8')).ready,
  true,
  'Demo must be complete',
);
const cfg = JSON.parse(
    await readFile(F + '/.local/database/config.json', 'utf8'),
  ),
  env = JSON.parse(await readFile(F + '/.local/runtime.json', 'utf8')),
  identities = Object.values(
    JSON.parse(await readFile(F + '/.local/demo/identities.json', 'utf8')),
  );
assert(
  identities.every(
    (x) => typeof x.email === 'string' && x.email.endsWith('.local'),
  ),
  'Only the original synthetic account profile is supported',
);
const { Client } = createRequire(F + '/packages/db/package.json')('pg');
const config = (database, role) => ({
  host: '127.0.0.1',
  port: state.ports.db,
  user: 'capstone_' + role,
  password:
    cfg.passwords[
      role === 'bootstrap' ? 'bootstrap' : role === 'jobs' ? 'jobs' : 'runtime'
    ],
  database,
  statement_timeout: role === 'bootstrap' ? 30000 : 3000,
});
const admin = new Client(config('capstone_local', 'bootstrap'));
await admin.connect();
const record = (
  await admin.query(
    'SELECT c.submission_id,c.project_id,p.supervisor_id FROM app.evaluation_cases c JOIN app.projects p ON p.id=c.project_id JOIN app.committee_rounds r ON r.case_id=c.id WHERE p.supervisor_id=ANY($1::uuid[]) ORDER BY c.id LIMIT 1',
    [identities.map((x) => x.id)],
  )
).rows[0];
assert(record);
const person = identities.find((x) => x.id === record.supervisor_id);
assert(person);
const response = await fetch(base + '/api/auth/sign-in/email', {
  method: 'POST',
  headers: { Origin: base, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: person.email, password: person.password }),
});
assert.equal(response.status, 200, 'Real synthetic supervisor login');
const cookie = response.headers
  .getSetCookie()
  .map((x) => x.split(';')[0])
  .join('; ');
const { createAuthentication } = await import(F + '/packages/db/dist/auth.js');
const auth = createAuthentication({
  databaseUrl: env.DATABASE_URL,
  secret: env.AUTH_SECRET,
  baseURL: env.AUTH_BASE_URL,
  environment: 'local',
  localProvisioning: false,
});
const actor = await auth.account(new Headers({ cookie }));
assert.equal(actor.id, person.id);
await auth.close();
const name = 'capstone_test_' + randomBytes(8).toString('hex'),
  marker = 'capstone-allocation-check-' + state.owner,
  dump = W + '/preserved-fixture.dump';
let owner,
  jobs,
  readers = [],
  result = {
    status: 'RUNNING',
    scope:
      'Disposable clone; one allocation worker and four authorized committee reads',
    source_changed: false,
    source_manifest_sha256: createHash('sha256')
      .update(await readFile(F + '/SOURCE_MANIFEST.csv'))
      .digest('hex'),
    application_timeout_ms: 3000,
    maximum_concurrent_user_actions: 5,
  };
const states = [
  'evaluation_cases',
  'external_review_assignments',
  'internal_assessments',
  'committee_member_assessments',
  'committee_results',
  'committee_rounds',
  'evaluation_allocation_cursor',
  'evaluation_event_cursor',
  'evaluation_pair_status',
  'evaluation_progression',
];
async function fingerprints() {
  const out = {};
  for (const table of states) {
    const rows = (
      await owner.query(
        'SELECT to_jsonb(t) value FROM app.' +
          table +
          ' t ORDER BY to_jsonb(t)::text',
      )
    ).rows;
    out[table] = createHash('sha256')
      .update(JSON.stringify(rows))
      .digest('hex');
  }
  return out;
}
try {
  const file = await open(dump, 'wx', 0o600);
  const dumped = spawnSync(
    'docker',
    [
      'exec',
      state.project + '-postgres-1',
      'pg_dump',
      '-U',
      'capstone_bootstrap',
      '-d',
      'capstone_local',
      '-Fc',
    ],
    { stdio: ['ignore', file.fd, 'pipe'] },
  );
  await file.close();
  assert.equal(dumped.status, 0);
  await admin.query('CREATE DATABASE "' + name + '" OWNER capstone_migrator');
  await admin.query('COMMENT ON DATABASE "' + name + '" IS \'' + marker + "'");
  const input = await open(dump, 'r');
  const restored = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      state.project + '-postgres-1',
      'pg_restore',
      '-U',
      'capstone_bootstrap',
      '-d',
      name,
      '--exit-on-error',
    ],
    { stdio: [input.fd, 'ignore', 'pipe'] },
  );
  await input.close();
  assert.equal(restored.status, 0);
  owner = new Client(config(name, 'bootstrap'));
  jobs = new Client(config(name, 'jobs'));
  await owner.connect();
  await jobs.connect();
  await owner.query('ANALYZE');
  await jobs.query('SELECT app.first_pair_snapshot(true)');
  for (let i = 0; i < 4; i++) {
    const db = new Client(config(name, 'runtime'));
    await db.connect();
    readers.push(db);
  }
  let baseline = (
    await readers[0].query('SELECT app.committee_status($1,$2,$3) value', [
      actor.id,
      actor.sessionId,
      record.submission_id,
    ])
  ).rows[0].value;
  delete baseline.serverNow;
  const before = await fingerprints();
  const runs = [];
  for (const phase of ['installed-source']) {
    for (let round = 1; round <= 3; round++) {
      const observed = [];
      let done = false;
      const watch = async () => {
        while (!done) {
          const x = (
            await owner.query(
              'SELECT count(*)::int blocked FROM pg_stat_activity WHERE datname=$1 AND cardinality(pg_blocking_pids(pid))>0',
              [name],
            )
          ).rows[0];
          observed.push(x.blocked);
          await new Promise((r) => setTimeout(r, 10));
        }
      };
      const worker = (async () => {
        await jobs.query('BEGIN');
        const start = performance.now();
        try {
          await jobs.query('SELECT app.first_pair_snapshot(true)');
          return { status: 'PASS', ms: performance.now() - start };
        } catch (e) {
          return {
            status: 'FAIL',
            sqlstate: e.code,
            message: e.message,
            ms: performance.now() - start,
          };
        } finally {
          await jobs.query('ROLLBACK');
        }
      })();
      let lockObserved = false;
      const lockDeadline = performance.now() + 2500;
      while (performance.now() < lockDeadline && !lockObserved) {
        await owner.query('BEGIN');
        try {
          await owner.query(
            'SELECT id FROM app.projects WHERE id=$1 FOR UPDATE NOWAIT',
            [record.project_id],
          );
        } catch (e) {
          if (e.code === '55P03') lockObserved = true;
          else throw e;
        } finally {
          await owner.query('ROLLBACK');
        }
        if (!lockObserved) await new Promise((r) => setTimeout(r, 10));
      }
      assert(
        lockObserved,
        'Fixture must observe the real snapshot project lock before issuing reads',
      );
      const watcher = watch();
      const requests = readers.map(async (db) => {
        await db.query('BEGIN');
        const start = performance.now();
        try {
          const value = (
            await db.query('SELECT app.committee_status($1,$2,$3) value', [
              actor.id,
              actor.sessionId,
              record.submission_id,
            ])
          ).rows[0].value;
          delete value.serverNow;
          assert.deepEqual(value, baseline);
          return {
            status: 'PASS',
            ms: performance.now() - start,
            authorized_response_equal: true,
          };
        } catch (e) {
          return {
            status: 'FAIL',
            sqlstate: e.code,
            message: e.message,
            ms: performance.now() - start,
          };
        } finally {
          await db.query('ROLLBACK');
        }
      });
      const [allocation, ...committee] = await Promise.all([
        worker,
        ...requests,
      ]);
      done = true;
      await watcher;
      runs.push({
        phase,
        round,
        allocation,
        committee,
        project_lock_observed_before_reads: lockObserved,
        blocking_samples: observed.filter((x) => x > 0).length,
        max_blocked_readers: Math.max(0, ...observed),
      });
    }
  }
  assert(
    runs.every((x) => x.max_blocked_readers > 0),
    'Every round must exercise actual blocking',
  );
  const after = await fingerprints();
  assert.deepEqual(after, before);
  assert(
    runs.every(
      (x) =>
        x.allocation.status === 'PASS' &&
        x.committee.every((y) => y.status === 'PASS'),
    ),
    'Corrected overlap must complete every action',
  );
  const grants = (
    await owner.query(
      "SELECT has_function_privilege('capstone_runtime','app.allocation_snapshot()','EXECUTE') runtime_snapshot,has_function_privilege('capstone_jobs','app.allocation_snapshot()','EXECUTE') jobs_snapshot,has_function_privilege('capstone_jobs','app.allocation_snapshot_before_lead_consent()','EXECUTE') jobs_private_helper",
    )
  ).rows[0];
  assert.deepEqual(grants, {
    runtime_snapshot: false,
    jobs_snapshot: true,
    jobs_private_helper: false,
  });
  result = {
    ...result,
    status: 'PASS',
    runs,
    rollback_state_tables: states.length,
    rollback_fingerprints_equal: true,
    grants_preserved: grants,
    limits_changed: false,
  };
} catch (e) {
  result.status = 'FAIL';
  result.error = e.message;
  process.exitCode = 1;
} finally {
  for (const db of readers) await db.end();
  await jobs?.end();
  await owner?.end();
  const row = (
    await admin.query(
      "SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=$1",
      [name],
    )
  ).rows[0];
  if (row) {
    assert.equal(row.marker, marker);
    await admin.query('DROP DATABASE "' + name + '"');
  }
  await admin.end();
  await fetch(base + '/api/auth/sign-out', {
    method: 'POST',
    headers: {
      Origin: base,
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  await writeFile(W + '/RESULT.json', JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({
      status: result.status,
      private_result: W + '/RESULT.json',
      source_manifest_sha256: result.source_manifest_sha256,
      rounds: result.runs?.length ?? 0,
      error: result.status === 'FAIL' ? 'Inspect private result' : undefined,
    }),
  );
}
