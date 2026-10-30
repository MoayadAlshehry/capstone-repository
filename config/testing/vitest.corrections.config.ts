import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: {
    include: ['tools/corrections/*.integration.test.ts'],
    exclude: [],
    fileParallelism: false,
    testTimeout: 90000,
    hookTimeout: 120000,
    passWithNoTests: false,
  },
});
