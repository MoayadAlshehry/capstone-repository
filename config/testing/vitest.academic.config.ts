import { defineConfig } from 'vitest/config';
import base from './vitest.project-onboarding.config.ts';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/domain/academic-engine': new URL(
        '../../packages/domain/src/academic-engine.ts',
        import.meta.url,
      ).pathname,
      '@capstone/db/academic': new URL(
        '../../packages/db/src/academic.ts',
        import.meta.url,
      ).pathname,
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
    include: ['tools/academic/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
