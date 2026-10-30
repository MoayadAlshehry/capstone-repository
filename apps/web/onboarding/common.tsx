'use client';
import Link from 'next/link';
import { date } from '../semester/common';
import {
  Button,
  Badge,
  ArrowLeft,
  CircleCheck,
  Clock3,
  CirclePause,
} from '@capstone/ui/workspace-v2';
export type Locale = 'en' | 'ar';
export const tr = (l: Locale, en: string, ar: string) => (l === 'ar' ? ar : en);
export const stateName = (l: Locale, s: string) =>
  (
    ({
      active: ['Active', 'نشط'],
      inactive: ['Awaiting setup', 'بانتظار الإعداد'],
      suspended: ['Suspended', 'موقوف'],
      pending: ['Pending review', 'بانتظار المراجعة'],
      approved: ['Approved', 'معتمد'],
      rejected: ['Not approved', 'غير معتمد'],
    }) as Record<string, string[]>
  )[s]?.[l === 'ar' ? 1 : 0] ?? tr(l, 'State unavailable', 'الحالة غير متاحة');
export function StateBadge({
  locale,
  state,
}: {
  locale: Locale;
  state: string;
}) {
  const Icon = ['active', 'approved'].includes(state)
    ? CircleCheck
    : state === 'suspended'
      ? CirclePause
      : Clock3;
  return (
    <Badge variant="outline" className="on-state" data-ws-state={state}>
      <Icon />
      {stateName(locale, state)}
    </Badge>
  );
}
export const roleName = (l: Locale, r: string) =>
  r === 'university_admin'
    ? tr(l, 'University administrator', 'مدير الجامعة')
    : r === 'student'
      ? tr(l, 'Student', 'طالب')
      : tr(l, 'Faculty supervisor', 'عضو هيئة تدريس / مشرف');
export function TaskHeader({
  locale,
  title,
  description,
  back,
  action,
}: {
  locale: Locale;
  title: string;
  description: string;
  back?: { href: string; label: string };
  action?: { href: string; label: string };
}) {
  return (
    <>
      <div className="on-back-row">
        {back && (
          <Link className="as-back" href={back.href}>
            <ArrowLeft />
            {back.label}
          </Link>
        )}
      </div>
      <header className="on-heading">
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <h1 dir="auto">{title}</h1>
          <p dir="auto">{description}</p>
        </div>
        {action && (
          <Button asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        )}
      </header>
    </>
  );
}
export function ReadUnavailable({ locale }: { locale: Locale }) {
  return (
    <section className="on-page">
      <TaskHeader
        locale={locale}
        title={tr(locale, 'Unable to load this record', 'تعذر تحميل السجل')}
        description={tr(
          locale,
          'The authorized read could not finish. Your records remain unchanged.',
          'تعذر إكمال القراءة المصرح بها. تبقى سجلاتك دون تغيير.',
        )}
      />
      <Button
        className="on-read-retry"
        variant="outline"
        onClick={() => window.location.reload()}
      >
        {tr(locale, 'Retry', 'إعادة المحاولة')}
      </Button>
    </section>
  );
}
export function friendlyDate(l: Locale, s: string) {
  return date(l, s);
}
