import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: {
    include: ['tools/packets/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    passWithNoTests: false,
  },
});
