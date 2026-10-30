import { defineConfig } from './playwright-paths.ts';
export default defineConfig({
  testDir: './tools/governance/specs',
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
          process.env['GOVERNANCE_RESULTS_PATH'] ??
          '.local/evidence-raw/phase-26/browser/results.json',
      },
    ],
  ],
  outputDir:
    process.env['GOVERNANCE_ARTIFACTS_PATH'] ??
    '.local/evidence-raw/phase-26/browser/artifacts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://localhost:3000',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
