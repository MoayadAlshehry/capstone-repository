export const partnerStates = [
  'pending',
  'approved',
  'rejected',
  'suspended',
] as const;
export type PartnerStatus = (typeof partnerStates)[number];
export interface PartnerProfile {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  clarification?: string | null;
  accountStatus: string;
  status: PartnerStatus;
  revision: number;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  history: {
    revision: number;
    from: PartnerStatus | null;
    to: PartnerStatus;
    reason: string | null;
    at: string;
  }[];
}
const control = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
export function boundedPartnerText(
  value: unknown,
  max = 200,
  min = 1,
): value is string {
  return (
    typeof value === 'string' &&
    [...value.trim()].length >= min &&
    [...value].length <= max &&
    !control.test(value)
  );
}
export function validPartnerRegistration(value: unknown): value is {
  name: string;
  email: string;
  organization: string;
  password: string;
  confirmation: string;
  locale: 'en' | 'ar';
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).length === 6 &&
    Object.keys(v).every((k) =>
      [
        'name',
        'email',
        'organization',
        'password',
        'confirmation',
        'locale',
      ].includes(k),
    ) &&
    boundedPartnerText(v['name']) &&
    boundedPartnerText(v['organization']) &&
    typeof v['email'] === 'string' &&
    v['email'].length <= 254 &&
    !control.test(v['email']) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v['email'].trim()) &&
    typeof v['password'] === 'string' &&
    v['password'].length >= 12 &&
    v['password'].length <= 128 &&
    !control.test(v['password']) &&
    v['password'] === v['confirmation'] &&
    ['en', 'ar'].includes(String(v['locale']))
  );
}
export interface PartnerCommand {
  command: 'approve' | 'reject' | 'suspend' | 'reapprove' | 'resubmit';
  commandId: string;
  target: string;
  revision: number;
  reason?: string;
  organization?: string;
  clarification?: string;
}
export function validPartnerCommand(value: unknown): value is PartnerCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>,
    uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (
    Object.keys(v).every((k) =>
      [
        'command',
        'commandId',
        'target',
        'revision',
        'reason',
        'organization',
        'clarification',
      ].includes(k),
    ) &&
    typeof v['commandId'] === 'string' &&
    uuid.test(v['commandId']) &&
    typeof v['target'] === 'string' &&
    uuid.test(v['target']) &&
    Number.isInteger(v['revision']) &&
    Number(v['revision']) >= 0 &&
    ['approve', 'reject', 'suspend', 'reapprove', 'resubmit'].includes(
      String(v['command']),
    ) &&
    (v['command'] === 'resubmit'
      ? boundedPartnerText(v['organization']) &&
        v['reason'] === undefined &&
        (v['clarification'] === undefined ||
          (typeof v['clarification'] === 'string' &&
            [...v['clarification'].trim()].length >= 3 &&
            [...v['clarification']].length <= 1000 &&
            !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(
              v['clarification'],
            ) &&
            !/(password|secret|token|cookie)\s*[:=]/i.test(v['clarification'])))
      : v['organization'] === undefined &&
        v['clarification'] === undefined &&
        (v['reason'] === undefined
          ? !['reject', 'suspend'].includes(String(v['command']))
          : boundedPartnerText(v['reason'], 400, 3) &&
            !/password|token|cookie|postgres(?:ql)?:/i.test(v['reason'])))
  );
}
