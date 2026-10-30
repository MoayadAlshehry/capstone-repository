'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import {
  Button,
  Input,
  Search,
  ItemGroup,
  Badge,
} from '@capstone/ui/workspace-v2';
import type { SemesterCollection } from '@capstone/domain';
import { ProjectItem, authorCountText } from '../academic/project-item';
import { StateBadge, date, t, type Locale } from './common';
type Row = SemesterCollection['items'][number];
function category(x: Row, faculty: boolean) {
  const s = x.workflow?.stage;
  if (
    ['published', 'retained'].includes(s ?? '') ||
    ['archived', 'retained'].includes(x.lifecycle)
  )
    return 'completed';
  if (
    [
      'final_screening',
      'supervisor_assessment',
      'committee_consensus',
      'faculty_decision',
    ].includes(s ?? '')
  )
    return faculty ? 'attention' : 'waiting';
  if (
    ['final_requested', 'returned'].includes(s ?? '') ||
    x.lifecycle === 'changes_requested'
  )
    return faculty ? 'progress' : 'attention';
  if (x.lifecycle === 'awaiting_review')
    return faculty ? 'attention' : 'waiting';
  return 'progress';
}
export function SemesterProjects({
  locale,
  data,
  faculty,
  queue,
  query,
  assignedCount,
}: {
  locale: Locale;
  data: SemesterCollection;
  faculty: boolean;
  queue: boolean;
  query: Record<string, string | string[] | undefined>;
  assignedCount?: number;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    q = typeof query.q === 'string' ? query.q : '',
    filter = typeof query.filter === 'string' ? query.filter : 'all',
    base = faculty ? (queue ? '/reviews' : '/supervision') : '/projects',
    url = '/' + locale + base;
  const labels: Record<string, string> = {
    all: copy('All projects', 'كل المشاريع'),
    attention: copy('Needs my attention', 'تحتاج اهتمامي'),
    progress: copy('In progress', 'قيد العمل'),
    waiting: copy('Awaiting supervisor', 'بانتظار المشرف'),
    completed: copy('Completed', 'مكتمل'),
    final_screening: copy('Final reviews', 'مراجعات نهائية'),
    supervisor_assessment: copy('Supervisor assessments', 'تقييمات المشرف'),
    committee_consensus: copy('Committee assessments', 'تقييمات اللجنة'),
    faculty_decision: copy('Publication decisions', 'قرارات النشر'),
    checkpoint: copy('Checkpoints', 'نقاط المراجعة'),
  };
  const status = (x: Row) =>
    x.workflow?.stage === 'preparing'
      ? null
      : (
          {
            final_requested: copy(
              'Final submission requested',
              'طُلب الإرسال النهائي',
            ),
            final_screening: copy(
              'Awaiting final review',
              'بانتظار المراجعة النهائية',
            ),
            returned: copy('Returned for changes', 'أعيد للتعديل'),
            supervisor_assessment: copy(
              'Supervisor assessment',
              'تقييم المشرف',
            ),
            committee_consensus: copy(
              'Committee assessments',
              'تقييمات اللجنة',
            ),
            faculty_decision: copy('Publication decision', 'قرار النشر'),
            published: copy('Published archive', 'أرشيف منشور'),
            retained: copy('Retained internally', 'محفوظ داخليًا'),
          } as Record<string, string>
        )[x.workflow?.stage ?? ''];
  const task = (x: Row): { href: string; label: string } | undefined => {
    const s = x.workflow?.stage;
    if (faculty) {
      if (s === 'final_screening' && x.final)
        return {
          href: '/supervision/finals/' + x.final + '/screening',
          label:
            (x.workflow?.finalNumber ?? 1) > 1
              ? copy('Review revised final', 'راجع الإرسال النهائي المعدّل')
              : copy('Review final', 'راجع الإرسال النهائي'),
        };
      if (
        [
          'supervisor_assessment',
          'committee_consensus',
          'faculty_decision',
        ].includes(s ?? '') &&
        x.final
      )
        return {
          href:
            '/supervision/finals/' +
            x.final +
            '/' +
            (s === 'supervisor_assessment'
              ? 'assessment'
              : s === 'committee_consensus'
                ? 'committee'
                : 'decision'),
          label:
            s === 'supervisor_assessment'
              ? copy('Assess final', 'قيّم الإرسال النهائي')
              : s === 'committee_consensus'
                ? copy('Manage committee invitations', 'إدارة دعوات اللجنة')
                : copy('Decide publication', 'قرر النشر'),
        };
      if (x.lifecycle === 'awaiting_review' && x.checkpoint)
        return {
          href: '/supervision/rounds/' + x.checkpoint,
          label: copy('Review checkpoint', 'راجع نقطة المراجعة'),
        };
      if (category(x, true) === 'completed' && x.final)
        return {
          href: '/submissions/' + x.final,
          label: copy('Read final record', 'اقرأ السجل النهائي'),
        };
      if (x.workflow?.canRequest)
        return {
          href: '/supervision/projects/' + x.id,
          label: copy('Request final submission', 'اطلب الإرسال النهائي'),
        };
      return undefined;
    }
    if (s === 'returned')
      return {
        href: '/projects/' + x.id,
        label: copy('Make final changes', 'أجرِ التعديلات النهائية'),
      };
    if (
      s === 'final_requested' &&
      x.workflow?.requestValid &&
      x.role === 'lead'
    )
      return {
        href: '/projects/' + x.id + '/final',
        label: copy('Prepare final', 'جهّز الإرسال النهائي'),
      };
    if (
      [
        'final_screening',
        'supervisor_assessment',
        'committee_consensus',
        'faculty_decision',
        'published',
        'retained',
      ].includes(s ?? '') &&
      x.final
    )
      return {
        href: '/submissions/' + x.final,
        label:
          category(x, false) === 'completed'
            ? copy('Read final record', 'اقرأ السجل النهائي')
            : copy('View submission status', 'عرض حالة الإرسال'),
      };
    if (x.lifecycle === 'changes_requested')
      return {
        href: '/projects/' + x.id + '/reviews',
        label: copy('Read supervisor feedback', 'اقرأ ملاحظات المشرف'),
      };
    return undefined;
  };
  const items = [...data.items]
    .filter(
      (x) =>
        (x.title + ' ' + x.department + ' ' + x.year + ' ' + x.lead)
          .toLocaleLowerCase()
          .includes(q.toLocaleLowerCase()) &&
        (filter === 'all' ||
          category(x, faculty) === filter ||
          x.workflow?.stage === filter ||
          (filter === 'checkpoint' && x.lifecycle === 'awaiting_review')),
    )
    .sort((a, b) => {
      const priority = (x: Row) =>
        category(x, faculty) === 'attention'
          ? 0
          : category(x, faculty) === 'completed'
            ? 3
            : 1;
      return (
        priority(a) - priority(b) ||
        (queue
          ? Date.parse(
              a.workflow?.waitingSince ??
                a.finalSubmittedAt ??
                a.submittedAt ??
                a.updatedAt,
            ) -
            Date.parse(
              b.workflow?.waitingSince ??
                b.finalSubmittedAt ??
                b.submittedAt ??
                b.updatedAt,
            )
          : 0) ||
        a.title.localeCompare(b.title, locale) ||
        a.id.localeCompare(b.id)
      );
    });
  const page = Math.min(
      Math.max(
        1,
        Math.floor(
          Number(typeof query.page === 'string' ? query.page : 1) || 1,
        ),
      ),
      Math.max(1, Math.ceil(items.length / 20)),
    ),
    rows = items.slice((page - 1) * 20, page * 20),
    filters = queue
      ? [
          'all',
          'final_screening',
          'supervisor_assessment',
          'committee_consensus',
          'faculty_decision',
          'checkpoint',
        ]
      : ['all', 'attention', 'progress', 'waiting', 'completed'];
  useEffect(() => {
    if (typeof query.selected === 'string')
      document
        .getElementById('project-item-' + query.selected)
        ?.querySelector<HTMLAnchorElement>('.af-project-title')
        ?.focus({ preventScroll: true });
  }, [query.selected]);
  return (
    <section
      className={
        'ss-page af-project-collection ' +
        (faculty
          ? queue
            ? 'af-review-queue'
            : 'af-faculty-roster'
          : 'af-student-projects')
      }
      data-template={
        faculty
          ? queue
            ? 'supervisor-queue'
            : 'faculty-projects'
          : 'projects-list'
      }
      data-locale={locale}
    >
      <header className="ss-heading">
        <div>
          <p dir="auto" className="ac-eyebrow">
            {faculty
              ? copy('Academic supervision', 'الإشراف الأكاديمي')
              : copy('Your academic work', 'عملك الأكاديمي')}
          </p>
          <h1 dir="auto">
            {faculty
              ? queue
                ? copy('Needs review', 'تحتاج مراجعة')
                : copy('Assigned projects', 'المشاريع المسندة')
              : copy('My projects', 'مشاريعي')}
          </h1>
          <p dir="auto">
            {faculty
              ? queue
                ? copy(
                    'Submitted work waiting for your action. Open a project for its full context.',
                    'عمل مرسل ينتظر إجراءك. افتح المشروع لعرض سياقه الكامل.',
                  )
                : copy(
                    'Your current projects and teams. Review tasks have their own queue.',
                    'مشاريعك الحالية وفرقها. لمهام المراجعة قائمة مستقلة.',
                  )
              : queue && (assignedCount ?? 0) > 0
                ? copy(
                    'Your assigned projects have no submissions waiting for review.',
                    'لا توجد إرسالات بانتظار المراجعة في مشاريعك المسندة.',
                  )
                : copy(
                    'Open your project, see the next step and follow supervisor feedback.',
                    'افتح مشروعك واطّلع على الخطوة التالية وملاحظات المشرف.',
                  )}
          </p>
        </div>
        {faculty && (
          <Button asChild variant="outline">
            <Link href={'/' + locale + (queue ? '/supervision' : '/reviews')}>
              {queue
                ? copy('Assigned projects', 'المشاريع المسندة')
                : copy('Needs review', 'تحتاج مراجعة')}
            </Link>
          </Button>
        )}
      </header>
      <form action={url} className="ss-search">
        <Search />
        <Input
          type="search"
          name="q"
          defaultValue={q}
          aria-label={copy('Search projects', 'ابحث عن المشاريع')}
          placeholder={copy(
            'Search project or team lead',
            'ابحث عن مشروع أو قائد الفريق',
          )}
        />
        <input type="hidden" name="filter" value={filter} />
        <Button variant="outline">{copy('Search', 'بحث')}</Button>
      </form>
      <nav
        className="af-list-filters"
        aria-label={copy('Project filters', 'تصفية المشاريع')}
      >
        {filters
          .filter(
            (k) =>
              k === 'all' ||
              data.items.some(
                (x) =>
                  category(x, faculty) === k ||
                  x.workflow?.stage === k ||
                  (k === 'checkpoint' && x.lifecycle === 'awaiting_review'),
              ),
          )
          .map((k) => (
            <Button
              asChild
              variant={filter === k ? 'secondary' : 'ghost'}
              key={k}
            >
              <Link
                href={url + '?' + new URLSearchParams({ q, filter: k })}
                aria-current={filter === k ? 'page' : undefined}
              >
                {labels[k]}
              </Link>
            </Button>
          ))}
      </nav>
      <p dir="auto" className="ss-list-count">
        {items.length}{' '}
        {copy(
          queue
            ? items.length === 1
              ? 'review task'
              : 'review tasks'
            : items.length === 1
              ? 'project'
              : 'projects',
          queue ? 'مهام مراجعة' : 'مشاريع',
        )}
      </p>
      <ItemGroup
        className="af-project-items"
        role={rows.length ? 'list' : undefined}
      >
        {rows.map((x) => {
          const from =
              url +
              '?' +
              new URLSearchParams({
                q,
                filter,
                page: String(page),
                selected: x.id,
              }),
            append = (path: string) =>
              '/' + locale + path + '?from=' + encodeURIComponent(from),
            action = task(x),
            feedback =
              x.workflow?.screening?.outcome === 'returned'
                ? x.workflow.screening.reason
                : x.feedback;
          return (
            <ProjectItem
              key={x.id}
              id={x.id}
              state={x.workflow?.stage ?? x.lifecycle}
              title={x.title || copy('Untitled project', 'مشروع دون عنوان')}
              openHref={append(
                (faculty ? '/supervision/projects/' : '/projects/') + x.id,
              )}
              context={
                <>
                  <bdi dir="ltr">
                    {x.department} · {x.year}
                  </bdi>
                  {faculty ? (
                    <span>
                      {queue
                        ? copy('Submitted by', 'أرسله')
                        : copy('Team lead', 'قائد الفريق')}
                      :{' '}
                      <bdi dir="auto">
                        {queue ? (x.submitter ?? x.lead) : x.lead}
                      </bdi>{' '}
                      · {authorCountText(locale, x.authorCount ?? 0)}
                    </span>
                  ) : (
                    <span>
                      {copy(
                        x.role === 'lead' ? 'Lead' : 'Author',
                        x.role === 'lead' ? 'قائد' : 'مؤلف',
                      )}
                    </span>
                  )}
                </>
              }
              status={
                status(x) ? (
                  <Badge variant="outline">{status(x)}</Badge>
                ) : (
                  <StateBadge locale={locale} state={x.lifecycle} />
                )
              }
              action={
                action
                  ? { href: append(action.href), label: action.label }
                  : undefined
              }
            >
              {queue ? (
                <p dir="auto" className="af-waiting">
                  {copy('Waiting since', 'ينتظر منذ')} ·{' '}
                  {date(
                    locale,
                    x.workflow?.waitingSince ??
                      x.finalSubmittedAt ??
                      x.submittedAt ??
                      x.updatedAt,
                  )}
                </p>
              ) : !faculty && feedback ? (
                <p dir="auto" className="af-feedback-excerpt">
                  <span>{copy('Supervisor feedback', 'ملاحظات المشرف')}</span>
                  <bdi dir="auto">{feedback}</bdi>
                </p>
              ) : null}
            </ProjectItem>
          );
        })}
      </ItemGroup>
      {!rows.length && (
        <div className="ss-empty">
          <h2 dir="auto">
            {q || filter !== 'all'
              ? copy('No matching projects', 'لا توجد مشاريع مطابقة')
              : queue && (assignedCount ?? 0) > 0
                ? copy('No work needs your review', 'لا يوجد عمل يحتاج مراجعتك')
                : copy('No assigned projects yet', 'لا توجد مشاريع مسندة بعد')}
          </h2>
          <p dir="auto">
            {q || filter !== 'all'
              ? copy(
                  'Clear the filters to see the full authorized list.',
                  'امسح التصفية لعرض القائمة المصرح بها.',
                )
              : copy(
                  'Assigned projects appear here when your university adds you to a team.',
                  'تظهر المشاريع المسندة هنا عندما تضيفك الجامعة إلى فريق.',
                )}
          </p>
          {(q || filter !== 'all' || (queue && (assignedCount ?? 0) > 0)) && (
            <Button asChild variant="outline">
              <Link
                href={
                  q || filter !== 'all'
                    ? url
                    : '/' + locale + (faculty ? '/supervision' : '/projects')
                }
              >
                {q || filter !== 'all'
                  ? copy('Clear filters', 'امسح التصفية')
                  : copy('View assigned projects', 'عرض المشاريع المسندة')}
              </Link>
            </Button>
          )}
        </div>
      )}
      {items.length > 20 && (
        <nav
          className="af-pagination"
          aria-label={copy('Project pages', 'صفحات المشاريع')}
        >
          {[page - 1, page + 1]
            .filter((n) => n > 0 && n <= Math.ceil(items.length / 20))
            .map((n) => (
              <Button asChild key={n} variant="outline">
                <Link
                  href={
                    url +
                    '?' +
                    new URLSearchParams({ q, filter, page: String(n) })
                  }
                >
                  {n < page
                    ? copy('Previous', 'السابق')
                    : copy('Next', 'التالي')}
                </Link>
              </Button>
            ))}
        </nav>
      )}
    </section>
  );
}
