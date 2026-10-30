import { defineConfig } from 'vitest/config';
import base from './vitest.academic.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tools/academic/final-flow*.test.ts',
      'tools/academic/security.integration.test.ts',
      'tools/academic/tenancy.integration.test.ts',
      'tools/academic/integrity.integration.test.ts',
    ],
  },
});
