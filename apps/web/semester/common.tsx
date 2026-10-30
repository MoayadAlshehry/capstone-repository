import type { ReactNode } from 'react';
import type { CheckpointRound } from '@capstone/domain';
export type FrozenRecord = Omit<
  CheckpointRound,
  'purpose' | 'contract' | 'state'
> & { purpose: 'CHECKPOINT' | 'FINAL'; contract: string; state: string };
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Clock3,
  CircleCheck,
  CircleAlert,
} from '@capstone/ui/workspace-v2';
export type Locale = 'en' | 'ar';
export const t = (l: Locale, en: string, ar: string) => (l === 'ar' ? ar : en);
export const date = (l: Locale, value: string) => {
  try {
    return (
      new Intl.DateTimeFormat(l === 'ar' ? 'ar' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Riyadh',
      }).format(new Date(value)) + ' · UTC+3'
    );
  } catch {
    return t(l, 'Time unavailable', 'الوقت غير متاح');
  }
};
export const size = (bytes: number) =>
  bytes >= 1000000000
    ? `${(bytes / 1000000000).toLocaleString('en', { maximumFractionDigits: 1 })} GB`
    : bytes >= 1000000
      ? `${(bytes / 1000000).toLocaleString('en', { maximumFractionDigits: 1 })} MB`
      : `${(bytes / 1000).toLocaleString('en', { maximumFractionDigits: 1 })} KB`;
export function StudioCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={'ss-card ' + className}>
      <CardHeader>
        <CardTitle>
          <h2 dir="auto">{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export function StateBadge({
  locale,
  state,
}: {
  locale: Locale;
  state: string;
}) {
  const labels: Record<string, [string, string]> = {
    in_progress: ['Draft', 'مسودة'],
    draft: ['Draft', 'مسودة'],
    revision_required: ['Changes requested', 'طُلبت تعديلات'],
    awaiting_review: ['Waiting for supervisor', 'بانتظار المشرف'],
    changes_requested: ['Changes requested', 'طُلبت تعديلات'],
    accepted: [
      'Checkpoint accepted · in progress',
      'قُبلت نقطة المراجعة · قيد العمل',
    ],
    archived: ['Archived · read only', 'مؤرشف · للقراءة فقط'],
    retained: [
      'Retained internally · read only',
      'محفوظ داخليًا · للقراءة فقط',
    ],
    rejected: [
      'Retained internally · read only',
      'محفوظ داخليًا · للقراءة فقط',
    ],
    pending_review: ['Awaiting supervisor review', 'بانتظار مراجعة المشرف'],
    final_revision: ['Final revision requested', 'طُلب تعديل نهائي'],
    final_pending: ['Final review · read only', 'مراجعة نهائية · للقراءة فقط'],
  };
  return (
    <Badge className="ss-state" variant="outline" data-ws-state={state}>
      {state === 'awaiting_review' ? (
        <Clock3 />
      ) : state === 'changes_requested' ? (
        <CircleAlert />
      ) : (
        <CircleCheck />
      )}
      {labels[state]?.[locale === 'ar' ? 1 : 0] ??
        t(locale, 'State unavailable', 'الحالة غير متاحة')}
    </Badge>
  );
}
export function Notice({
  locale,
  title,
  children,
  error = false,
}: {
  locale: Locale;
  title: string;
  children?: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={'ss-notice ' + (error ? 'ss-notice-error' : '')}
      role={error ? 'alert' : 'status'}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}
export const issueText = (l: Locale, key: string) => {
  const map: Record<string, [string, string]> = {
    TITLE_REQUIRED: ['Add a project title.', 'أضف عنوانًا للمشروع.'],
    FILES_REQUIRED: [
      'Upload at least one validated file.',
      'ارفع ملفًا واحدًا مقبولًا على الأقل.',
    ],
    ACTIVE_UPLOAD: [
      'Finish or cancel active uploads before sending.',
      'أكمل الرفع الجاري أو ألغِه قبل الإرسال.',
    ],
    TEAM_INACTIVE: [
      'Every assigned author needs an active account.',
      'يحتاج كل مؤلف معيّن إلى حساب نشط.',
    ],
    SUPERVISOR_INACTIVE: [
      'The assigned supervisor needs an active account.',
      'يحتاج المشرف المعيّن إلى حساب نشط.',
    ],
    FILES_NOT_READY: [
      'A file is not ready. Review the Files task.',
      'يوجد ملف غير جاهز. راجع مهمة الملفات.',
    ],
    QUOTA: [
      'Project storage is at its permitted limit.',
      'بلغ تخزين المشروع الحد المسموح.',
    ],
    WORKING_LOCKED: [
      'This edition is currently read only.',
      'هذا العمل المرسل للقراءة فقط حاليًا.',
    ],
    INVALID_DRAFT: [
      'Review the saved project details.',
      'راجع تفاصيل المشروع المحفوظة.',
    ],
  };
  return (
    map[key]?.[l === 'ar' ? 1 : 0] ??
    t(
      l,
      'Review the current project before continuing.',
      'راجع المشروع الحالي قبل المتابعة.',
    )
  );
};
