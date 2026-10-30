import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
const source = (p: string) => new URL(p, import.meta.url).pathname;
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/db/account-mail': source(
        '../../packages/db/src/account-mail.ts',
      ),
      '@capstone/db/account-mail-crypto': source(
        '../../packages/db/src/account-mail-crypto.ts',
      ),
      '@capstone/config/account-mail': source(
        '../../packages/config/src/account-mail.ts',
      ),
      '@capstone/infrastructure/account-mail-worker': source(
        '../../packages/infrastructure/src/account-mail-worker.ts',
      ),
      '@capstone/infrastructure/account-mail': source(
        '../../packages/infrastructure/src/account-mail.ts',
      ),
      ...base.resolve?.alias,
    },
  },
  test: {
    include: ['tools/account-email/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    passWithNoTests: false,
  },
});
