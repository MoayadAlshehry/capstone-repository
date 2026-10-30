import { defineConfig } from 'vitest/config';
import base from './vitest.onboarding.config.ts';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/db/project-onboarding': new URL(
        '../../packages/db/src/project-onboarding.ts',
        import.meta.url,
      ).pathname,
      ...base.resolve?.alias,
    },
  },
  test: { ...base.test, include: ['tools/project-onboarding/*.test.ts'] },
});
