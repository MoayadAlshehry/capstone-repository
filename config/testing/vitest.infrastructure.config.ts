import { engineeringTestNames } from '../../tools/testing/source-policy.js';
import { configDefaults, defineConfig } from 'vitest/config';
import foundation from './vitest.config.js';
export default defineConfig({
  ...foundation,
  test: {
    ...(engineeringTestNames ? { testNamePattern: engineeringTestNames } : {}),
    ...foundation.test,
    include: ['tools/*.integration.test.ts'],
    exclude: configDefaults.exclude,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
