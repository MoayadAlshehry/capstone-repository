import { defineConfig } from 'vitest/config';
import base from './vitest.r09.config.ts';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/ui/workspace-v2': new URL(
        '../../packages/ui/dist/workspace-v2/index.js',
        import.meta.url,
      ).pathname,
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: [
      ...(base.test?.include ?? []),
      'tools/academic/r09-revision.test.ts',
      'apps/web/partner-studio/r09-overview.test.ts',
      'tools/workspace-v2/r09-remediation.test.ts',
    ],
    outputFile:
      '.local/handoff/workspace-v2/r09-remediation/focused-results.json',
  },
});
