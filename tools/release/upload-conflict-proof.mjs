/** Optional real-HTTP upload conflict proof on an owned original-Demo install. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyOwned } from '../../scripts/verify-owned.mjs';
const { base, state, proof } = await verifyOwned();
const identities = JSON.parse(
  await readFile('.local/demo/identities.json', 'utf8'),
);
const scenarios = JSON.parse(
  await readFile('.local/demo/scenarios.json', 'utf8'),
);
const person = identities['s01-author-1'],
  record = scenarios.S01;
assert(person?.email.endsWith('.local') && record?.project && record?.version);
const env = JSON.parse(await readFile('.local/runtime.json', 'utf8'));
const endpoint = (env.UPLOAD_BROWSER_ORIGIN || base).replace(/\/$/, '');
assert.equal(new URL(endpoint).hostname, '127.0.0.1');
assert(
  [state.ports.web, state.ports.upload].includes(
    Number(new URL(endpoint).port),
  ),
);
const login = await fetch(base + '/api/auth/sign-in/email', {
  method: 'POST',
  headers: { Origin: base, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: person.email, password: person.password }),
});
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .map((v) => v.split(';')[0])
  .join('; ');
const headers = { Origin: base, Cookie: cookie, 'Tus-Resumable': '1.0.0' };
const created = new Set(),
  checks = [];
async function view() {
  const r = await fetch(
    endpoint +
      '/files/state?' +
      new URLSearchParams({ project: record.project, version: record.version }),
    { headers },
  );
  assert.equal(r.status, 200);
  return r.json();
}
async function create(path, size, correlation = randomUUID()) {
  const m = {
    project: record.project,
    version: record.version,
    path,
    correlation,
    fingerprint: 'a'.repeat(64) + ':' + correlation,
  };
  const r = await fetch(endpoint + '/files/tus', {
    method: 'POST',
    headers: {
      ...headers,
      'Upload-Length': String(size),
      'Upload-Metadata': Object.entries(m)
        .map(([k, v]) => k + ' ' + Buffer.from(v).toString('base64'))
        .join(','),
    },
  });
  const location = r.headers.get('location');
  if (r.status === 201) {
    assert(location);
    const u = new URL(location, endpoint);
    assert.equal(u.origin, endpoint);
    created.add(u.href);
  }
  return { status: r.status, location, body: await r.text() };
}
async function cancel(url) {
  const r = await fetch(url, { method: 'DELETE', headers });
  assert.equal(r.status, 204);
  created.delete(url);
}
const before = await view();
assert(before.canUpload);
assert(
  before.quota.available >= 2000000,
  'At least 2 MB of available quota is required',
);
let outcome = 'RUNNING',
  failure;
try {
  const tooLarge = await create('limit-' + randomUUID() + '.txt', 250000001);
  assert.equal(tooLarge.status, 413);
  assert.deepEqual((await view()).quota, before.quota);
  checks.push({ id: 'OVERSIZED_FILE', status: 413, no_reservation: true });
  const correlation = randomUUID(),
    path = 'replay-' + randomUUID() + '.txt';
  const a = await create(path, 1000000, correlation),
    b = await create(path, 1000000, correlation);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(a.location, b.location);
  assert.equal((await view()).quota.reserved, before.quota.reserved + 1000000);
  checks.push({
    id: 'IDEMPOTENT_CREATION',
    same_upload: true,
    reservation_count: 1,
  });
  await cancel(new URL(a.location, endpoint).href);
  const racePath = 'race-' + randomUUID() + '.txt',
    pair = await Promise.all([
      create(racePath, 1000000),
      create(racePath, 1000000),
    ]);
  assert.deepEqual(pair.map((x) => x.status).sort(), [201, 409]);
  assert.equal(
    JSON.parse(pair.find((x) => x.status === 409).body).error,
    'UPLOAD_CONFLICT',
  );
  assert.equal((await view()).quota.reserved, before.quota.reserved + 1000000);
  checks.push({
    id: 'CONCURRENT_PATH_RESERVATION',
    statuses: [201, 409],
    one_reservation: true,
  });
  outcome = 'PASS';
} catch (e) {
  outcome = 'FAIL';
  failure = e.message;
  process.exitCode = 1;
} finally {
  try {
    for (const url of [...created]) await cancel(url);
    const after = await view();
    assert.deepEqual(after.quota, before.quota);
    assert.deepEqual(after.files, before.files);
    checks.push({
      id: 'CANCELLATION_AND_RETENTION',
      quota_restored: true,
      original_records_unchanged: true,
    });
  } catch (e) {
    outcome = 'FAIL';
    failure = (failure || '') + '; cleanup: ' + e.message;
    process.exitCode = 1;
  }
  await fetch(base + '/api/auth/sign-out', {
    method: 'POST',
    headers: {
      Origin: base,
      Cookie: cookie,
      'Content-Type': 'application/json',
    },
    body: '{}',
  }).catch(() => {});
  await mkdir('.local/public-checks', { recursive: true, mode: 0o700 });
  await writeFile(
    '.local/public-checks/upload-conflicts.json',
    JSON.stringify(
      { outcome, checks, ownership: proof, ...(failure ? { failure } : {}) },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ outcome, checks }));
}
