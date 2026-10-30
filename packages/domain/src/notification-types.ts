export type Locale = 'en' | 'ar';
export interface NoticeLink {
  kind: string;
  id?: string;
  project?: string;
}
export interface Notice {
  id: string;
  type: string;
  created_at: string;
  read_at: string | null;
  args: { deadline?: string };
  link: NoticeLink;
}
export interface NoticePage {
  items: Notice[];
  unread: number;
}
export interface AuditItem {
  id: string;
  actor_id: string | null;
  actor: string;
  actor_role: string | null;
  action: string;
  object_type: string;
  object_id: string;
  project_id: string | null;
  version_id: string | null;
  university_id: string | null;
  occurred_at: string;
  correlation_id: string;
  before_status: string | null;
  after_status: string | null;
}
export interface AuditPage {
  items: AuditItem[];
  scope: string;
}
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
export const stamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= 40 &&
  /^\d{4}-\d\d-\d\d(?:T[0-9:.+-]+Z?| [0-9:.+-]+)?$/.test(v) &&
  Number.isFinite(Date.parse(v));
export function validAuditFilters(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const f = v as Record<string, unknown>;
  if (
    Object.keys(f).some(
      (k) =>
        ![
          'actor',
          'action',
          'project',
          'from',
          'to',
          'before',
          'beforeId',
        ].includes(k),
    )
  )
    return false;
  for (const [k, x] of Object.entries(f)) {
    if (
      ['actor', 'project', 'beforeId'].includes(k)
        ? !uuid(x)
        : k === 'action'
          ? typeof x !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(x)
          : !stamp(x)
    )
      return false;
  }
  return (
    Boolean(f['before']) === Boolean(f['beforeId']) &&
    (!(f['from'] && f['to']) ||
      Date.parse(String(f['from'])) <= Date.parse(String(f['to'])))
  );
}
export function noticeRoute(link: NoticeLink, locale: Locale): string | null {
  if (!['en', 'ar'].includes(locale)) return null;
  const prefix = '/' + locale;
  switch (link.kind) {
    case 'evaluation-governance':
      return uuid(link.id)
        ? prefix + '/evaluation/corrections/' + link.id
        : null;
    case 'evaluation-feedback':
      return uuid(link.id) ? prefix + '/evaluation/feedback/' + link.id : null;
    case 'review-task':
      return uuid(link.id) ? prefix + '/reviewer/tasks/' + link.id : null;
    case 'grant':
      return uuid(link.id) ? prefix + '/partner/grants/' + link.id : null;
    case 'submission':
      return uuid(link.id) ? prefix + '/submissions/' + link.id : null;
    case 'checkpoint':
      return uuid(link.id) ? prefix + '/submissions/' + link.id : null;
    case 'project':
      return uuid(link.id) ? prefix + '/projects/' + link.id : null;
    case 'lead':
      return prefix + '/access/lead';
    case 'partner-access':
      return prefix + '/partner/access';
    case 'partner':
      return prefix + '/partner';
    case 'account':
      return prefix + '/account';
    case 'university-admin':
      return prefix + '/admin/university';
    default:
      return null;
  }
}
export const notificationMessages: Record<string, readonly [string, string]> = {
  'evaluation.governance.authorize': [
    'A correction form awaits your original assessment amendment.',
    'ينتظر نموذج التصحيح تعديل تقييمك الأصلي.',
  ],
  'evaluation.governance.correct': [
    'Your assessment correction was recorded.',
    'تم تسجيل تصحيح تقييمك.',
  ],
  'evaluation.governance.invalidate': [
    'Your assessment has a governance update.',
    'يوجد تحديث حوكمة لتقييمك.',
  ],
  'evaluation.governance.hold': [
    'An assessment governance matter requires attention.',
    'تتطلب مسألة حوكمة التقييم الانتباه.',
  ],
  'evaluation.governance.resolve': [
    'An assessment governance matter was resolved.',
    'تم حل مسألة حوكمة التقييم.',
  ],
  'evaluation.governance.explain': [
    'An institutional explanation was recorded.',
    'تم تسجيل تفسير مؤسسي.',
  ],
  'evaluation.governance.retain': [
    'An assessment issue was closed with the original retained.',
    'أُغلقت مسألة التقييم مع الإبقاء على الأصل.',
  ],
  'evaluation.governance.feedback': [
    'Assessment feedback was updated for your project.',
    'تم تحديث تعليقات تقييم مشروعك.',
  ],
  'partner.approve': [
    'Your partner eligibility was approved.',
    'اعتُمدت أهلية الشريك لديك.',
  ],
  'partner.reject': [
    'Your partner eligibility was rejected.',
    'رُفضت أهلية الشريك لديك.',
  ],
  'partner.suspend': [
    'Your partner eligibility was suspended.',
    'عُلّقت أهلية الشريك لديك.',
  ],
  'partner.reapprove': [
    'Your partner eligibility was restored.',
    'أُعيد اعتماد أهلية الشريك لديك.',
  ],
  'partner-access.request': [
    'A partner request awaits your lead decision.',
    'طلب شريك ينتظر قرارك بصفتك قائد المشروع.',
  ],
  'partner-access.approve': [
    'Your request was approved for this exact archived edition.',
    'اعتُمد طلبك لهذه النسخة المؤرشفة المحددة.',
  ],
  'partner-access.deny': [
    'Your partner access request was denied.',
    'رُفض طلب وصول الشريك لديك.',
  ],
  'partner-access.revoke': [
    'Your exact-edition access grant was revoked.',
    'أُلغيت منحة وصولك إلى النسخة المحددة.',
  ],
  'partner-access.protective-revoke': [
    'Your access grant was protectively revoked.',
    'أُلغيت منحة وصولك بإجراء وقائي.',
  ],
  'submission.created': [
    'A submitted project awaits your faculty review.',
    'مشروع مُرسل ينتظر مراجعتك الأكاديمية.',
  ],
  'academic.final.requested': [
    'Your supervisor requested final submission. Open your project to prepare the work.',
    'طلب المشرف الإرسال النهائي. افتح مشروعك لإعداد العمل.',
  ],
  'academic.final.accepted': [
    'Your frozen final was admitted for academic assessment.',
    'قُبل الإرسال النهائي المحفوظ للتقييم الأكاديمي.',
  ],
  'academic.final.revision_requested': [
    'Make final changes. Your supervisor recorded a reason; resubmit the same project when ready.',
    'أجرِ التعديلات النهائية. سجّل المشرف السبب؛ أعد إرسال المشروع نفسه عند الجاهزية.',
  ],
  'partner.resubmit': [
    'Your organization response was sent for eligibility review.',
    'أُرسل رد مؤسستك لمراجعة الأهلية.',
  ],
  'review.revision': [
    'A faculty revision was requested for your project.',
    'طُلب تعديل مشروعك بعد المراجعة الأكاديمية.',
  ],
  'review.reject': [
    'Your project was retained internally following faculty review.',
    'احتُفظ بمشروعك داخليًا بعد المراجعة الأكاديمية.',
  ],
  'review.published': [
    'Your approved project edition was published.',
    'نُشرت النسخة المعتمدة من مشروعك.',
  ],
  'assessment.finalized': [
    'An internal assessment was completed.',
    'اكتمل تقييم داخلي.',
  ],
  'evaluation.finalized': [
    'An internal assessment was completed.',
    'اكتمل تقييم داخلي.',
  ],
  'evaluation.draft.saved': [
    'Your private assessment draft was saved.',
    'حُفظت مسودة تقييمك الخاصة.',
  ],
  'checkpoint.sent': [
    'A project checkpoint is ready for supervisor review.',
    'نقطة مراجعة المشروع جاهزة للمشرف.',
  ],
  'checkpoint.changes': [
    'Your supervisor requested changes after a project checkpoint.',
    'طلب المشرف تعديلات بعد نقطة مراجعة المشروع.',
  ],
  'checkpoint.accept': [
    'Your supervisor accepted the project checkpoint.',
    'اعتمد المشرف نقطة مراجعة المشروع.',
  ],
  'core.department.changed': [
    'Department administration changed.',
    'تغيّرت إدارة القسم.',
  ],
  'admin.changed': [
    'An account or institution administration action was recorded.',
    'سُجّل إجراء لإدارة حساب أو مؤسسة.',
  ],
  'auth.password.changed': [
    'Your account password changed.',
    'تغيّرت كلمة مرور حسابك.',
  ],
  'visual.cover.change': [
    'Your project cover image was updated.',
    'حُدثت صورة غلاف مشروعك.',
  ],
  'visual.avatar.change': [
    'Your profile photo was updated.',
    'حُدثت صورة ملفك الشخصي.',
  ],
  'auth.lifecycle.completed': [
    'Your account activation or recovery was completed.',
    'اكتمل تفعيل حسابك أو استعادته.',
  ],
  'assignment.changed': [
    'Your project academic assignment changed.',
    'تغيّر التكليف الأكاديمي لمشروعك.',
  ],
  'admin.csv.imported': [
    'An institutional account import was committed.',
    'اعتُمد استيراد حسابات المؤسسة.',
  ],
  'draft.saved': [
    'Collaborative draft metadata was saved.',
    'حُفظت بيانات المسودة التعاونية.',
  ],
  'file.visibility.changed': [
    'A project file visibility policy changed.',
    'تغيّرت سياسة ظهور ملف في المشروع.',
  ],
  'edition.created': [
    'A successor working edition was created.',
    'أُنشئت نسخة عمل لاحقة.',
  ],
  'external-review.offer': [
    'A neutral academic review offer is available.',
    'يتوفر عرض تقييم أكاديمي محايد.',
  ],
  'external-review.accept': [
    'Your academic review task was accepted.',
    'تم قبول مهمة التقييم الأكاديمي.',
  ],
  'external-review.decline': [
    'Your academic review offer was declined.',
    'تم رفض عرض التقييم الأكاديمي.',
  ],
  'external-review.withdraw': [
    'Your academic review task was withdrawn.',
    'تم الانسحاب من مهمة التقييم الأكاديمي.',
  ],
  'external-review.finalize': [
    'Your independent assessment was finalized.',
    'تم تثبيت تقييمك المستقل.',
  ],
  'external-review.expire': [
    'Your academic review deadline has passed.',
    'انتهت مهلة التقييم الأكاديمي.',
  ],
  'external-review.cancel': [
    'Your academic review task was cancelled.',
    'ألغيت مهمة التقييم الأكاديمي.',
  ],
  'reminder.review-offer': [
    'Reminder: a review offer deadline is approaching.',
    'تذكير: يقترب موعد انتهاء عرض المراجعة.',
  ],
  'reminder.review-task': [
    'Reminder: a review task deadline is approaching.',
    'تذكير: يقترب الموعد النهائي لمهمة المراجعة.',
  ],
  'evaluation.governance.issue': [
    'An assessment review needs institutional attention.',
    'تحتاج مراجعة تقييم إلى إجراء من الجهة المسؤولة.',
  ],
};
export function noticeMessage(type: string, locale: Locale) {
  return (
    notificationMessages[type]?.[locale === 'ar' ? 1 : 0] ??
    (locale === 'ar' ? 'تحديث لسير العمل.' : 'A workflow update was recorded.')
  );
}
export const POLL_MS = 30000;
export const pollDelay = (failures: number) =>
  Math.min(300000, POLL_MS * 2 ** Math.min(Math.max(failures, 0), 4));

export {
  exactAuditMessage as auditActionMessage,
  auditActionPresentation,
  auditPresentation,
} from './audit-presentation.js';
