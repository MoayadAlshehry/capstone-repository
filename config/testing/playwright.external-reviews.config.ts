import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/external-reviews/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          process.env['EXTERNAL_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-29/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['EXTERNAL_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-29/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:3000',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
