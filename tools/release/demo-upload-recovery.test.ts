import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeStorage } from '../../packages/storage/src/native.js';
import { validateContent } from '../../packages/storage/src/content.js';
import {
  demoUploadKey,
  prepareDemoUploadIntent,
  resumableDemoStorage,
  type DemoUploadIntent,
  type DemoUploadReservation,
} from '../../scripts/demo/upload-recovery.js';
const bytes = Buffer.from('Original synthetic methodology evidence.\n');
const hash = (data: Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
const identity = {
  project: 'project-a',
  version: 'version-a',
  uploader: 'author-a',
  path: 'methods/research.md',
  bytes: bytes.length,
  sha256: hash(bytes),
};
const correlation = '11111111-1111-4111-8111-111111111111';
const pending: DemoUploadReservation = {
  ...identity,
  id: 'reservation-a',
  correlation,
  stagingKey: '22222222-2222-4222-8222-222222222222',
  status: 'active',
};
function ports(
  known?: DemoUploadReservation,
  active?: DemoUploadReservation,
  valid = true,
) {
  return {
    save: vi.fn(async () => {}),
    known: vi.fn(async () => known),
    pending: vi.fn(async () => active),
    verify: vi.fn(async () => valid),
  };
}
it('persists a new upload identity before returning it to the reservation caller', async () => {
  const journal: Record<string, DemoUploadIntent> = {},
    p = ports();
  const value = await prepareDemoUploadIntent(identity, journal, p);
  expect(p.save).toHaveBeenCalledOnce();
  expect(journal[demoUploadKey(identity)]).toEqual(value);
  expect(value.correlation).toMatch(/^[a-f0-9-]{36}$/);
});
it('retains a journaled correlation after interruption before reservation', async () => {
  const journal = { [demoUploadKey(identity)]: { ...identity, correlation } },
    p = ports();
  expect(
    (await prepareDemoUploadIntent(identity, journal, p)).correlation,
  ).toBe(correlation);
  expect(p.save).not.toHaveBeenCalled();
  expect(p.pending).not.toHaveBeenCalled();
});
it('reuses the original active reservation identity after an interrupted finalization', async () => {
  const journal = { [demoUploadKey(identity)]: { ...identity, correlation } },
    p = ports(pending);
  expect(
    (await prepareDemoUploadIntent(identity, journal, p)).correlation,
  ).toBe(correlation);
  expect(p.save).not.toHaveBeenCalled();
});
it('adopts a pre-journal reservation only after exact-scope and byte verification', async () => {
  const journal = {},
    p = ports(undefined, pending);
  expect(
    (await prepareDemoUploadIntent(identity, journal, p)).correlation,
  ).toBe(correlation);
  expect(p.verify).toHaveBeenCalledWith(pending.stagingKey, {
    size: bytes.length,
    sha256: hash(bytes),
  });
  expect(p.save).toHaveBeenCalledOnce();
});
it('refuses unknown or different staged bytes without changing the journal', async () => {
  const journal = {},
    p = ports(undefined, pending, false);
  await expect(prepareDemoUploadIntent(identity, journal, p)).rejects.toThrow(
    'DEMO_UNRECOGNIZED_PENDING_UPLOAD',
  );
  expect(journal).toEqual({});
  expect(p.save).not.toHaveBeenCalled();
});
it('refuses a journaled reservation whose actor or version has changed', async () => {
  const journal = { [demoUploadKey(identity)]: { ...identity, correlation } };
  await expect(
    prepareDemoUploadIntent(
      identity,
      journal,
      ports({ ...pending, version: 'different-version' }),
    ),
  ).rejects.toThrow('DEMO_UPLOAD_SCOPE_CONFLICT');
});
it('starts a new recorded attempt only when the earlier known reservation is terminal', async () => {
  const journal = { [demoUploadKey(identity)]: { ...identity, correlation } },
    p = ports({ ...pending, status: 'failed' });
  const value = await prepareDemoUploadIntent(identity, journal, p);
  expect(value.correlation).not.toBe(correlation);
  expect(p.save).toHaveBeenCalledOnce();
});
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'capstone-demo-upload-recovery-'));
});
afterAll(async () => {
  await rm(root, { recursive: true });
});
async function setup(data = bytes) {
  const dir = join(root, randomUUID()),
    storage = await createNativeStorage(
      join(dir, '.local/storage'),
      dir,
      'test',
    ),
    key = randomUUID();
  const descriptor = await storage.write(
    key,
    (async function* () {
      yield data;
    })(),
    data.length,
  );
  return { storage, key, descriptor, dir };
}
it('reuses byte-identical staging while retaining the normal format validation', async () => {
  const { storage, key, descriptor } = await setup();
  const originalWrite = vi.spyOn(storage, 'write');
  const wrapped = resumableDemoStorage(storage, new Map([[key, descriptor]]));
  expect(
    await wrapped.write(
      key,
      (async function* () {
        yield bytes;
      })(),
      bytes.length,
    ),
  ).toEqual(descriptor);
  expect(originalWrite).not.toHaveBeenCalled();
  expect(await validateContent(wrapped, key, 'md', bytes.length)).toBe(
    'text/plain',
  );
});
it('does not overwrite mismatching staged bytes or retain partial writes', async () => {
  const { storage, key, descriptor, dir } = await setup();
  const different = Buffer.from('Different original'),
    wrapped = resumableDemoStorage(
      storage,
      new Map([[key, { size: different.length, sha256: hash(different) }]]),
    );
  await expect(
    wrapped.write(
      key,
      (async function* () {
        yield different;
      })(),
      different.length,
    ),
  ).rejects.toMatchObject({ code: 'WRITE_FAILED' });
  expect(await storage.verify(key, descriptor)).toBe(true);
  expect(
    (await readdir(join(dir, '.local/storage'))).some((name) =>
      name.startsWith('.partial-'),
    ),
  ).toBe(false);
});
it('does not enable byte reuse without a current loader expectation', async () => {
  const { storage, key } = await setup(),
    wrapped = resumableDemoStorage(storage, new Map());
  await expect(
    wrapped.write(
      key,
      (async function* () {
        yield bytes;
      })(),
      bytes.length,
    ),
  ).rejects.toMatchObject({ code: 'WRITE_FAILED' });
});
it('still rejects executable bytes even when a staged-byte hash is identical', async () => {
  const executable = Buffer.from('MZ synthetic executable signature'),
    { storage, key, descriptor } = await setup(executable),
    wrapped = resumableDemoStorage(storage, new Map([[key, descriptor]]));
  await wrapped.write(
    key,
    (async function* () {
      yield executable;
    })(),
    executable.length,
  );
  await expect(
    validateContent(wrapped, key, 'md', executable.length),
  ).rejects.toThrow('EXECUTABLE');
});

it('cleans only interrupted temporary writes for the recorded staging key', async () => {
  const { storage, key, descriptor, dir } = await setup();
  const own = `.partial-${key}-${randomUUID()}`,
    unrelated = `.partial-${randomUUID()}-${randomUUID()}`;
  await writeFile(join(dir, '.local/storage', own), 'interrupted own write', {
    mode: 0o600,
  });
  await writeFile(
    join(dir, '.local/storage', unrelated),
    'other pending work',
    { mode: 0o600 },
  );
  const wrapped = resumableDemoStorage(storage, new Map([[key, descriptor]]));
  await wrapped.write(
    key,
    (async function* () {
      yield bytes;
    })(),
    bytes.length,
  );
  const names = await readdir(join(dir, '.local/storage'));
  expect(names).not.toContain(own);
  expect(names).toContain(unrelated);
  expect(await readFile(join(dir, '.local/storage', unrelated), 'utf8')).toBe(
    'other pending work',
  );
  expect(await storage.verify(key, descriptor)).toBe(true);
});
