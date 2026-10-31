import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (p) => readFile(root + '/' + p, 'utf8');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const release = JSON.parse(await read('RELEASE.json'));
assert.match(release.version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
assert.equal(release.tag, 'v' + release.version);
assert.equal(
  sha(await readFile(root + '/PUBLIC_EVALUATION_PERMISSION_PROPOSAL.md')),
  '874e20241903a08e8b2a1c486850448fe6d9ffdf44eeb3dec6f4e5fe666f7b83',
);
assert.equal(
  (await readdir(root + '/packages/db/migrations')).filter((n) =>
    n.endsWith('.sql'),
  ).length,
  139,
);
const assets = JSON.parse(await read('demo/ASSET_MANIFEST.json')).files;
assert.equal(assets.length, 540);
for (const a of assets)
  assert.equal(
    sha(await readFile(root + '/demo/assets/' + a.path)),
    a.sha256,
    a.path,
  );
const rights = await read('FILE_RIGHTS.csv');
assert(!rights.includes('exact release activation pending'));
assert(!rights.toLowerCase().includes('exact publication not approved'));
assert(!rights.toLowerCase().includes('publication approval still required'));
const names = [
  'README.md',
  'RIGHTS.md',
  'RELEASE_STATUS.md',
  'TESTING.md',
  'SECURITY.md',
  'MODEL_REQUIREMENTS.md',
  'MAIL_CONFIGURATION.md',
  'INSTALLER_OPERATIONS.md',
  'OPTIONAL_MODES.md',
  'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_REVIEW.md',
  'demo/README.md',
  'tools/release/README.md',
];
let links = 0;
for (const name of names) {
  const text = await read(name);
  for (const m of text.matchAll(/!?\[[^\]\n]*\]\(([^\n)]+)\)/g)) {
    const target = m[1].split(/\s+"/)[0].replace(/^<|>$/g, '');
    if (!target || /^(?:https?:|mailto:|data:|#)/.test(target)) continue;
    const url = new URL(target.split('#')[0], 'file://' + root + '/' + name);
    assert((await stat(fileURLToPath(url))).isFile(), name + ': ' + target);
    links++;
  }
}
const harness = await read('tools/release/browser-proof.mjs');
const guard = "await expect(page.getByRole('button'";
assert(
  harness.indexOf(guard) > 0 &&
    harness.indexOf(guard) <
      harness.indexOf(
        "await page.getByRole('textbox',{name:/email/i}).fill(person.email)",
      ),
);
console.log(
  JSON.stringify(
    {
      outcome: 'PASS_SAFE_STATIC_SCOPE',
      release_version: release.version,
      EVAL_1_wording_unchanged: true,
      migrations: 139,
      original_demo_input_hashes_verified: 540,
      local_document_links_checked: links,
      browser_readiness_guard_before_fill: true,
      external_links: 'Separate online audit; not contacted by this CI command',
      application_or_model_requests: 0,
    },
    null,
    2,
  ),
);
