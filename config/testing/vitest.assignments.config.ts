import { engineeringTestNames } from '../../tools/testing/source-policy.js';
import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...(engineeringTestNames ? { testNamePattern: engineeringTestNames } : {}),
    include: ['tools/assignments/assignments.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    passWithNoTests: false,
  },
});
