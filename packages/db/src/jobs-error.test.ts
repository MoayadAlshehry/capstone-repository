import { it, expect, vi } from 'vitest';
import pg from 'pg';
import { createAllocationJobs } from './allocation.js';
import { createExternalAllocator } from './external-reviews.js';
import { createJobRepository } from './governance.js';

it.each([
  ['allocation jobs', createAllocationJobs],
  ['external allocation adapter', createExternalAllocator],
  ['governance jobs', createJobRepository],
] as const)(
  '%s handles simulated idle pool errors without an uncaught EventEmitter error',
  async (_name, create) => {
    const Pool = pg.Pool;
    let observed: pg.Pool | undefined;
    const constructor = vi
      .spyOn(pg, 'Pool')
      .mockImplementation(function (config) {
        observed = new Pool(config);
        return observed;
      });
    const repository = create(
      'postgresql://capstone_jobs:synthetic-only@127.0.0.1:15435/capstone_test_0000000000000000',
    );
    try {
      expect(observed).toBeDefined();
      expect(() =>
        observed!.emit('error', Error('Simulated idle connection failure')),
      ).not.toThrow();
    } finally {
      await repository.close();
      constructor.mockRestore();
    }
  },
);
