import { defineConfig } from 'vitest/config';
import base from './vitest.independent.config.ts';
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tools/semester/*.test.ts'] },
});
