import { defineConfig } from 'vitest/config';
import base from './vitest.academic.config.ts';
export default defineConfig({
  ...base,
  test: {
    include: [
      'tools/academic/final-flow.integration.test.ts',
      'tools/discovery/p0-1-sort.integration.test.ts',
      'tools/automation/web-release.test.ts',
    ],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    passWithNoTests: false,
  },
});
