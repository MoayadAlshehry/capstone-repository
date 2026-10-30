import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/showcase/specs',
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
          process.env['SHOWCASE_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-31/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['SHOWCASE_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-31/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:3004',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
