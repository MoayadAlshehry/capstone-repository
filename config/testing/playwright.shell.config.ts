import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/shell/specs',
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
          process.env['SHELL_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-07/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['SHELL_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-07/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
