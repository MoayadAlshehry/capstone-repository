import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/submissions/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          process.env['SUBMISSION_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-18/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['SUBMISSION_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-18/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:3000',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
