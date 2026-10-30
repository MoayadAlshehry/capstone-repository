import {
  mkdir,
  writeFile,
  readFile,
  lstat,
  realpath,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import {
  createDisposableDatabase,
  dropDisposableDatabase,
} from '@capstone/db/migration';
import { namespace } from './index.js';
export async function disposableFixture(options: {
  workspace: string;
  bootstrapUrl: string;
  testPort: number;
  environment: string;
  run?: string;
  worker: string;
}) {
  const id = namespace(options.run, options.worker);
  const database = `capstone_test_${id}`;
  const root = join(
    resolve(options.workspace),
    '.local/infra-tests',
    `phase05-${id}`,
  );
  // Phase03 validates local URL, exact test port, role, env, database name and ownership marker.
  await safeRoot();
  await createDisposableDatabase(
    options.bootstrapUrl,
    database,
    options.environment,
    options.testPort,
  );
  let storageCreated = false;
  let closed = false;
  const files = new Set<string>();
  const token = namespace();
  async function safeRoot() {
    for (
      let cursor = root;
      cursor !== resolve(options.workspace);
      cursor = dirname(cursor)
    ) {
      try {
        if ((await lstat(cursor)).isSymbolicLink())
          throw new Error('Linked fixture path refused.');
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
  }
  async function close() {
    if (closed) return;
    if (storageCreated) {
      const info = await lstat(root);
      if (
        info.isSymbolicLink() ||
        resolve(await realpath(root)).toLowerCase() !==
          resolve(root).toLowerCase() ||
        (await readFile(join(root, '.owner'), 'utf8')) !== token
      )
        throw new Error('Unsafe fixture cleanup target.');
      // No recursive delete: only this adapter's own files; foreign contents prevent rmdir.
      for (const file of files) await unlink(join(root, file));
      await unlink(join(root, '.owner'));
      await rmdir(root);
    }
    await dropDisposableDatabase(
      options.bootstrapUrl,
      database,
      options.environment,
      options.testPort,
    );
    closed = true;
  }
  try {
    await mkdir(root, { recursive: false });
    storageCreated = true;
    await writeFile(join(root, '.owner'), token, { flag: 'wx' });
  } catch (error) {
    try {
      if (storageCreated) await rmdir(root);
    } finally {
      await dropDisposableDatabase(
        options.bootstrapUrl,
        database,
        options.environment,
        options.testPort,
      );
    }
    throw error;
  }
  const url = new URL(options.bootstrapUrl);
  url.pathname = `/${database}`;
  return {
    id,
    database,
    root,
    connectionString: url.href,
    close,
    async write(value: string) {
      if (closed) throw new Error('Fixture closed.');
      await safeRoot();
      const file = `${namespace()}.txt`;
      await writeFile(join(root, file), value, { flag: 'wx' });
      files.add(file);
      return file;
    },
    async read(file: string) {
      if (closed) throw new Error('Fixture closed.');
      await safeRoot();
      if (!files.has(file)) throw new Error('Not fixture-owned.');
      return readFile(join(root, file), 'utf8');
    },
  };
}
