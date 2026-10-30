import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/admin/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 45000,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          process.env['ADMIN_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-10/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['ADMIN_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-10/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:3000',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
