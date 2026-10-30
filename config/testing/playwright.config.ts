import { defineConfig } from './playwright-paths.ts';
import { resolve } from 'node:path';
process.env['PLAYWRIGHT_BROWSERS_PATH'] = resolve('.local/playwright-browsers');
export default defineConfig({
  testDir: './tools/browser/specs',
  fullyParallel: true,
  workers: 2,
  forbidOnly: true,
  retries: 0,
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: '.local/evidence-raw/phase-05/playwright/results.json' },
    ],
    [
      'html',
      {
        outputFolder: '.local/evidence-raw/phase-05/playwright/report',
        open: 'never',
      },
    ],
  ],
  outputDir: '.local/evidence-raw/phase-05/playwright/artifacts',
  use: {
    baseURL: process.env['FIXTURE_BASE_URL'],
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'browser-smoke' }],
});
