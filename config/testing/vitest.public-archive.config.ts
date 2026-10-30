import { defineConfig } from 'vitest/config';
import base from './vitest.academic.config.ts';
export default defineConfig({
  ...base,
  test: {
    include: ['tools/public-archive/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
