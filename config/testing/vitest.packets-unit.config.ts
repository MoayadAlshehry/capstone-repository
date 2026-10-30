import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';
export default defineConfig({
  ...base,
  test: {
    include: [
      'tools/packets/policy.test.ts',
      'packages/domain/src/native-files.test.ts',
    ],
    passWithNoTests: false,
  },
});
