/** Optional browser regression for icon clearance with automatic text direction. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { verifyOwned } from '../../scripts/verify-owned.mjs';

const { base, proof } = await verifyOwned();
const output = '.local/public-checks/search-spacing';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: true,
});
const cases = [],
  errors = [],
  requests = [];
try {
  for (const width of [1280, 360]) {
    for (const locale of ['en', 'ar']) {
      for (const theme of ['light', 'dark']) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
        });
        await context.addInitScript(
          (value) => localStorage.setItem('capstone.ui.theme.v1', value),
          theme,
        );
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => {
          if (
            request.method() === 'POST' &&
            new URL(request.url()).pathname === '/api/ai'
          )
            requests.push('unexpected search submission');
        });
        await page.goto(base + '/' + locale + '/catalogue', {
          waitUntil: 'networkidle',
        });
        const input = page.locator('#project-search');
        await expect(input).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        for (const value of ['', 'Flood routing', 'تخطيط المسارات']) {
          await input.fill(value);
          const geometry = await input.evaluate((element) => {
            const style = getComputedStyle(element),
              box = element.getBoundingClientRect();
            const icon = element.parentElement
              .querySelector('.pu-search-leading')
              .getBoundingClientRect();
            return {
              textLeft: box.left + parseFloat(style.paddingLeft),
              textRight: box.right - parseFloat(style.paddingRight),
              iconLeft: icon.left,
              iconRight: icon.right,
              direction: style.direction,
              pageWidth: document.documentElement.scrollWidth,
              viewport: innerWidth,
            };
          });
          const gap =
            locale === 'ar'
              ? geometry.iconLeft - geometry.textRight
              : geometry.textLeft - geometry.iconRight;
          assert(gap >= 5, 'SEARCH_ICON_OVERLAPS_TEXT_CONTENT');
          assert(
            geometry.pageWidth <= geometry.viewport + 1,
            'HORIZONTAL_OVERFLOW',
          );
          cases.push({
            width,
            locale,
            theme,
            input: value
              ? value.startsWith('Flood')
                ? 'English'
                : 'Arabic'
              : 'empty',
            gap,
            geometry,
            outcome: 'PASS',
          });
        }
        await input.fill('');
        await page.screenshot({
          path: output + '/' + locale + '-' + theme + '-' + width + '.png',
          animations: 'disabled',
        });
        await context.close();
      }
    }
  }
  assert.equal(cases.length, 24);
  assert.equal(errors.length, 0);
  assert.equal(requests.length, 0);
  await writeFile(
    output + '/RESULT.json',
    JSON.stringify(
      {
        outcome: 'PASS',
        proof,
        cases,
        errors,
        unexpected_search_submissions: requests.length,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS | 24 locale/theme/viewport/text-direction checks; no search submitted',
  );
} finally {
  await browser.close();
}
