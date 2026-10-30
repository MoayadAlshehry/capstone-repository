import { noticeMessage } from '@capstone/domain/notification-types';
export type Locale = 'en' | 'ar';
export const copy = (locale: Locale, en: string, ar: string) =>
  locale === 'ar' ? ar : en;
export function accessState(locale: Locale, state: string) {
  const labels: Record<string, [string, string]> = {
    pending: ['Pending eligibility', 'أهلية قيد المراجعة'],
    awaiting_lead: ['Awaiting project lead', 'بانتظار قائد المشروع'],
    paused: ['Access paused', 'الوصول موقوف'],
    unavailable: ['Access unavailable', 'الوصول غير متاح'],
    unknown: ['Access unconfirmed', 'الوصول غير مؤكد'],
    approved: ['Approved', 'معتمد'],
    eligible: ['Eligibility approved', 'الأهلية معتمدة'],
    ineligible: ['Not currently eligible', 'غير مؤهل حاليًا'],
    denied: ['Declined', 'مرفوض'],
    cancelled: ['Cancelled', 'ملغى'],
    active: ['Access active', 'وصول ساري'],
    expired: ['Expired', 'منتهي'],
    revoked: ['Revoked', 'مسحوب'],
    rejected: ['Rejected', 'مرفوض'],
    suspended: ['Suspended', 'موقوف'],
  };
  return labels[state]
    ? copy(locale, ...labels[state]!)
    : copy(locale, 'Unavailable', 'غير متاح');
}
export function accessParent(locale: Locale, value: unknown, fallback: string) {
  if (
    typeof value !== 'string' ||
    value.length > 1800 ||
    /[\\\r\n]/.test(value)
  )
    return '/' + locale + fallback;
  try {
    const u = new URL(value, 'https://return.invalid');
    const p = u.pathname.replace(/^\/(en|ar)/, '');
    if (
      u.origin !== 'https://return.invalid' ||
      u.hash ||
      !/^\/(?:partner(?:\/(?:access|grants|eligibility))?|access\/lead|projects(?:\/[a-f0-9-]{36})?|catalogue\/[a-f0-9-]{36}|supervision(?:\/projects\/[a-f0-9-]{36})?|admin\/access|admin\/platform(?:\/approvals)?)$/.test(
        p,
      )
    )
      return '/' + locale + fallback;
    const q = new URLSearchParams();
    for (const key of ['q', 'status', 'page', 'project', 'request', 'tab'])
      if (u.searchParams.has(key))
        q.set(key, u.searchParams.get(key)!.slice(0, 200));
    if (p === '/partner/grants') {
      q.set(
        'tab',
        ['revoked', 'expired'].includes(q.get('status') ?? '')
          ? 'history'
          : 'active',
      );
      return '/' + locale + '/partner/access?' + q;
    }
    return '/' + locale + p + (q.size ? '?' + q : '');
  } catch {
    return '/' + locale + fallback;
  }
}
export function noticeLabel(locale: Locale, type: string) {
  const names: Record<string, [string, string]> = {
    'academic.final.requested': [
      'Final submission requested',
      'طُلب الإرسال النهائي',
    ],
    'academic.final.accepted': [
      'Final admitted for assessment',
      'قُبل الإرسال النهائي للتقييم',
    ],
    'academic.final.revision_requested': [
      'Make final changes',
      'أجرِ التعديلات النهائية',
    ],
    'partner.resubmit': ['Organization response submitted', 'أُرسل رد المؤسسة'],
    'partner-access.request': ['Partner access requested', 'طُلب وصول شريك'],
    'partner-access.approve': [
      'Project access approved',
      'اعتمد الوصول إلى المشروع',
    ],
    'partner-access.deny': [
      'Project access declined',
      'رُفض الوصول إلى المشروع',
    ],
    'partner-access.revoke': [
      'Project access revoked',
      'سُحب الوصول إلى المشروع',
    ],
    'partner-access.protective-revoke': [
      'Access revoked for protection',
      'سُحب الوصول للحماية',
    ],
    'partner.approve': ['Partner eligibility approved', 'اعتمدت أهلية الشريك'],
    'partner.reject': ['Partner eligibility rejected', 'رُفضت أهلية الشريك'],
    'partner.suspend': ['Partner eligibility suspended', 'أوقفت أهلية الشريك'],
    'partner.reapprove': [
      'Partner eligibility restored',
      'استعيدت أهلية الشريك',
    ],
  };
  return names[type]
    ? copy(locale, ...names[type]!)
    : noticeMessage(type, locale);
}
export function noticeActionLabel(locale: Locale, type: string, kind: string) {
  if (type === 'checkpoint.accept' || type === 'checkpoint.changes')
    return copy(
      locale,
      'Read checkpoint feedback',
      'قراءة ملاحظات نقطة المراجعة',
    );
  if (type === 'checkpoint.sent')
    return copy(locale, 'Review checkpoint', 'مراجعة نقطة المراجعة');
  if (kind === 'account') return copy(locale, 'Open account', 'فتح الحساب');
  if (kind === 'project') return copy(locale, 'Open project', 'فتح المشروع');
  if (kind === 'submission')
    return copy(locale, 'Read submitted work', 'قراءة العمل المرسل');
  if (kind === 'evaluation-feedback')
    return copy(locale, 'Read academic feedback', 'قراءة الملاحظات الأكاديمية');
  if (kind === 'evaluation-governance')
    return copy(locale, 'Review assessment matter', 'مراجعة مسألة التقييم');
  return undefined;
}
