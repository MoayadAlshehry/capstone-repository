import { defineConfig } from 'vitest/config';
import base from './vitest.academic.config.ts';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/domain/committee-engine': new URL(
        '../../packages/domain/src/committee-engine.ts',
        import.meta.url,
      ).pathname,
      '@capstone/infrastructure/committee-mail': new URL(
        '../../packages/infrastructure/src/committee-mail.ts',
        import.meta.url,
      ).pathname,
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: ['tools/independent/*.test.ts'],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
