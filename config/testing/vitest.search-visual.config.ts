import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/db/account-mail': fileURLToPath(
        new URL('../../packages/db/src/account-mail.ts', import.meta.url),
      ),
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: [
      'tools/ai-v1/search-visual.test.ts',
      'tools/ai-v1/search-resolution.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/.pnpm-store/**'],
    fileParallelism: false,
  },
});
