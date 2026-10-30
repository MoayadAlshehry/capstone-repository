import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('../../apps/web/', import.meta.url)) },
  },
  test: {
    include: [
      'apps/web/account-entry/login-outcome.test.ts',
      'apps/web/account-entry/field-focus.test.tsx',
      'apps/web/account-entry/r09-fields.test.ts',
    ],
    passWithNoTests: false,
  },
});
