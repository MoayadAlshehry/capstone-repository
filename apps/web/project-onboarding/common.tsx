'use client';
import type { ReactNode } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Clock3,
  CircleCheck,
} from '@capstone/ui/workspace-v2';
export type Locale = 'en' | 'ar';
export const t = (l: Locale, en: string, ar: string) => (l === 'ar' ? ar : en);
export function ProjectCard({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={'po-card ' + className}>
      <CardHeader>
        <CardTitle>
          <h2 dir="auto">{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export function ProjectState({
  locale,
  state,
}: {
  locale: Locale;
  state: string;
}) {
  const label: Record<string, [string, string]> = {
    draft: ['Private draft', 'مسودة خاصة'],
    pending_review: ['Submitted for review', 'مقدم للمراجعة'],
    revision_required: ['Changes requested', 'طُلبت تعديلات'],
    archived: ['Archived', 'مؤرشف'],
    rejected: ['Retained internally', 'محفوظ داخليًا'],
  };
  return (
    <Badge variant="outline" className="po-state" data-ws-state={state}>
      {state === 'archived' ? <CircleCheck /> : <Clock3 />}
      {label[state]?.[locale === 'ar' ? 1 : 0] ??
        t(locale, 'State unavailable', 'الحالة غير متاحة')}
    </Badge>
  );
}
export function IdentityState({
  locale,
  state,
}: {
  locale: Locale;
  state: string;
}) {
  const labels: Record<string, [string, string]> = {
    'new-invitation': [
      'Will receive account setup invitation',
      'سيتلقى دعوة إعداد الحساب',
    ],
    'existing-active': [
      'Existing account in this university',
      'حساب حالي في هذه الجامعة',
    ],
    'existing-invitation': [
      'Existing account · setup pending',
      'حساب حالي · الإعداد مطلوب',
    ],
  };
  return (
    <Badge variant="outline">
      {labels[state]?.[locale === 'ar' ? 1 : 0] ??
        t(locale, 'Check identity', 'تحقق من الهوية')}
    </Badge>
  );
}
export function projectError(l: Locale, code: string) {
  return code === 'FORBIDDEN'
    ? t(
        l,
        'Your current account or institution can no longer perform this task. Sign in again to check access.',
        'لم يعد الحساب أو المؤسسة الحالية مؤهلين لهذه المهمة. سجل الدخول مجددًا للتحقق من الوصول.',
      )
    : code === 'IDENTITY_OR_STATE_CHANGED'
      ? t(
          l,
          'An identity, department or record has changed, or an address is incompatible. Verify the people and current project before trying again. No identity was transferred or changed.',
          'تغيرت الهوية أو القسم أو السجل، أو أن العنوان غير متوافق. تحقق من الأشخاص والمشروع الحالي قبل المحاولة مجددًا. لم تُنقل هوية أو تُعدّل.',
        )
      : code === 'FROZEN_TEAM'
        ? t(
            l,
            'Submitted authorship is frozen. Keep the recorded authors and order; choose an active lead and eligible existing supervisor.',
            'ثبتت أسماء المؤلفين وترتيبهم بعد التقديم. احتفظ بالسجل واختر قائدًا نشطًا ومشرفًا حاليًا مؤهلًا.',
          )
        : t(
            l,
            'Check the highlighted details. Your entered information is kept.',
            'تحقق من التفاصيل المحددة. تبقى المعلومات المدخلة محفوظة.',
          );
}
