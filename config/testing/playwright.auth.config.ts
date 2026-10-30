import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/auth/specs',
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
          process.env['AUTH_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-09/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['AUTH_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-09/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
