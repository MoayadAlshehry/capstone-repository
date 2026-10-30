import { brandedMail } from './branded-mail.js';
import 'server-only';
import {
  mkdir,
  writeFile,
  readFile,
  lstat,
  realpath,
  readdir,
  unlink,
} from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { APPROVED_ZEPTOMAIL_US_ENDPOINT } from '@capstone/config/account-mail';
import type {
  AccountMailConfig,
  MailPurpose,
} from '@capstone/config/account-mail';
export interface AccountMessage {
  purpose: MailPurpose;
  to: string;
  name: string;
  locale: 'en' | 'ar';
  link: string | null;
}
const purposes = [
  'ACCOUNT_SETUP',
  'PASSWORD_RESET',
  'PASSWORD_RESET_COMPLETED',
];
export function accountMailTemplate(message: AccountMessage) {
  if (
    Object.keys(message).sort().join(',') !== 'link,locale,name,purpose,to' ||
    !purposes.includes(message.purpose) ||
    !['en', 'ar'].includes(message.locale) ||
    message.name.length > 200 ||
    message.to.length > 254 ||
    !/^[^\s<>@]+@[^\s<>@]+$/.test(message.to)
  )
    throw Error('INVALID_ACCOUNT_MESSAGE');
  const ar = message.locale === 'ar',
    setup = message.purpose === 'ACCOUNT_SETUP',
    complete = message.purpose === 'PASSWORD_RESET_COMPLETED';
  if (
    (complete && message.link !== null) ||
    (!complete && (!message.link || message.link.length > 3000))
  )
    throw Error('INVALID_ACCOUNT_MESSAGE');
  const subject = complete
    ? ar
      ? 'اكتملت إعادة تعيين كلمة المرور'
      : 'Password reset completed'
    : setup
      ? ar
        ? 'إعداد حسابك في مستودع مشاريع التخرج'
        : 'Set up your Capstone Repository account'
      : ar
        ? 'إعادة تعيين كلمة المرور'
        : 'Reset your password';
  const instruction = complete
    ? ar
      ? 'غُيّرت كلمة مرورك وأُلغيت الجلسات السابقة. إذا لم تطلب ذلك، تواصل مع إدارة مؤسستك.'
      : 'Your password was reset and previous sessions were revoked. If you did not request this, contact your institution administrator.'
    : setup
      ? ar
        ? 'اختر كلمة مرور لحسابك الفردي. تنتهي صلاحية الرابط بعد 24 ساعة.'
        : 'Choose a password for your individual account. This link expires after 24 hours.'
      : ar
        ? 'اختر كلمة مرور جديدة. تنتهي صلاحية الرابط بعد ساعة واحدة.'
        : 'Choose a new password. This link expires after 1 hour.';
  const action = setup
    ? ar
      ? 'إعداد الحساب'
      : 'Set up account'
    : ar
      ? 'إعادة تعيين كلمة المرور'
      : 'Reset password';
  return brandedMail({
    locale: message.locale,
    origin: message.link
      ? new URL(message.link).origin
      : 'http://localhost',
    subject,
    title: subject,
    body: instruction,
    label: ar ? 'أمان حسابك' : 'YOUR ACCOUNT',
    expiry: complete
      ? ''
      : ar
        ? 'الرابط شخصي ولا يُستخدم إلا مرة واحدة.'
        : 'This personal link can only be used once.',
    name: message.name,
    ...(message.link ? { link: message.link, action } : {}),
  });
}
export type MailSendResult = {
  state: 'captured' | 'provider_accepted' | 'failed' | 'unknown';
  code: string;
  retryAfterSeconds?: number;
};
async function captureDirectory(config: AccountMailConfig) {
  if (!config.captureRoot) throw Error('CAPTURE_PATH_REFUSED');
  const root = resolve(config.captureRoot),
    local = resolve(config.workspaceRoot, '.local'),
    inside = relative(local, root);
  if (!inside || inside.startsWith('..') || isAbsolute(inside))
    throw Error('CAPTURE_PATH_REFUSED');
  let current = root;
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw Error('CAPTURE_PATH_REFUSED');
    } catch (e) {
      if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'))
        throw e;
    }
    if (current === local) break;
    current = dirname(current);
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  const actual = await realpath(root),
    resolved = relative(await realpath(local), actual);
  if (resolved.startsWith('..') || isAbsolute(resolved))
    throw Error('CAPTURE_PATH_REFUSED');
  return actual;
}
// The private development mailbox is credential material, retained for at most one hour.
export async function purgeAccountCapture(config: AccountMailConfig) {
  if (config.mode !== 'capture') return;
  const root = await captureDirectory(config);
  for (const name of await readdir(root)) {
    if (!/^[0-9a-f-]{36}\.json$/i.test(name)) continue;
    const file = join(root, name),
      stat = await lstat(file);
    if (stat.isSymbolicLink()) throw Error('CAPTURE_PATH_REFUSED');
    if (stat.isFile() && stat.mtimeMs < Date.now() - 3600000)
      await unlink(file);
  }
}
export async function sendAccountMail(
  config: AccountMailConfig,
  id: string,
  message: AccountMessage,
  fetcher: typeof fetch = fetch,
): Promise<MailSendResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error('INVALID_ACCOUNT_MESSAGE');
  const body = accountMailTemplate(message);
  if (message.link) {
    const link = new URL(message.link);
    const route =
      message.purpose === 'ACCOUNT_SETUP' ? 'setup-account' : 'reset-password';
    if (
      link.origin !== config.appOrigin ||
      !new RegExp(`^/(en|ar)/${route}$`).test(link.pathname) ||
      link.search ||
      !/^#token=[A-Za-z0-9_-]{43}$/.test(link.hash)
    )
      throw Error('INVALID_ACCOUNT_MESSAGE');
  }
  if (config.mode === 'disabled')
    return { state: 'failed', code: 'MAIL_NOT_CONFIGURED' };
  if (config.mode === 'capture') {
    if (!/\.local$/i.test(message.to) || !config.captureRoot)
      throw Error('CAPTURE_RECIPIENT_REFUSED');
    const actual = await captureDirectory(config);
    const file = join(actual, id + '.json'),
      data = JSON.stringify({
        id,
        mode: 'local-capture',
        ...message,
        ...body,
        track_opens: false,
        track_clicks: false,
      });
    try {
      await writeFile(file, data, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (
        !(e && typeof e === 'object' && 'code' in e && e.code === 'EEXIST') ||
        (await readFile(file, 'utf8')) !== data
      )
        throw Error('CAPTURE_FAILED');
    }
    return { state: 'captured', code: 'LOCAL_CAPTURED' };
  }
  if (/\.local$/i.test(message.to))
    throw Error('LIVE_SYNTHETIC_RECIPIENT_REFUSED');
  return sendApprovedProviderMail(
    config,
    id,
    message.to,
    message.name,
    body,
    fetcher,
  );
}

/** Shared approved Zoho adapter. Committee mail reuses this sender, credentials and receipt checks. */
export async function sendApprovedProviderMail(
  config: AccountMailConfig,
  id: string,
  to: string,
  name: string,
  body: { subject: string; textbody: string; htmlbody: string },
  fetcher: typeof fetch = fetch,
): Promise<MailSendResult> {
  if (
    config.mode !== 'zoho' ||
    /\.local$/i.test(to) ||
    !/^[^\s<>@]+@[^\s<>@]+$/.test(to)
  )
    throw Error('LIVE_RECIPIENT_REFUSED');
  try {
    const response = await fetcher(config.endpoint!, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: 'Zoho-enczapikey ' + config.agentKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: { address: config.fromAddress, name: config.fromName },
        to: [{ email_address: { address: to, name } }],
        ...body,
        track_opens: false,
        track_clicks: false,
        client_reference: id,
      }),
    });
    if (response.ok) {
      const reader = response.body?.getReader();
      if (!reader) return { state: 'unknown', code: 'PROVIDER_UNKNOWN' };
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 16000) {
          await reader.cancel();
          return { state: 'unknown', code: 'PROVIDER_UNKNOWN' };
        }
        chunks.push(part.value);
      }
      const receipt = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
      ) as {
        message?: unknown;
        request_id?: unknown;
        data?: { code?: unknown; message?: unknown }[];
      };
      if (
        receipt?.message === 'OK' &&
        typeof receipt.request_id === 'string' &&
        receipt.request_id.length > 0 &&
        receipt.request_id.length <= 200 &&
        Array.isArray(receipt.data) &&
        receipt.data.length === 1 &&
        receipt.data[0]?.code === 'EM_104' &&
        (receipt.data[0]?.message === 'OK' ||
          (config.endpoint === APPROVED_ZEPTOMAIL_US_ENDPOINT &&
            receipt.data[0]?.message === 'Email request received'))
      )
        return { state: 'provider_accepted', code: 'PROVIDER_ACCEPTED' };
      return { state: 'unknown', code: 'PROVIDER_UNKNOWN' };
    }
    if (response.status === 429)
      return {
        state: 'failed',
        code: 'PROVIDER_THROTTLED',
        retryAfterSeconds: Math.min(
          3600,
          Math.max(30, Number(response.headers.get('retry-after')) || 60),
        ),
      };
    return response.status >= 500
      ? { state: 'unknown', code: 'PROVIDER_UNKNOWN' }
      : { state: 'failed', code: 'PROVIDER_REJECTED' };
  } catch {
    return { state: 'unknown', code: 'NETWORK_UNKNOWN' };
  }
}
