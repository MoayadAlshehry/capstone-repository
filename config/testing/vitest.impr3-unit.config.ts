import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tools/impr3/*.unit.test.tsx',
      'packages/ui/src/impr1-authors.test.tsx',
      'packages/ui/src/brand-logo.test.ts',
      'tools/impr2/reset-target.test.ts',
    ],
    fileParallelism: false,
  },
});
