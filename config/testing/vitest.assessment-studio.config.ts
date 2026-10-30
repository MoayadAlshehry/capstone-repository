import { defineConfig } from 'vitest/config';
import base from './vitest.independent.config.ts';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/ui/workspace-v2': new URL(
        '../../packages/ui/src/workspace-v2/index.ts',
        import.meta.url,
      ).pathname,
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: [
      'tools/assessment-studio/*.test.tsx',
      'tools/academic/security.integration.test.ts',
      'tools/academic/final-flow.integration.test.ts',
      'tools/academic/tenancy.integration.test.ts',
      'tools/independent/review.integration.test.ts',
      'tools/independent/lifecycle.integration.test.ts',
      'tools/independent/legacy.integration.test.ts',
    ],
  },
});
