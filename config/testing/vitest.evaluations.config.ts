import { engineeringTestNames } from '../../tools/testing/source-policy.js';
import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...(engineeringTestNames ? { testNamePattern: engineeringTestNames } : {}),
    include: ['tools/evaluations/evaluations.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    passWithNoTests: false,
  },
});
