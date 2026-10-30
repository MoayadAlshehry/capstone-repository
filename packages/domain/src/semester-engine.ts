import 'server-only';
import { createSemesterRepository } from '@capstone/db/semester';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import {
  semesterCommandSchema,
  type SemesterCollection,
  type SemesterState,
  type CheckpointRound,
  type SemesterReceipt,
} from './semester.js';
export class SemesterError extends Error {
  constructor(
    readonly code: string,
    readonly issues: string[] = [],
  ) {
    super(code);
  }
}
export function createSemesterEngine(url: string, storage: NativeStorage) {
  const repo = createSemesterRepository(url);
  return {
    state: (a: AccountView, p: string) => repo.state<SemesterState>(a, p),
    collection: (a: AccountView, q = false) =>
      repo.collection<SemesterCollection>(a, q),
    round: (a: AccountView, s: string) => repo.round<CheckpointRound>(a, s),
    receipt: (a: AccountView, c: string) =>
      repo.receipt<SemesterReceipt | null>(a, c),
    async command(a: AccountView, input: unknown): Promise<SemesterReceipt> {
      const c = semesterCommandSchema.parse(input);
      if (c.operation === 'metadata.save') return repo.save(a, c);
      if (c.operation !== 'checkpoint.send') return repo.decide(a, c);
      let failure: SemesterError | undefined;
      try {
        return await repo.transaction(async (tx) => {
          const p = await repo.prepare(a, c, tx);
          if (p.completed) return p.completed as SemesterReceipt;
          if (p.issues) {
            failure = new SemesterError('NOT_READY', p.issues);
            throw failure;
          }
          for (const f of p.files ?? [])
            if (
              !(await storage.verify(f.key, {
                size: Number(f.size),
                sha256: f.sha256,
              }))
            ) {
              failure = new SemesterError('FILE_INTEGRITY');
              throw failure;
            }
          return repo.commit<SemesterReceipt>(a, c, tx);
        });
      } catch (error) {
        throw failure ?? error;
      }
    },
    close: repo.close,
  };
}
