import 'server-only';
import { resolve, relative, isAbsolute } from 'node:path';
import { ConfigurationError } from './server.js';
export const ZOHO_EMAIL_ENDPOINTS = {
  US: 'https://cpaas.zoho.com/v1.1/email',
  EU: 'https://cpaas.zoho.eu/v1.1/email',
  IN: 'https://cpaas.zoho.in/v1.1/email',
  AU: 'https://cpaas.zoho.com.au/v1.1/email',
  JP: 'https://cpaas.zoho.jp/v1.1/email',
  CN: 'https://cpaas.zoho.com.cn/v1.1/email',
} as const;
// Owner-authorized existing property-platform sender uses this exact Zoho legacy endpoint.
// Preserve its compatible Send API configuration; do not allow arbitrary mail hosts or redirects.
export const APPROVED_ZEPTOMAIL_US_ENDPOINT =
  'https://api.zeptomail.com/v1.1/email';
export type MailPurpose =
  'ACCOUNT_SETUP' | 'PASSWORD_RESET' | 'PASSWORD_RESET_COMPLETED';
export interface AccountMailConfig {
  mode: 'capture' | 'zoho' | 'disabled';
  appOrigin: string;
  key: string;
  keyId: string;
  fromAddress: string;
  fromName: string;
  endpoint: string | null;
  region: keyof typeof ZOHO_EMAIL_ENDPOINTS | null;
  agentKey: string | null;
  captureRoot: string | null;
  environment: 'local' | 'test' | 'production';
  workspaceRoot: string;
}
const address = /^[^\s<>@]{1,64}@[^\s<>@]{1,189}$/;
export function parseAccountMailConfig(
  input: Record<string, unknown>,
  workspaceRoot: string,
  environment: AccountMailConfig['environment'],
): AccountMailConfig {
  const mode = input['ACCOUNT_MAIL_MODE'] ?? 'disabled';
  if (!['capture', 'zoho', 'disabled'].includes(String(mode)))
    throw new ConfigurationError(['ACCOUNT_MAIL_MODE']);
  const appOrigin = String(
      input['ACCOUNT_MAIL_APP_ORIGIN'] ?? input['AUTH_BASE_URL'] ?? '',
    ),
    key = String(input['ACCOUNT_MAIL_ENCRYPTION_KEY'] ?? ''),
    keyId = String(input['ACCOUNT_MAIL_KEY_ID'] ?? 'v1'),
    fromAddress = String(input['ACCOUNT_MAIL_FROM_ADDRESS'] ?? ''),
    fromName = String(input['ACCOUNT_MAIL_FROM_NAME'] ?? 'Capstone Repository');
  if (mode === 'disabled')
    return {
      mode,
      appOrigin,
      key: '',
      keyId,
      fromAddress: '',
      fromName,
      endpoint: null,
      region: null,
      agentKey: null,
      captureRoot: null,
      environment,
      workspaceRoot,
    };
  let origin: URL;
  try {
    origin = new URL(appOrigin);
  } catch {
    throw new ConfigurationError(['ACCOUNT_MAIL_APP_ORIGIN']);
  }
  if (
    origin.origin !== appOrigin ||
    origin.username ||
    origin.password ||
    (origin.protocol !== 'https:' &&
      !(
        mode === 'capture' &&
        environment !== 'production' &&
        origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(origin.hostname)
      ))
  )
    throw new ConfigurationError(['ACCOUNT_MAIL_APP_ORIGIN']);
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(key) ||
    Buffer.from(key, 'base64url').length !== 32 ||
    !/^v[0-9]{1,4}$/.test(keyId)
  )
    throw new ConfigurationError([
      'ACCOUNT_MAIL_ENCRYPTION_KEY',
      'ACCOUNT_MAIL_KEY_ID',
    ]);
  if (
    !address.test(fromAddress) ||
    fromAddress.length > 254 ||
    fromName.length > 120 ||
    /[\r\n\u0000-\u001f]/.test(fromName)
  )
    throw new ConfigurationError([
      'ACCOUNT_MAIL_FROM_ADDRESS',
      'ACCOUNT_MAIL_FROM_NAME',
    ]);
  if (mode === 'capture') {
    if (environment === 'production')
      throw new ConfigurationError(['ACCOUNT_MAIL_MODE']);
    const captureRoot = resolve(
        String(input['ACCOUNT_MAIL_CAPTURE_ROOT'] ?? ''),
      ),
      inside = relative(resolve(workspaceRoot, '.local'), captureRoot);
    if (!inside || inside.startsWith('..') || isAbsolute(inside))
      throw new ConfigurationError(['ACCOUNT_MAIL_CAPTURE_ROOT']);
    return {
      mode,
      appOrigin,
      key,
      keyId,
      fromAddress,
      fromName,
      endpoint: null,
      region: null,
      agentKey: null,
      captureRoot,
      environment,
      workspaceRoot,
    };
  }
  const region = String(
      input['ACCOUNT_MAIL_REGION'],
    ) as keyof typeof ZOHO_EMAIL_ENDPOINTS,
    endpoint = String(input['ACCOUNT_MAIL_ENDPOINT'] ?? ''),
    agentKey = String(input['ACCOUNT_MAIL_AGENT_KEY'] ?? '');
  if (
    !ZOHO_EMAIL_ENDPOINTS[region] ||
    (endpoint !== ZOHO_EMAIL_ENDPOINTS[region] &&
      !(region === 'US' && endpoint === APPROVED_ZEPTOMAIL_US_ENDPOINT)) ||
    agentKey.length < 20 ||
    agentKey.length > 512 ||
    /[\s\u0000-\u001f]/.test(agentKey) ||
    /\.local$/i.test(fromAddress)
  )
    throw new ConfigurationError([
      'ACCOUNT_MAIL_REGION',
      'ACCOUNT_MAIL_ENDPOINT',
      'ACCOUNT_MAIL_AGENT_KEY',
    ]);
  return {
    mode: 'zoho',
    appOrigin,
    key,
    keyId,
    fromAddress,
    fromName,
    endpoint,
    region,
    agentKey,
    captureRoot: null,
    environment,
    workspaceRoot,
  };
}
export function loadAccountMailConfig() {
  const environment = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(environment))
    throw new ConfigurationError(['APP_ENV']);
  return parseAccountMailConfig(
    process.env,
    process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    environment as AccountMailConfig['environment'],
  );
}
