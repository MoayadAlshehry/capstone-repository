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
      '@capstone/infrastructure/visual-media': new URL(
        '../../packages/infrastructure/src/visual-media.ts',
        import.meta.url,
      ).pathname,
      '@capstone/infrastructure/visual-images': new URL(
        '../../packages/infrastructure/src/visual-images.ts',
        import.meta.url,
      ).pathname,
      '@capstone/db/visual-media': new URL(
        '../../packages/db/src/visual-media.ts',
        import.meta.url,
      ).pathname,
      ...base.resolve?.alias,
    },
  },
  test: {
    ...base.test,
    include: ['tools/visual-media/*.test.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
