import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decryptAccountMail } from '../../packages/db/src/account-mail-crypto.js';

/** Private owned-install fixture adapter, never an application/API entrypoint. */
export async function installedAccountSetupToken(
  message: { id: string; ciphertext: string | null },
  key: string,
  user: string,
  origin: string,
  captureRoot: string,
  attempts = 100,
) {
  if (!/^[a-f0-9-]{36}$/i.test(message.id))
    throw Error('INVALID_LOCAL_CAPTURE_ID');
  let content: unknown;
  if (typeof message.ciphertext === 'string' && message.ciphertext.length) {
    content = decryptAccountMail(
      message.ciphertext,
      key,
      `${message.id}|ACCOUNT_SETUP|${user}`,
    );
  } else {
    // The real worker deliberately clears ciphertext after successful delivery.
    // Consume that owned private capture rather than relaxing token retirement.
    const file = join(captureRoot, message.id + '.json');
    for (let i = 0; i < attempts; i++) {
      try {
        const s = await lstat(file);
        if (
          !s.isFile() ||
          s.isSymbolicLink() ||
          s.mode & 0o077 ||
          s.uid !== process.getuid?.()
        )
          throw Error('UNSAFE_LOCAL_MAIL_CAPTURE');
        content = JSON.parse(await readFile(file, 'utf8'));
        break;
      } catch (error) {
        if (!(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
        if (i + 1 < attempts)
          await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    if (!content) throw Error('LOCAL_SETUP_CAPTURE_UNAVAILABLE');
  }
  if (
    !content ||
    typeof content !== 'object' ||
    !('link' in content) ||
    typeof content.link !== 'string'
  )
    throw Error('INVALID_LOCAL_SETUP_CAPTURE');
  const link = new URL(content.link);
  if (link.origin !== origin || !/^#token=[A-Za-z0-9_-]{43}$/.test(link.hash))
    throw Error('UNEXPECTED_LOCAL_SETUP_LINK');
  return link.hash.slice(7);
}
