export interface AccessCommand {
  operation:
    'request' | 'cancel' | 'approve' | 'deny' | 'revoke' | 'protective-revoke';
  commandId: string;
  project: string;
  version: string;
  target?: string;
  revision?: number;
  text?: string;
}
interface AccessRequest {
  id: string;
  project: string;
  version: string;
  versionNumber: number;
  title: string;
  partnerName: string;
  organization: string;
  justification: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  revision: number;
  createdAt: string;
  decidedAt: string | null;
  reason: string | null;
  cancelledAt: string | null;
  eligible: boolean;
}
interface AccessGrant {
  id: string;
  request: string;
  project: string;
  version: string;
  versionNumber: number;
  title: string;
  partnerName: string;
  organization: string;
  revision: number;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  reason: string | null;
  state: 'active' | 'expired' | 'revoked';
  canRead: boolean;
}
export interface AccessView {
  now: string;
  lead: boolean;
  requests: AccessRequest[];
  grants: AccessGrant[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function accessText(
  value: unknown,
  min: number,
  max: number,
  paragraph = false,
): value is string {
  return (
    typeof value === 'string' &&
    [...value.trim()].length >= min &&
    [...value].length <= max &&
    !(
      paragraph
        ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u
        : /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u
    ).test(value)
  );
}
export function validAccessCommand(value: unknown): value is AccessCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        ![
          'operation',
          'commandId',
          'project',
          'version',
          'target',
          'revision',
          'text',
        ].includes(k),
    ) ||
    ![
      'request',
      'cancel',
      'approve',
      'deny',
      'revoke',
      'protective-revoke',
    ].includes(String(v['operation'])) ||
    !['commandId', 'project', 'version'].every(
      (k) => typeof v[k] === 'string' && uuid.test(v[k]),
    )
  )
    return false;
  if (v['operation'] === 'request')
    return (
      v['target'] === undefined &&
      v['revision'] === undefined &&
      accessText(v['text'], 20, 2000, true)
    );
  if (
    typeof v['target'] !== 'string' ||
    !uuid.test(v['target']) ||
    !Number.isInteger(v['revision']) ||
    Number(v['revision']) < 0 ||
    Number(v['revision']) > 2147483647
  )
    return false;
  if (v['operation'] === 'cancel') return v['text'] === undefined;
  return v['text'] === undefined
    ? v['operation'] === 'approve'
    : accessText(v['text'], 3, 400) &&
        !/password|secret|token|cookie|postgres(?:ql)?:/i.test(v['text']);
}
