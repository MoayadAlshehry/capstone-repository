import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';

export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/domain/event-allocation-policy': fileURLToPath(
        new URL(
          '../../packages/domain/src/event-allocation-policy.ts',
          import.meta.url,
        ),
      ),
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: [
      'apps/web/workspace-v2/registry.test.ts',
      'apps/web/platform/page.test.tsx',
      'tools/allocation/policy.test.ts',
      'tools/permanent-evaluation/fairness.test.ts',
      'tools/progression/policy.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.pnpm-store/**'],
    fileParallelism: false,
    passWithNoTests: false,
  },
});
