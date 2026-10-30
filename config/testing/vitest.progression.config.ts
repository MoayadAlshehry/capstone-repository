import { defineConfig } from 'vitest/config';
import base from './vitest.permanent-evaluation.config.ts';
export default defineConfig({
  ...base,
  test: {
    include: ['tools/progression/*.integration.test.ts'],
    exclude: [],
    fileParallelism: false,
    testTimeout: 90000,
    hookTimeout: 240000,
    passWithNoTests: false,
  },
});
