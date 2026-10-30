import { brandedMail } from './branded-mail.js';
export interface CommitteeMessage {
  purpose: 'COMMITTEE_INVITE' | 'COMMITTEE_OTP';
  to: string;
  name?: string;
  locale?: string;
  submission?: string;
  link?: string;
  code?: string;
  invitation?: string;
  amendment?: boolean;
}
const copy = {
  en: {
    brand: 'Capstone Repository',
    inviteSubject: 'Committee assessment invitation',
    codeSubject: 'Verification code',
    inviteLabel: 'AN INVITATION TO CONTRIBUTE',
    codeLabel: 'EMAIL VERIFICATION',
    inviteTitle: 'Share your expertise.',
    amendTitle: 'Update your assessment.',
    codeTitle: 'Your verification code',
    inviteBody:
      'You’re invited to assess a graduation project on Capstone Repository.',
    amendBody: 'You can now update your submitted project assessment.',
    codeBody: 'Enter this code to continue to your assessment.',
    action: 'View invitation',
    amendAction: 'Review assessment',
    days: 'Your invitation is available for 14 days.',
    hours: 'Your update invitation is available for 72 hours.',
    verify: 'We’ll verify your email before you begin.',
    minutes: 'Valid for 10 minutes. Keep this code private.',
    ignore: 'If you weren’t expecting this email, you can ignore it.',
    secondaryInvite: 'أنت مدعو لتقييم مشروع تخرج. افتح الدعوة للبدء.',
    secondaryAmend: 'يمكنك الآن تحديث تقييمك المرسل.',
    secondaryCode: 'أدخل الرمز لمتابعة التقييم. صلاحيته ١٠ دقائق.',
  },
  ar: {
    brand: 'مستودع مشاريع التخرج',
    inviteSubject: 'دعوة تقييم مشروع تخرج · Committee assessment invitation',
    codeSubject: 'رمز التحقق · Verification code',
    inviteLabel: 'دعوة للمشاركة بخبرتك',
    codeLabel: 'توثيق البريد الإلكتروني',
    inviteTitle: 'خبرتك تصنع الفرق.',
    amendTitle: 'حدّث تقييمك.',
    codeTitle: 'رمز التحقق الخاص بك',
    inviteBody: 'أنت مدعو لتقييم مشروع تخرج على منصة مستودع مشاريع التخرج.',
    amendBody: 'يمكنك الآن تحديث تقييم المشروع الذي أرسلته.',
    codeBody: 'أدخل هذا الرمز لمتابعة تقييمك.',
    action: 'عرض الدعوة',
    amendAction: 'مراجعة التقييم',
    days: 'دعوتك متاحة لمدة ١٤ يومًا.',
    hours: 'دعوة التحديث متاحة لمدة ٧٢ ساعة.',
    verify: 'سنتحقق من بريدك الإلكتروني قبل البدء.',
    minutes: 'صالح لمدة ١٠ دقائق. لا تشاركه مع أحد.',
    ignore: 'إذا لم تكن تتوقع هذه الرسالة، يمكنك تجاهلها.',
    secondaryInvite:
      'You’re invited to assess a graduation project. Open your invitation to begin.',
    secondaryAmend: 'You can now update your submitted assessment.',
    secondaryCode: 'Enter the code to continue. It is valid for 10 minutes.',
  },
} as const;
/** Table-based, inline-styled email. Internal scope/provenance belongs in the authenticated workspace. */
export function committeeTemplate(m: CommitteeMessage, origin: string) {
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(m.to) || m.to.length > 254)
    throw Error('INVALID_MESSAGE');
  const invite = m.purpose === 'COMMITTEE_INVITE';
  if (invite) {
    const u = new URL(m.link ?? '');
    if (
      u.origin !== origin ||
      !/^\/(en|ar)\/committee\/[a-f0-9-]{36}$/.test(u.pathname) ||
      u.search ||
      !/^#token=[A-Za-z0-9_-]{43}$/.test(u.hash)
    )
      throw Error('INVALID_MESSAGE');
  } else if (m.purpose !== 'COMMITTEE_OTP' || !/^\d{6}$/.test(m.code ?? ''))
    throw Error('INVALID_MESSAGE');
  const locale = m.locale === 'ar' ? 'ar' : 'en',
    c = copy[locale];
  const title = invite
      ? m.amendment
        ? c.amendTitle
        : c.inviteTitle
      : c.codeTitle,
    body = invite ? (m.amendment ? c.amendBody : c.inviteBody) : c.codeBody,
    label = invite ? c.inviteLabel : c.codeLabel,
    secondary = invite
      ? m.amendment
        ? c.secondaryAmend
        : c.secondaryInvite
      : c.secondaryCode,
    expiry = invite ? (m.amendment ? c.hours : c.days) : c.minutes,
    action = m.amendment ? c.amendAction : c.action;
  const subject =
    (invite ? c.inviteSubject : c.codeSubject) + ' · Capstone Repository';
  return brandedMail({
    locale,
    origin,
    subject,
    title,
    body,
    label,
    expiry: expiry + (invite ? ' ' + c.verify : ''),
    secondary,
    ...(invite ? { action, link: m.link! } : { code: m.code! }),
  });
}
