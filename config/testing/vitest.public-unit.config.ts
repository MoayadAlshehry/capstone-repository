import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
// Explicit safe, bounded units: no DB, running app, real model or provider.
export const publicUnitFiles = [
  'tools/release/ai-runtime.test.ts',
  'tools/release/owned-model-failures.test.ts',
  'tools/release/metadata-subject.test.ts',
  'tools/release/allocation-preparation.test.ts',
  'tools/release/demo-marker.test.tsx',
  'tools/allocation/policy.test.ts',
  'tools/testing/public-policy.test.ts',
  'tools/testing/installed-account-setup.test.ts',
  'tools/testing/published-bindings.test.ts',
];
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: publicUnitFiles,
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
