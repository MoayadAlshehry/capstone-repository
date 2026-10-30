import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createTransferStorage } from './transfers.js';

it('does not extend a shortened transfer when a stale offset is rejected', async () => {
  const workspace = process.cwd(),
    root = join(
      workspace,
      '.local/infra-tests',
      'r09-short-transfer-' + randomUUID(),
    );
  await mkdir(root, { recursive: true, mode: 0o700 });
  const key = randomUUID(),
    original = Buffer.from('short');
  await writeFile(join(root, key), original, { mode: 0o600 });
  const storage = await createTransferStorage(root, workspace, 'test');
  try {
    await expect(
      storage.append(
        key,
        10,
        20,
        (async function* () {
          yield Buffer.from('more');
        })(),
        4,
      ),
    ).rejects.toMatchObject({ code: 'INCONSISTENT_OFFSET' });
    expect(await readFile(join(root, key))).toEqual(original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('rolls a failed append back to its validated offset and permits a genuine retry', async () => {
  const workspace = process.cwd(),
    root = join(
      workspace,
      '.local/infra-tests',
      'r09-interrupted-transfer-' + randomUUID(),
    );
  await mkdir(root, { recursive: true, mode: 0o700 });
  const key = randomUUID(),
    original = Buffer.from('start');
  await writeFile(join(root, key), original, { mode: 0o600 });
  const storage = await createTransferStorage(root, workspace, 'test');
  try {
    await expect(
      storage.append(
        key,
        5,
        9,
        (async function* () {
          yield Buffer.from('mo');
          throw Error('Simulated interrupted transport');
        })(),
        4,
      ),
    ).rejects.toMatchObject({ code: 'INTERRUPTED' });
    expect(await readFile(join(root, key))).toEqual(original);
    expect(
      await storage.append(
        key,
        5,
        9,
        (async function* () {
          yield Buffer.from('more');
        })(),
        4,
      ),
    ).toBe(9);
    expect(await readFile(join(root, key))).toEqual(Buffer.from('startmore'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
