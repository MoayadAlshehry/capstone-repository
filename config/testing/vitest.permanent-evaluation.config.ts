import { defineConfig } from 'vitest/config';
import base from './vitest.academic.config.ts';
export default defineConfig({
  ...base,
  resolve: {
    ...base.resolve,
    alias: {
      '@capstone/domain/event-allocation-policy': new URL(
        '../../packages/domain/src/event-allocation-policy.ts',
        import.meta.url,
      ).pathname,
      '@capstone/domain/committee-engine': new URL(
        '../../packages/domain/src/committee-engine.ts',
        import.meta.url,
      ).pathname,
      '@capstone/infrastructure/committee-mail': new URL(
        '../../packages/infrastructure/src/committee-mail.ts',
        import.meta.url,
      ).pathname,
      '@capstone/infrastructure/evaluation-events': new URL(
        '../../packages/infrastructure/src/evaluation-events.ts',
        import.meta.url,
      ).pathname,
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: ['tools/permanent-evaluation/*.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 180000,
    hookTimeout: 180000,
  },
});
