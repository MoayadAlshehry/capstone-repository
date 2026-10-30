import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tools/r3-shared/*.test.ts'],
    exclude: [],
    fileParallelism: false,
    testTimeout: 90000,
    hookTimeout: 120000,
    reporters: ['default', 'json'],
    outputFile:
      process.env['R3_SHARED_RESULTS_PATH'] ??
      '.local/handoff/phase34-14/engines-results.json',
  },
});
