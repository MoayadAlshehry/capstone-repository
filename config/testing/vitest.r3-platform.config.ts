import base from './vitest.config.ts';
import { defineConfig } from 'vitest/config';
import { engineeringTestNames } from '../../tools/testing/source-policy.js';
export default defineConfig({
  ...base,
  test: {
    include: ['tools/r3-platform/*.test.ts'],
    ...(engineeringTestNames ? { testNamePattern: engineeringTestNames } : {}),
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    passWithNoTests: false,
  },
});
