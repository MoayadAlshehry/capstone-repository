import { defineConfig } from 'vitest/config';
import base from './vitest.partner-studio.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tools/onboarding/onboarding.test.ts',
      'tools/project-onboarding/project-onboarding.test.ts',
      'tools/account-email/*.test.ts',
      'tools/semester/semester.test.ts',
      'tools/semester/upload-authority.test.ts',
      'tools/academic/final-flow.integration.test.ts',
      'tools/academic/outcomes.integration.test.ts',
      'tools/academic/security.integration.test.ts',
      'tools/independent/admission.integration.test.ts',
      'tools/independent/lifecycle.integration.test.ts',
      'tools/independent/review.integration.test.ts',
      'tools/partner-studio/*.test.ts',
    ],
    fileParallelism: false,
    reporters: ['default', 'json'],
    outputFile: '.local/handoff/workspace-v2/r09/focused-results.json',
  },
});
