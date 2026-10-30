import { defineConfig } from 'vitest/config';
import base from './vitest.permanent-evaluation.config.js';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tools/demo/*.integration.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 180000,
  },
});
