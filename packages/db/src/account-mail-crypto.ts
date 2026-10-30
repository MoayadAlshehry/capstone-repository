import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';
export const tokenDigest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const newAccountToken = () => randomBytes(32).toString('base64url');
export function encryptAccountMail(value: unknown, key: string, aad: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64url'), iv);
  cipher.setAAD(Buffer.from(aad));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((x) => x.toString('base64url'))
    .join('.');
}
export function decryptAccountMail(
  ciphertext: string,
  key: string,
  aad: string,
): unknown {
  const parts = ciphertext.split('.');
  if (parts.length !== 3) throw Error('MAIL_CONTENT_UNAVAILABLE');
  const [iv, tag, bytes] = parts.map((x) => Buffer.from(x, 'base64url'));
  if (iv!.length !== 12 || tag!.length !== 16 || bytes!.length > 24000)
    throw Error('MAIL_CONTENT_UNAVAILABLE');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'base64url'),
    iv!,
  );
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag!);
  return JSON.parse(
    Buffer.concat([decipher.update(bytes!), decipher.final()]).toString('utf8'),
  );
}
