import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
import { engineeringTestNames } from '../../tools/testing/source-policy.js';
export default defineConfig({
  ...base,
  test: {
    ...(engineeringTestNames ? { testNamePattern: engineeringTestNames } : {}),
    include: ['tools/r3-university/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    passWithNoTests: false,
  },
});
