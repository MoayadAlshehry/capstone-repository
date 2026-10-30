import { engineeringTestNames } from '../../tools/testing/source-policy.js';
import { defineConfig, configDefaults } from 'vitest/config';
import foundation from './vitest.config.js';
export default defineConfig({
  ...foundation,
  test: {
    ...(engineeringTestNames ? { testNamePattern: engineeringTestNames } : {}),
    ...foundation.test,
    include: ['tools/automation/runner.integration.test.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
