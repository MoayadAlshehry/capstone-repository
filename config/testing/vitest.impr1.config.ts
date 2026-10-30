import { defineConfig } from 'vitest/config';
import base from './vitest.account-email.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tools/impr1/current.test.ts'],
    fileParallelism: false,
  },
});
