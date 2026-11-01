import { it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptAccountMail } from '../../packages/db/src/account-mail-crypto.js';
import { installedAccountSetupToken } from './installed-account-setup.js';
const origin = 'http://127.0.0.1:3760';
it('handles queued encrypted setup content without requiring a delivered capture', async () => {
  const id = randomUUID(),
    user = randomUUID(),
    key = randomBytes(32).toString('base64url'),
    token = randomBytes(32).toString('base64url');
  const ciphertext = encryptAccountMail(
    { link: origin + '/en/setup-account#token=' + token },
    key,
    `${id}|ACCOUNT_SETUP|${user}`,
  );
  expect(
    await installedAccountSetupToken(
      { id, ciphertext },
      key,
      user,
      origin,
      '/unused-owned-unit-path',
    ),
  ).toBe(token);
});
it('handles deliberately retired ciphertext through the private delivered capture', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'capstone-owned-mail-unit-'));
  try {
    const id = randomUUID(),
      token = randomBytes(32).toString('base64url');
    await writeFile(
      join(dir, id + '.json'),
      JSON.stringify({ link: origin + '/en/setup-account#token=' + token }),
      { mode: 0o600 },
    );
    expect(
      await installedAccountSetupToken(
        { id, ciphertext: null },
        '',
        randomUUID(),
        origin,
        dir,
      ),
    ).toBe(token);
  } finally {
    await rm(dir, { recursive: true });
  }
});
it('rejects a capture pointing to a different origin', async () => {
  const id = randomUUID(),
    user = randomUUID(),
    key = randomBytes(32).toString('base64url');
  const ciphertext = encryptAccountMail(
    {
      link:
        'https://example.invalid/setup#token=' +
        randomBytes(32).toString('base64url'),
    },
    key,
    `${id}|ACCOUNT_SETUP|${user}`,
  );
  await expect(
    installedAccountSetupToken(
      { id, ciphertext },
      key,
      user,
      origin,
      '/unused-owned-unit-path',
    ),
  ).rejects.toThrow('UNEXPECTED_LOCAL_SETUP_LINK');
});
it('fails explicitly when retired content has no available local capture', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'capstone-owned-mail-unit-'));
  try {
    await expect(
      installedAccountSetupToken(
        { id: randomUUID(), ciphertext: null },
        '',
        randomUUID(),
        origin,
        dir,
        1,
      ),
    ).rejects.toThrow('LOCAL_SETUP_CAPTURE_UNAVAILABLE');
  } finally {
    await rm(dir, { recursive: true });
  }
});
