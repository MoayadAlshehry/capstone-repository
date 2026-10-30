import 'server-only';
import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createNativeStorage } from './native.js';
export class TransferStorageError extends Error {
  constructor(
    readonly code:
      'BYTE_LIMIT' | 'INTERRUPTED' | 'STORAGE_FAILURE' | 'INCONSISTENT_OFFSET',
  ) {
    super(code);
  }
}
export async function createTransferStorage(
  root: string,
  workspace: string,
  environment: 'local' | 'test' | 'production',
) {
  const safe = await createNativeStorage(root, workspace, environment);
  function path(key: string) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(key))
      throw new TransferStorageError('STORAGE_FAILURE');
    return join(root, key);
  }
  return {
    chunks: safe.chunks,
    async append(
      key: string,
      offset: number,
      expected: number,
      source: AsyncIterable<Uint8Array>,
      declared: number | null,
    ) {
      const target = path(key);
      await safe.guardRoot!();
      let h: Awaited<ReturnType<typeof open>> | undefined;
      let validOffset = false;
      try {
        h = await open(
          target,
          constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
          0o600,
        );
        const stat = await h.stat();
        if (!stat.isFile() || stat.size < offset)
          throw new TransferStorageError('INCONSISTENT_OFFSET');
        validOffset = true;
        if (stat.size > offset) await h.truncate(offset);
        let received = 0;
        const receivedStream = (async function* () {
          try {
            for await (const value of source) yield value;
          } catch {
            throw new TransferStorageError('INTERRUPTED');
          }
        })();
        for await (const b of receivedStream) {
          if (
            received + b.length > 5000000 ||
            offset + received + b.length > expected ||
            offset + received + b.length > 250000000
          )
            throw new TransferStorageError('BYTE_LIMIT');
          for (let n = 0; n < b.length; n += 65536) {
            const stable = Uint8Array.from(b.subarray(n, n + 65536));
            let written = 0;
            while (written < stable.length) {
              const result = await h.write(
                stable,
                written,
                stable.length - written,
                offset + received + written,
              );
              if (result.bytesWritten === 0)
                throw new TransferStorageError('STORAGE_FAILURE');
              written += result.bytesWritten;
            }
            received += stable.length;
          }
        }
        if (declared !== null && received !== declared)
          throw new TransferStorageError('INTERRUPTED');
        await h.sync();
        return offset + received;
      } catch (e) {
        if (h && validOffset) {
          await h.truncate(offset).catch(() => {});
          await h.sync().catch(() => {});
        }
        if (e instanceof TransferStorageError) throw e;
        throw new TransferStorageError('STORAGE_FAILURE');
      } finally {
        await h?.close();
      }
    },
    async ensureOffset(key: string, offset: number) {
      await safe.guardRoot!();
      const target = path(key);
      try {
        const h = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const s = await h.stat();
          if (!s.isFile() || s.size < offset)
            throw new TransferStorageError('INCONSISTENT_OFFSET');
        } finally {
          await h.close();
        }
      } catch (e) {
        if (
          offset === 0 &&
          e &&
          typeof e === 'object' &&
          'code' in e &&
          e.code === 'ENOENT'
        )
          return;
        throw new TransferStorageError('INCONSISTENT_OFFSET');
      }
    },
    async remove(key: string) {
      await safe.guardRoot!();
      try {
        await unlink(path(key));
      } catch (e) {
        if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'))
          throw new TransferStorageError('STORAGE_FAILURE');
      }
    },
  };
}
