'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ItemGroup,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  Plus,
  Search,
  FolderKanban,
} from '@capstone/ui/workspace-v2';
import type { GuidedProjectList } from '@capstone/domain';
import { ProjectItem, authorCountText } from '../academic/project-item';
import { t, ProjectState, type Locale } from './common';
export function ProjectIndex({
  locale,
  institution,
  list,
  query,
  selected,
}: {
  locale: Locale;
  institution: string;
  list: GuidedProjectList;
  query: Record<string, string>;
  selected?: string | undefined;
}) {
  const path = '/' + locale + '/admin/university',
    copy = (en: string, ar: string) => t(locale, en, ar),
    filtered = Object.entries(query).some(([k, v]) => k !== 'page' && !!v),
    params = new URLSearchParams(query);
  useEffect(() => {
    if (selected && list.rows.some((x) => x.id === selected)) {
      const el = document.getElementById('project-item-' + selected);
      el?.querySelector<HTMLAnchorElement>('.af-project-title')?.focus({
        preventScroll: true,
      });
      el?.scrollIntoView({ block: 'center' });
    }
  }, [selected, list.rows]);
  const pageHref = (n: number) => {
    const p = new URLSearchParams(query);
    p.set('page', String(n));
    return path + '?' + p;
  };
  const href = (id: string) => {
    const p = new URLSearchParams(params);
    p.set('selected', id);
    return (
      path + '/projects/' + id + '?from=' + encodeURIComponent(path + '?' + p)
    );
  };
  const filter = (
    name: string,
    label: string,
    items: { value: string; label: string }[],
  ) => (
    <Select
      value={query[name] || 'all'}
      onValueChange={(v) => {
        const form = document.getElementById(
          'po-project-search',
        ) as HTMLFormElement | null;
        if (form) {
          const hidden = form.querySelector<HTMLInputElement>(
            'input[name="' + name + '"]',
          );
          if (hidden) hidden.value = v === 'all' ? '' : v;
          form.requestSubmit();
        }
      }}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="wsv2">
        <SelectItem value="all">{label}</SelectItem>
        {items.map((x) => (
          <SelectItem key={x.value} value={x.value}>
            {x.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <section
      className="po-page"
      data-template="projects-index"
      data-locale={locale}
    >
      <header className="po-index-heading">
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <h1 dir="auto">{copy('Projects', 'المشاريع')}</h1>
          <p dir="auto">
            <bdi dir="auto">{institution}</bdi> ·{' '}
            {copy(
              'Set up a private project and its academic team.',
              'أنشئ مشروعًا خاصًا وفريقه الأكاديمي.',
            )}
          </p>
        </div>
        <Button asChild>
          <Link
            href={
              path +
              '/projects/new?from=' +
              encodeURIComponent(path + (params.size ? '?' + params : ''))
            }
          >
            <Plus />
            {copy('New project', 'مشروع جديد')}
          </Link>
        </Button>
      </header>
      <form
        key={params.toString()}
        id="po-project-search"
        action={path}
        className="po-project-filters"
      >
        <div className="po-search">
          <Search />
          <Input
            name="q"
            aria-label={copy('Search projects', 'بحث المشاريع')}
            defaultValue={query['q'] ?? ''}
            maxLength={200}
          />
          <Button type="submit" variant="ghost">
            {copy('Search', 'بحث')}
          </Button>
        </div>
        <input
          type="hidden"
          name="status"
          defaultValue={query['status'] ?? ''}
        />
        {filter(
          'status',
          copy('All statuses', 'كل الحالات'),
          [
            'draft',
            'pending_review',
            'revision_required',
            'archived',
            'rejected',
          ].map((s) => ({
            value: s,
            label: t(
              locale,
              (
                {
                  draft: 'Private draft',
                  pending_review: 'Submitted for review',
                  revision_required: 'Changes requested',
                  archived: 'Archived',
                  rejected: 'Retained internally',
                } as Record<string, string>
              )[s]!,
              (
                {
                  draft: 'مسودة خاصة',
                  pending_review: 'مقدم للمراجعة',
                  revision_required: 'طُلبت تعديلات',
                  archived: 'مؤرشف',
                  rejected: 'محفوظ داخليًا',
                } as Record<string, string>
              )[s]!,
            ),
          })),
        )}
        {list.departments.length > 1 && (
          <>
            <input
              type="hidden"
              name="department"
              defaultValue={query['department'] ?? ''}
            />
            {filter(
              'department',
              copy('All departments', 'كل الأقسام'),
              list.departments.map((x) => ({ value: x, label: x })),
            )}
          </>
        )}
        {list.years.length > 1 && (
          <>
            <input
              type="hidden"
              name="year"
              defaultValue={query['year'] ?? ''}
            />
            {filter(
              'year',
              copy('All academic years', 'كل السنوات الأكاديمية'),
              list.years.map((x) => ({ value: x, label: x })),
            )}
          </>
        )}
        {filtered && (
          <Button asChild variant="outline">
            <Link href={path}>{copy('Clear filters', 'مسح المرشحات')}</Link>
          </Button>
        )}
      </form>
      <div className="po-list-count">
        <strong>
          {copy(
            `${list.total} ${list.total === 1 ? 'project' : 'projects'}`,
            `${list.total} مشروعًا`,
          )}
        </strong>
        {list.total > 0 && (
          <span dir="ltr">
            {copy(
              `Showing ${(list.page - 1) * 20 + 1}–${Math.min(list.page * 20, list.total)}`,
              `عرض ${(list.page - 1) * 20 + 1}–${Math.min(list.page * 20, list.total)}`,
            )}
          </span>
        )}
      </div>
      {list.rows.length === 0 ? (
        <Empty className="po-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderKanban />
            </EmptyMedia>
            <EmptyTitle>
              {filtered
                ? copy('No matching projects', 'لا توجد مشاريع مطابقة')
                : copy('No assigned projects yet', 'لا توجد مشاريع مسندة بعد')}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? copy(
                    'Try another title or clear the filters.',
                    'جرّب عنوانًا آخر أو امسح المرشحات.',
                  )
                : copy(
                    'Use New project to create a private draft with a supervisor and student team.',
                    'استخدم مشروع جديد لإنشاء مسودة خاصة مع مشرف وفريق طلاب.',
                  )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="af-project-items af-admin-projects">
          {list.rows.map((x) => (
            <ProjectItem
              key={x.id}
              id={x.id}
              state={x.status}
              title={x.title || copy('Untitled project', 'مشروع دون عنوان')}
              openHref={href(x.id)}
              context={
                <>
                  <bdi dir="ltr">
                    {x.department} · {x.year}
                  </bdi>
                  <span>
                    {copy('Supervisor', 'المشرف')}:{' '}
                    <bdi dir="auto">{x.supervisor}</bdi> ·{' '}
                    {authorCountText(locale, x.authorCount)}
                  </span>
                </>
              }
              status={<ProjectState locale={locale} state={x.status} />}
              action={
                x.canManage
                  ? {
                      href: href(x.id) + '&manage=team',
                      label: copy('Manage team', 'إدارة الفريق'),
                    }
                  : undefined
              }
            />
          ))}
        </ItemGroup>
      )}
      {list.total > 20 && (
        <nav
          className="po-pagination"
          aria-label={copy('Projects pagination', 'صفحات المشاريع')}
        >
          {list.page === 1 ? (
            <Button variant="outline" disabled>
              {copy('Previous', 'السابق')}
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={pageHref(list.page - 1)}>
                {copy('Previous', 'السابق')}
              </Link>
            </Button>
          )}
          <span dir="ltr">
            {list.page} / {Math.ceil(list.total / 20)}
          </span>
          {list.page * 20 >= list.total ? (
            <Button variant="outline" disabled>
              {copy('Next', 'التالي')}
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={pageHref(list.page + 1)}>
                {copy('Next', 'التالي')}
              </Link>
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}
