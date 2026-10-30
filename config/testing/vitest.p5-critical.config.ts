import { defineConfig } from 'vitest/config';
import base from './vitest.permanent-evaluation.config.ts';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tools/partner-studio/access.integration.test.ts',
      'tools/partner-studio/r09-notice-transient.test.ts',
      'tools/partner-studio/refinement.test.ts',
      'tools/progression/policy.test.ts',
      'tools/corrections/policy.test.ts',
      'tools/corrections/r09-feedback-context.test.ts',
      'tools/corrections/r09-feedback-redaction.test.ts',
      'tools/permanent-evaluation/*.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 180000,
    hookTimeout: 180000,
  },
});
