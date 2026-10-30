import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/uploads/specs',
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
          process.env['UPLOAD_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-15/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['UPLOAD_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-15/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:3000',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
