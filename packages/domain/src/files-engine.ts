import 'server-only';
import type { TransactionScope } from '@capstone/db';
import { createFileRepository } from '@capstone/db/files';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import { validateContent, ContentError } from '@capstone/storage/content';
import { admittedPath, admittedSize } from './file-policy.js';
export function createFileEngine(databaseUrl: string, storage: NativeStorage) {
  const repository = createFileRepository(databaseUrl);

  async function finalizeInScope(
    actor: AccountView,
    id: string,
    bytes: AsyncIterable<Uint8Array>,
    tx: TransactionScope,
  ) {
    const r = await repository.access(actor, id, tx);
    if (r.status === 'finalized')
      return {
        fileId: r.fileId!,
        status: 'ready' as const,
        visibility: 'restricted' as const,
      };
    const measured = await storage.write(r.key, bytes, r.expected);
    if (!(await storage.verify(r.key, measured)))
      throw new ContentError('INTEGRITY_FAILED');
    const mime = await validateContent(
      storage,
      r.key,
      r.extension,
      measured.size,
    );
    const candidate = await repository.reuse(
      actor,
      id,
      measured.size,
      measured.sha256,
      tx,
    );
    if (
      candidate &&
      !(await storage.verify(candidate.key, {
        size: candidate.size,
        sha256: candidate.sha256,
      }))
    )
      throw new ContentError('REUSE_INTEGRITY_FAILED');
    if (candidate) await storage.removeStaging(r.key);
    return repository.finalize(
      actor,
      id,
      measured.size,
      measured.sha256,
      mime,
      candidate?.id ?? null,
      tx,
    );
  }
  return {
    async reserve(
      actor: AccountView,
      input: {
        project: string;
        version: string;
        path: string;
        expectedBytes: number;
        correlationId: string;
      },
    ) {
      const p = admittedPath(input.path);
      admittedSize(input.expectedBytes);
      return repository.reserve(
        actor,
        input.project,
        input.version,
        p.path,
        p.extension,
        input.expectedBytes,
        input.correlationId,
      );
    },
    quota: repository.quota,
    // Server-only byte ingestion/finalization service. Phase15 transports bytes separately.
    async finalize(
      actor: AccountView,
      id: string,
      bytes: AsyncIterable<Uint8Array>,
    ) {
      let failure: unknown;
      try {
        return await repository.transaction(async (tx) => {
          try {
            return await finalizeInScope(actor, id, bytes, tx);
          } catch (e) {
            failure = e;
            throw e;
          }
        });
      } catch (e) {
        await repository.end(actor, id, 'failed').catch(() => {});
        throw failure instanceof ContentError ? failure : e;
      }
    },
    finalizeInScope,

    cancel: (actor: AccountView, id: string) =>
      repository.end(actor, id, 'cancelled'),
    touch: (actor: AccountView, id: string) =>
      repository.end(actor, id, 'touch'),
    async cleanup(actor: AccountView, project: string, version: string) {
      return repository.transaction(async (tx) => {
        const keys = await repository.cleanup(actor, project, version, tx);
        for (const key of keys) await storage.removeStaging(key);
        return { cleanedReservations: keys.length };
      });
    },
    close: repository.close,
  };
}
