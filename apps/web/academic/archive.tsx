'use client';
import Link from 'next/link';
import type { ArchiveItem } from '@capstone/domain';
import { Button, Input, Search, Badge } from '@capstone/ui/workspace-v2';
import { t, date, type Locale } from '../semester/common';
export function InstitutionArchive({
  locale,
  items,
  query,
}: {
  locale: Locale;
  items: (ArchiveItem & { department: string; year: string })[];
  query: Record<string, string | string[] | undefined>;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    q = typeof query.q === 'string' ? query.q : '',
    filter = typeof query.filter === 'string' ? query.filter : 'all',
    base = '/' + locale + '/admin/university/archive';
  const rows = [...items]
    .filter(
      (x) =>
        (filter === 'all' ||
          (filter === 'published'
            ? x.state === 'archived'
            : x.state === 'rejected')) &&
        (x.title + ' ' + x.supervisor + ' ' + x.department + ' ' + x.year)
          .toLocaleLowerCase()
          .includes(q.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        b.decisionAt.localeCompare(a.decisionAt) ||
        a.submission.localeCompare(b.submission),
    );
  return (
    <section
      className="ss-page ac-page"
      data-template="institution-archive"
      data-locale={locale}
    >
      <header className="ss-heading">
        <div>
          <p dir="auto" className="ac-eyebrow">
            {copy('University research records', 'سجلات أبحاث الجامعة')}
          </p>
          <h1 dir="auto">{copy('Institution archive', 'أرشيف الجامعة')}</h1>
          <p dir="auto">
            {copy(
              'Read-only final records from your institution. Published and internally retained outcomes stay distinct.',
              'سجلات نهائية للقراءة فقط من جامعتك. تبقى النتائج المنشورة والمحفوظة داخليًا متميزة.',
            )}
          </p>
        </div>
      </header>
      <form className="ss-search" action={base}>
        <Search />
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={copy(
            'Search project or supervisor',
            'ابحث عن مشروع أو مشرف',
          )}
          aria-label={copy('Search archive', 'البحث في الأرشيف')}
        />
        <input type="hidden" name="filter" value={filter} />
        <Button variant="outline">{copy('Search', 'بحث')}</Button>
      </form>
      <nav
        className="ac-collection-filters"
        aria-label={copy('Archive status', 'حالة الأرشيف')}
      >
        {(['all', 'published', 'retained'] as const).map((x, i) => (
          <Button
            asChild
            key={x}
            variant={filter === x ? 'secondary' : 'ghost'}
          >
            <Link
              aria-current={filter === x ? 'page' : undefined}
              href={base + '?' + new URLSearchParams({ q, filter: x })}
            >
              {
                [
                  copy('All', 'الكل'),
                  copy('Published', 'منشور'),
                  copy('Retained internally', 'محفوظ داخليًا'),
                ][i]
              }{' '}
              <span dir="ltr">
                {
                  items.filter(
                    (a) =>
                      x === 'all' ||
                      (x === 'published'
                        ? a.state === 'archived'
                        : a.state === 'rejected'),
                  ).length
                }
              </span>
            </Link>
          </Button>
        ))}
      </nav>
      <p dir="auto" className="ss-list-count">
        {rows.length}{' '}
        {copy(
          `${rows.length === 1 ? 'record' : 'records'} · Newest decision first`,
          `${rows.length === 1 ? 'سجل' : rows.length === 2 ? 'سجلان' : 'سجلات'} · أحدث قرار أولًا`,
        )}
      </p>
      <div className="ac-archive-list">
        {rows.map((x) => (
          <article key={x.submission}>
            <div>
              <h2 dir="auto">{x.title}</h2>
              <p dir="auto">
                <bdi dir="ltr">
                  {x.department} · {x.year}
                </bdi>{' '}
                · {date(locale, x.decisionAt)}
              </p>
              <p dir="auto">
                {copy('Assigned supervisor', 'المشرف المعيّن')}:{' '}
                <bdi dir="auto">{x.supervisor}</bdi>
              </p>
              <Badge variant="outline">
                {x.state === 'archived'
                  ? copy(
                      'Published & archived · Public metadata',
                      'منشور ومؤرشف · بيانات عامة',
                    )
                  : copy(
                      'Retained internally · Private record',
                      'محفوظ داخليًا · سجل خاص',
                    )}
              </Badge>
            </div>
            <Button asChild variant="outline">
              <Link
                href={
                  '/' +
                  locale +
                  '/submissions/' +
                  x.submission +
                  '?from=' +
                  encodeURIComponent(
                    base + '?' + new URLSearchParams({ q, filter }),
                  )
                }
              >
                {copy('Open record', 'افتح السجل')}
              </Link>
            </Button>
          </article>
        ))}
      </div>
      {!rows.length && (
        <div className="ss-empty">
          <h2 dir="auto">
            {items.length
              ? copy('No matching records', 'لا توجد سجلات مطابقة')
              : copy('No final records yet', 'لا توجد سجلات نهائية بعد')}
          </h2>
          <p dir="auto">
            {items.length
              ? copy(
                  'Change the filter or clear your search.',
                  'غيّر التصفية أو امسح البحث.',
                )
              : copy(
                  'A recorded faculty publication or retention appears here.',
                  'يظهر هنا النشر أو الحفظ المسجل من المشرف.',
                )}
          </p>
          {items.length > 0 && (
            <Button asChild variant="outline">
              <Link href={base}>{copy('Clear filters', 'مسح التصفية')}</Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
