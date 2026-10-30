import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/design-lab/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          process.env['UI_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-06/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['UI_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-06/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:3012',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'design-system' }],
});
