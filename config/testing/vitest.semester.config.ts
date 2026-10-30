import { defineConfig } from 'vitest/config';
import base from './vitest.project-onboarding.config.ts';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/db/semester': new URL(
        '../../packages/db/src/semester.ts',
        import.meta.url,
      ).pathname,
      '@capstone/domain/semester-engine': new URL(
        '../../packages/domain/src/semester-engine.ts',
        import.meta.url,
      ).pathname,
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: ['tools/semester/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
