import { defineConfig } from 'vitest/config';
import base from './vitest.permanent-evaluation.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tools/impr2/*.test.ts',
      'packages/domain/src/assessment-entry.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 180000,
    hookTimeout: 180000,
  },
});
