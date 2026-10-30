import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/allocation/specs',
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
          process.env['ALLOCATION_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-30/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['ALLOCATION_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-30/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:3000',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
