import { defineConfig } from 'vitest/config';
import base from './vitest.account-email.config.ts';
const source = (p: string) => new URL(p, import.meta.url).pathname;
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/db/account-access': source(
        '../../packages/db/src/account-access.ts',
      ),
      '@capstone/db/password-policy': source(
        '../../packages/db/src/password-policy.ts',
      ),
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: [
      'tools/account-email/*.test.ts',
      'tools/account-experience/*.test.ts',
    ],
  },
});
