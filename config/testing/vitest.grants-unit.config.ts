import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: {
    include: [
      'tools/grants/policy.test.ts',
      'packages/domain/src/authorization.test.ts',
      'packages/domain/src/native-files.test.ts',
      'tools/automation/automation.test.ts',
    ],
    passWithNoTests: false,
  },
});
