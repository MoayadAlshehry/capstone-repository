import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: { include: ['tools/r3-student/model.test.ts'], passWithNoTests: false },
});
