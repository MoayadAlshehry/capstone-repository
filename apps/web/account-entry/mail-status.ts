import type { AccountAccessPerson } from './access-types.js';
export function currentAccountRequest(person: AccountAccessPerson) {
  const completed = person.messages.find(
    (m) => m.purpose === 'PASSWORD_RESET_COMPLETED',
  );
  return (
    person.messages.find(
      (m) =>
        m.purpose !== 'PASSWORD_RESET_COMPLETED' &&
        m.state !== 'expired' &&
        Date.parse(m.expiresAt) > Date.parse(person.serverNow) &&
        !(
          m.purpose === 'ACCOUNT_SETUP' &&
          (person.status === 'active' ||
            ['used', 'revoked'].includes(person.invitation?.state ?? ''))
        ) &&
        !(
          m.purpose === 'PASSWORD_RESET' &&
          completed &&
          Date.parse(completed.createdAt) >= Date.parse(m.createdAt)
        ) &&
        !['used', 'completed', 'revoked'].includes(m.state),
    ) ?? null
  );
}
export function mailStatusLabel(state: string, locale: 'en' | 'ar') {
  const copy: Record<string, [string, string]> = {
    queued: ['Email request queued', 'طلب البريد في الانتظار'],
    sending: ['Processing email request', 'جارٍ معالجة طلب البريد'],
    provider_accepted: ['Email accepted for delivery', 'قُبل البريد للإرسال'],
    captured: [
      'Email recorded · receipt unverified',
      'سُجل البريد · الوصول غير مؤكد',
    ],
    mailpit_accepted: [
      'Email recorded · receipt unverified',
      'سُجل البريد · الوصول غير مؤكد',
    ],
    unknown: ['Email send outcome unconfirmed', 'نتيجة الإرسال غير مؤكدة'],
    failed: ['Email request failed', 'تعذر طلب البريد'],
    expired: ['Earlier request expired', 'انتهت صلاحية طلب سابق'],
  };
  return (copy[state] ?? ['Status not confirmed', 'الحالة غير مؤكدة'])[
    locale === 'ar' ? 1 : 0
  ];
}
