import { defineConfig } from 'vitest/config';
import base from './vitest.account-experience.config.ts';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/db/onboarding': new URL(
        '../../packages/db/src/onboarding.ts',
        import.meta.url,
      ).pathname,
      ...base.resolve?.alias,
    },
  },
  test: { ...base.test, include: ['tools/onboarding/*.test.ts'] },
});
