import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import {
  mkdir,
  lstat,
  realpath,
  open,
  readFile,
  link,
  unlink,
} from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, sep } from 'node:path';

// Future authorized adapter returns bytes by opaque object ID, never a public disk path.
export interface StoredObjectDescriptor {
  readonly objectId: string;
  readonly sizeBytes: bigint;
  readonly sha256: string;
}
export interface ObjectReader {
  open(object: StoredObjectDescriptor): Promise<ReadableStream<Uint8Array>>;
}
export class StorageError extends Error {
  constructor(
    readonly code:
      | 'INVALID_ROOT'
      | 'INVALID_KEY'
      | 'NOT_FOUND'
      | 'ALREADY_EXISTS'
      | 'WRITE_FAILED'
      | 'READ_FAILED'
      | 'NOT_TEST_OWNED'
      | 'INTEGRITY_FAILED',
  ) {
    super(
      'Private storage operation failed. Check the private root and object state.',
    );
    this.name = 'StorageError';
  }
}
const validKey = (key: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    key,
  );
export async function createPrivateStorage(
  rootInput: string,
  options: {
    workspaceRoot: string;
    environment: 'local' | 'test' | 'production';
  },
) {
  const root = resolve(rootInput);
  const workspace = resolve(options.workspaceRoot);
  const privateRelative = relative(join(workspace, '.local'), root);
  if (
    options.environment !== 'production' &&
    (privateRelative.startsWith('..') || isAbsolute(privateRelative))
  )
    throw new StorageError('INVALID_ROOT');
  const sourceRelative = relative(workspace, root);
  if (
    !sourceRelative.startsWith('..') &&
    !isAbsolute(sourceRelative) &&
    !sourceRelative.startsWith(`.local${sep}`)
  )
    throw new StorageError('INVALID_ROOT');
  const owned = new Set<string>();
  async function guardRoot() {
    try {
      // Inspect existing ancestors before mkdir; a junction must not redirect creation.
      let cursor = root;
      const chain: string[] = [];
      while (cursor !== resolve(cursor, '..')) {
        chain.unshift(cursor);
        cursor = resolve(cursor, '..');
      }
      for (const path of chain) {
        try {
          const stat = await lstat(path);
          if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new StorageError('INVALID_ROOT');
        } catch (error) {
          if (!(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT'
          ))
            throw error;
        }
      }
      await mkdir(root, { recursive: true, mode: 0o700 });
      if ((await realpath(root)).toLowerCase() !== root.toLowerCase())
        throw new StorageError('INVALID_ROOT');
    } catch {
      throw new StorageError('INVALID_ROOT');
    }
  }
  function objectPath(key: string) {
    if (!validKey(key)) throw new StorageError('INVALID_KEY');
    return join(root, key);
  }
  await guardRoot();
  async function read(key: string): Promise<Uint8Array> {
    const path = objectPath(key);
    await guardRoot();
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new StorageError('READ_FAILED');
      return new Uint8Array(await readFile(path));
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
          ? 'NOT_FOUND'
          : 'READ_FAILED',
      );
    }
  }
  async function stat(key: string): Promise<StoredObjectDescriptor> {
    const bytes = await read(key);
    return {
      objectId: key,
      sizeBytes: BigInt(bytes.byteLength),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  return {
    async write(
      bytes: Uint8Array | AsyncIterable<Uint8Array>,
      objectId: string = randomUUID(),
    ): Promise<StoredObjectDescriptor> {
      const finalPath = objectPath(objectId);
      await guardRoot();
      const temporary = join(root, `.staging-${randomUUID()}`);
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        handle = await open(temporary, 'wx', 0o600);
        const hash = createHash('sha256');
        let size = 0n;
        const chunks = bytes instanceof Uint8Array ? [bytes] : bytes;
        for await (const chunk of chunks) {
          const stableChunk = Uint8Array.from(chunk);
          await handle.writeFile(stableChunk);
          hash.update(stableChunk);
          size += BigInt(stableChunk.byteLength);
        }
        await handle.sync();
        await handle.close();
        handle = undefined;
        await link(temporary, finalPath);
        owned.add(objectId);
        return { objectId, sizeBytes: size, sha256: hash.digest('hex') };
      } catch (error) {
        throw new StorageError(
          error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'EEXIST'
            ? 'ALREADY_EXISTS'
            : 'WRITE_FAILED',
        );
      } finally {
        if (handle) await handle.close().catch(() => {});
        await unlink(temporary).catch(() => {});
      }
    },
    read,
    stat,
    async exists(key: string) {
      try {
        await stat(key);
        return true;
      } catch (error) {
        if (error instanceof StorageError && error.code === 'NOT_FOUND')
          return false;
        throw error;
      }
    },
    async open(
      object: StoredObjectDescriptor,
    ): Promise<ReadableStream<Uint8Array>> {
      const bytes = await read(object.objectId);
      if (
        BigInt(bytes.byteLength) !== object.sizeBytes ||
        createHash('sha256').update(bytes).digest('hex') !== object.sha256
      )
        throw new StorageError('INTEGRITY_FAILED');
      return new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    },
    async ready() {
      await guardRoot();
      const probe = join(root, `.probe-${randomUUID()}`);
      try {
        const handle = await open(probe, 'wx', 0o600);
        try {
          await handle.writeFile('ready');
        } finally {
          await handle.close();
        }
        if ((await readFile(probe, 'utf8')) !== 'ready') throw new Error();
      } catch {
        throw new StorageError('WRITE_FAILED');
      } finally {
        await unlink(probe).catch(() => {});
      }
    },
    async removeTestObject(key: string) {
      const testRelative = relative(
        join(workspace, '.local/infra-tests'),
        root,
      );
      if (
        options.environment !== 'test' ||
        !owned.has(key) ||
        testRelative.startsWith('..') ||
        isAbsolute(testRelative)
      )
        throw new StorageError('NOT_TEST_OWNED');
      await guardRoot();
      await unlink(objectPath(key));
      owned.delete(key);
    },
  };
}
