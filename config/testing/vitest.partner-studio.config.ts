import { defineConfig } from 'vitest/config';
import base from './vitest.independent.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tools/partner-studio/*.test.ts'],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
