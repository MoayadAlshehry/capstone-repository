import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  open,
  mkdir,
  lstat,
  realpath,
  link,
  unlink,
  readdir,
} from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { StorageError } from './index.js';
export interface NativeDescriptor {
  size: number;
  sha256: string;
}
export interface NativeStorage {
  guardRoot?(): Promise<void>;
  write(
    key: string,
    bytes: AsyncIterable<Uint8Array>,
    expected: number,
  ): Promise<NativeDescriptor>;
  chunks(key: string): AsyncIterable<Uint8Array>;
  slice(key: string, offset: number, length: number): Promise<Uint8Array>;
  verify(
    key: string,
    expected: NativeDescriptor,
    signal?: AbortSignal,
  ): Promise<boolean>;
  removeStaging(key: string): Promise<void>;
}
export async function createNativeStorage(
  input: string,
  workspace: string,
  environment: 'local' | 'test' | 'production' = 'local',
): Promise<NativeStorage> {
  const root = resolve(input),
    rel = relative(join(resolve(workspace), '.local'), root);
  const workspaceRelative = relative(resolve(workspace), root);
  if (
    (environment !== 'production' &&
      (rel.startsWith('..') || isAbsolute(rel))) ||
    (environment === 'production' &&
      !workspaceRelative.startsWith('..') &&
      !isAbsolute(workspaceRelative) &&
      (rel.startsWith('..') || isAbsolute(rel)))
  )
    throw new StorageError('INVALID_ROOT');
  async function guard() {
    let p = root;
    const paths = [];
    while (p !== resolve(p, '..')) {
      paths.unshift(p);
      p = resolve(p, '..');
    }
    for (const path of paths)
      try {
        const s = await lstat(path);
        if (!s.isDirectory() || s.isSymbolicLink())
          throw new StorageError('INVALID_ROOT');
      } catch (e) {
        if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'))
          throw e;
      }
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await realpath(root)) !== root) throw new StorageError('INVALID_ROOT');
  }
  function path(key: string) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(key))
      throw new StorageError('INVALID_KEY');
    return join(root, key);
  }
  async function reader(key: string) {
    await guard();
    const h = await open(path(key), constants.O_RDONLY | constants.O_NOFOLLOW);
    if (!(await h.stat()).isFile()) {
      await h.close();
      throw new StorageError('READ_FAILED');
    }
    return h;
  }
  async function* chunks(key: string) {
    const h = await reader(key);
    try {
      for await (const b of h.createReadStream({
        autoClose: false,
        highWaterMark: 65536,
      }))
        yield new Uint8Array(b as Buffer);
    } finally {
      await h.close();
    }
  }
  await guard();
  return {
    guardRoot: guard,
    async write(key, bytes, expected) {
      if (
        !Number.isSafeInteger(expected) ||
        expected < 0 ||
        expected > 250_000_000
      )
        throw new StorageError('WRITE_FAILED');
      await guard();
      const finalPath = path(key);
      const temporary = join(root, `.partial-${key}-${randomUUID()}`);
      const h = await open(temporary, 'wx', 0o600);
      let size = 0;
      const hash = createHash('sha256');
      try {
        for await (const b of bytes) {
          size += b.length;
          if (size > expected || size > 250_000_000)
            throw new StorageError('WRITE_FAILED');
          for (let offset = 0; offset < b.length; offset += 65536) {
            const stable = Uint8Array.from(b.subarray(offset, offset + 65536));
            await h.writeFile(stable);
            hash.update(stable);
          }
        }
        if (size !== expected) throw new StorageError('WRITE_FAILED');
        await h.sync();
        await h.close();
        await link(temporary, finalPath);
        const d = await open(root, 'r');
        try {
          await d.sync();
        } finally {
          await d.close();
        }
        return { size, sha256: hash.digest('hex') };
      } catch {
        throw new StorageError('WRITE_FAILED');
      } finally {
        await h.close().catch(() => {});
        await unlink(temporary).catch(() => {});
      }
    },
    chunks,
    async slice(key, offset, length) {
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        length < 0 ||
        length > 1_048_576
      )
        throw new StorageError('READ_FAILED');
      const h = await reader(key);
      try {
        const b = Buffer.alloc(length);
        const result = await h.read(b, 0, length, offset);
        return b.subarray(0, result.bytesRead);
      } finally {
        await h.close();
      }
    },
    async verify(key, expected, signal) {
      try {
        let size = 0;
        const h = createHash('sha256');
        for await (const b of chunks(key)) {
          if (signal?.aborted) return false;
          size += b.length;
          if (size > expected.size) return false;
          h.update(b);
        }
        return size === expected.size && h.digest('hex') === expected.sha256;
      } catch {
        return false;
      }
    },
    // Internal engine calls only after DB locks prove terminal/unreferenced reservation.
    async removeStaging(key) {
      await guard();
      const target = path(key);
      try {
        await unlink(target);
      } catch (e) {
        if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'))
          throw new StorageError('WRITE_FAILED');
      }
      for (const name of await readdir(root))
        if (
          name.startsWith(`.partial-${key}-`) &&
          /^\.partial-[a-f0-9-]{36}-[a-f0-9-]{36}$/.test(name)
        )
          await unlink(join(root, name));
    },
  };
}
