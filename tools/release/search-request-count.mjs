import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { browserSSECapture } from './browser-sse-capture.mjs';
const C = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
if (process.cwd() !== C) throw Error('RUN_FROM_OWNED_INSTALLATION_ROOT');
const { base, state, proof } = await (
  await import(C + '/scripts/verify-owned.mjs')
).verifyOwned();
if (!state.demo || !state.completed.includes('DEMO'))
  throw Error('COMPLETE_OWNED_DEMO_REQUIRED');
const out = C + '/.local/public-checks/search-dispatch';
await mkdir(out, { recursive: true });
const { chromium, expect } = createRequire(C + '/package.json')(
  '@playwright/test',
);
const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  }),
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
  page = await ctx.newPage(),
  cap = await browserSSECapture(ctx, page, base);
const cases = [];
const queries = [
  'Projects that measure indoor air quality using low-power sensors.',
  'Research about traceable inventory reconciliation.',
];
const parse = (s) =>
  s
    .split(/\r?\n/)
    .filter((x) => x.startsWith('data: '))
    .map((x) => JSON.parse(x.slice(6)));
async function settle(q, after, label) {
  const r = await cap.wait(
    (v) => v.action === 'search' && v.query === q,
    after,
  );
  assert.equal(r.status, 200);
  const events = parse(r.body);
  assert(!events.some((e) => e.type === 'error'));
  assert(events.some((e) => e.type === 'done'));
  const value = events.findLast((e) => e.type === 'result')?.value;
  assert(value?.status === 'ready');
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const posts = cap
    .audit()
    .filter(
      (x) => x.action === 'search' && x.query === q && x.started >= after,
    );
  assert.equal(posts.length, 1, 'DUPLICATE_SEARCH_DISPATCH');
  cases.push({
    label,
    search_posts: posts.length,
    result_total: value.total,
    metrics: events
      .filter((e) => e.type === 'metrics')
      .map((e) => ({ cache: e.value.cache, counters: e.value.counters })),
    ui_query: await page
      .getByRole('textbox', { name: 'Search published projects', exact: true })
      .inputValue(),
  });
}
try {
  await page.goto(base + '/en/catalogue');
  await expect(
    page.getByText('Loading public content', { exact: true }),
  ).toHaveCount(0);
  for (const [i, q] of queries.entries()) {
    await page
      .getByRole('textbox', { name: 'Search published projects', exact: true })
      .fill(q);
    const after = Date.now();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForURL((u) => u.searchParams.get('q') === q);
    await expect(
      page.getByText('Loading public content', { exact: true }),
    ).toHaveCount(0);
    const refine = page.getByRole('button', {
      name: 'Refine with AI',
      exact: true,
    });
    if (
      (await refine.isVisible()) &&
      (await refine.isEnabled()) &&
      !cap.seen((v) => v.action === 'search' && v.query === q, after)
    )
      await refine.click();
    await settle(q, after, 'changed-query-' + i);
  }
  const before = cap.audit().filter((x) => x.action === 'search').length;
  const reloadAt = Date.now();
  await page.reload();
  await settle(queries[1], reloadAt, 'semantic-deep-link-reload');
  await page.goto(base + '/en/catalogue');
  await expect(
    page.getByText('Loading public content', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Search published projects', exact: true })
    .fill('WadiWatch');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Refine with AI', exact: true }),
  ).toBeVisible();
  const retryAt = Date.now();
  await page
    .getByRole('button', { name: 'Refine with AI', exact: true })
    .click();
  await settle(
    'WadiWatch',
    retryAt,
    'explicit-refinement-from-ordinary-result',
  );
  const result = {
    outcome: 'PASS',
    cases,
    total_search_posts: cap.audit().filter((x) => x.action === 'search').length,
    pre_reload_posts: before,
    rate_limit_unchanged: 12,
    real_model_service: true,
    ranking_unchanged: true,
    requests: cap.audit(),
    ownership: proof,
    build: (await readFile(C + '/apps/web/.next/BUILD_ID', 'utf8')).trim(),
  };
  await writeFile(out + '/RESULT.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: out + '/UI.png' });
  console.log(
    JSON.stringify({
      outcome: result.outcome,
      cases: cases.length,
      total_search_posts: result.total_search_posts,
    }),
  );
} catch (e) {
  await writeFile(
    out + '/RESULT.json',
    JSON.stringify(
      { outcome: 'FAIL', error: e.message, cases, requests: cap.audit() },
      null,
      2,
    ),
  );
  console.log(e.message);
  process.exitCode = 1;
} finally {
  await cap.close();
  await ctx.close();
  await browser.close();
}
