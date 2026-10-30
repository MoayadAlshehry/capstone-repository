import { defineConfig } from 'vitest/config';
import base from './vitest.permanent-evaluation.config.ts';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'tools/corrections/r09-context.test.ts',
      'tools/corrections/r09-receipts.test.ts',
      'tools/permanent-evaluation/supervisor-correction.integration.test.ts',
      'tools/permanent-evaluation/committee.integration.test.ts',
      'tools/permanent-evaluation/security.integration.test.ts',
      'tools/permanent-evaluation/governance-delivery.integration.test.ts',
      'tools/permanent-evaluation/p5-lifecycle.integration.test.ts',
    ],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
