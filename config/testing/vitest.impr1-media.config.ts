import { defineConfig } from 'vitest/config';
import base from './vitest.visual-media.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tools/impr1/media.integration.test.ts'],
    fileParallelism: false,
  },
});
