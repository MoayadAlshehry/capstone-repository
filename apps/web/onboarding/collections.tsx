'use client';
import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type { OnboardingList } from '@capstone/domain';
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Search,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  Building2,
  UsersRound,
  Tabs,
  TabsList,
  TabsTrigger,
  RouteTabsPanel,
  ArrowUpRight,
} from '@capstone/ui/workspace-v2';
import { TaskHeader, StateBadge, roleName, tr, type Locale } from './common';
import { PersonAvatar } from '@capstone/ui/visual-media';
function CollectionPanel({
  people,
  value,
  label,
  children,
}: {
  people: boolean;
  value: string;
  label: string;
  children: ReactNode;
}) {
  return people ? (
    <RouteTabsPanel
      className="on-list-panel"
      value={value}
      values={['all', 'faculty_supervisor', 'student', 'invitations']}
    >
      {children}
    </RouteTabsPanel>
  ) : (
    <section className="flex-1 outline-none on-list-panel" aria-label={label}>
      {children}
    </section>
  );
}
export function Roster({
  locale,
  kind,
  list,
  institution,
}: {
  locale: Locale;
  kind: 'universities' | 'people';
  list: OnboardingList;
  institution?: string;
}) {
  const people = kind === 'people',
    r = useRouter(),
    path = usePathname(),
    sp = useSearchParams(),
    [search, setSearch] = useState(sp.get('q') ?? ''),
    [prepared, setPrepared] = useState(false),
    t = (e: string, a: string) => tr(locale, e, a);
  useEffect(() => setPrepared(true), []);
  useEffect(() => setSearch(sp.get('q') ?? ''), [sp]);
  function filter(k: string, v: string) {
    const p = new URLSearchParams(sp);
    p.delete('page');
    p.delete('selected');
    if (v) p.set(k, v);
    else p.delete(k);
    r.push(path + (p.size ? '?' + p.toString() : ''));
  }
  const base = `/${locale}/admin/${people ? 'university/people' : 'platform'}`,
    from = path + (sp.size ? '?' + sp.toString() : ''),
    invite = base + '/new?from=' + encodeURIComponent(from);
  const pages = Math.max(1, Math.ceil(list.total / 20));
  const unavailable = list.page > pages;
  const filtered = !!(sp.get('q') || sp.get('status') || sp.get('role'));
  const open = (id: string) => {
    const returnQuery = new URLSearchParams(sp);
    returnQuery.set('selected', id);
    return (
      base + '/' + id + '?from=' + encodeURIComponent(path + '?' + returnQuery)
    );
  };
  useEffect(() => {
    const selected = sp.get('selected');
    if (selected && list.rows.some((x) => x.id === selected))
      document
        .getElementById(
          'on-open-' + (innerWidth <= 640 ? 'mobile-' : 'desktop-') + selected,
        )
        ?.focus();
  }, [sp, list.rows]);
  return (
    <section className="on-page" data-locale={locale}>
      <TaskHeader
        locale={locale}
        title={people ? t('People', 'الأشخاص') : t('Universities', 'الجامعات')}
        description={
          people
            ? (institution ?? '')
            : t(
                'Create an institution, then invite its administrator.',
                'أنشئ مؤسسة ثم ادعُ مديرها.',
              )
        }
        action={{
          href: invite,
          label: people
            ? t('Invite person', 'دعوة شخص')
            : t('Add university', 'إضافة جامعة'),
        }}
      />
      <Tabs
        value={sp.get('role') ?? 'all'}
        onValueChange={(v) => filter('role', v === 'all' ? '' : v)}
      >
        {people && (
          <TabsList
            className="on-tabs"
            aria-label={t('People categories', 'فئات الأشخاص')}
          >
            {[
              ['all', 'All', 'الكل'],
              ['faculty_supervisor', 'Faculty supervisors', 'المشرفون'],
              ['student', 'Students', 'الطلاب'],
              ['invitations', 'Invitations', 'الدعوات'],
            ].map(([v, e, a]) => (
              <TabsTrigger
                key={v}
                value={v!}
                className={
                  v === 'faculty_supervisor' ? 'on-faculty-tab' : undefined
                }
              >
                {t(e!, a!)}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        <CollectionPanel
          people={people}
          value={sp.get('role') ?? 'all'}
          label={t('University records', 'سجلات الجامعات')}
        >
          <div className="on-filters">
            <form
              aria-busy={!prepared}
              onSubmit={(e) => {
                e.preventDefault();
                filter('q', search);
              }}
            >
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={
                    people
                      ? t('Search people', 'البحث عن أشخاص')
                      : t('Search universities', 'البحث عن جامعات')
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={200}
                  disabled={!prepared}
                />
                <InputGroupAddon align="inline-end">
                  <Button variant="ghost" type="submit" disabled={!prepared}>
                    {t('Search', 'بحث')}
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </form>
            <Select
              value={sp.get('status') ?? 'all'}
              onValueChange={(v) => filter('status', v === 'all' ? '' : v)}
            >
              <SelectTrigger aria-label={t('Status filter', 'تصفية الحالة')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="wsv2">
                {(people
                  ? ['all', 'active', 'inactive', 'suspended']
                  : ['all', 'active', 'suspended']
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'all'
                      ? t('All statuses', 'كل الحالات')
                      : s === 'active'
                        ? t('Active', 'نشط')
                        : s === 'inactive'
                          ? t('Awaiting setup', 'بانتظار الإعداد')
                          : t('Suspended', 'موقوف')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtered && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  r.push(path);
                }}
              >
                {t('Clear filters', 'مسح التصفية')}
              </Button>
            )}
          </div>
          <div
            className="on-results-meta"
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            <strong>
              {list.total}{' '}
              {people
                ? t(list.total === 1 ? 'person' : 'people', 'شخصًا')
                : t(list.total === 1 ? 'university' : 'universities', 'جامعة')}
            </strong>
            {list.total > 0 && !unavailable && (
              <span>
                {t('Showing', 'عرض')} {(list.page - 1) * 20 + 1}–
                {Math.min(list.page * 20, list.total)}
              </span>
            )}
          </div>
          {list.rows.length ? (
            <>
              <div className="on-desktop">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {people
                          ? t('Person', 'الشخص')
                          : t('University', 'الجامعة')}
                      </TableHead>
                      <TableHead>
                        {people
                          ? t('Role / department', 'الدور / القسم')
                          : t('Code', 'الرمز')}
                      </TableHead>
                      <TableHead>{t('Status', 'الحالة')}</TableHead>
                      <TableHead>{t('Record', 'السجل')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.rows.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell>
                          <div className="visual-person">
                            {people && (
                              <PersonAvatar
                                name={x.name}
                                userId={x.id}
                                size="sm"
                              />
                            )}
                            <div>
                              <strong dir="auto">
                                {locale === 'ar' && x.nameAr
                                  ? x.nameAr
                                  : x.name}
                              </strong>
                              {x.email && (
                                <span className="on-email" dir="ltr">
                                  {x.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {people ? (
                            <>
                              {roleName(locale, x.role ?? '')}
                              <span className="on-email" dir="ltr">
                                {x.department ?? t('Not assigned', 'غير محدد')}
                              </span>
                            </>
                          ) : (
                            <bdi dir="ltr">{x.code}</bdi>
                          )}
                        </TableCell>
                        <TableCell>
                          <StateBadge locale={locale} state={x.status} />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" asChild>
                            <Link
                              aria-label={
                                (people
                                  ? t('View person', 'عرض الشخص')
                                  : t('Open record', 'فتح السجل')) +
                                ' — ' +
                                x.name
                              }
                              id={'on-open-desktop-' + x.id}
                              href={open(x.id)}
                            >
                              {people
                                ? t('View person', 'عرض الشخص')
                                : t('Open record', 'فتح السجل')}
                              <ArrowUpRight />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="on-mobile-rows">
                {list.rows.map((x) => (
                  <article key={x.id}>
                    <div className="on-row-identity">
                      {people && (
                        <PersonAvatar name={x.name} userId={x.id} size="sm" />
                      )}
                      <strong dir="auto">
                        {locale === 'ar' && x.nameAr ? x.nameAr : x.name}
                      </strong>
                      {x.email ? (
                        <span dir="ltr">{x.email}</span>
                      ) : (
                        <span dir="ltr">{x.code}</span>
                      )}
                      {people && (
                        <span>
                          {roleName(locale, x.role ?? '')} ·{' '}
                          <bdi dir="ltr">
                            {x.department ?? t('Not assigned', 'غير محدد')}
                          </bdi>
                        </span>
                      )}
                    </div>
                    <div className="on-row-actions">
                      <StateBadge locale={locale} state={x.status} />
                      <Button variant="outline" asChild>
                        <Link
                          aria-label={t('Open', 'فتح') + ' — ' + x.name}
                          id={'on-open-mobile-' + x.id}
                          href={open(x.id)}
                        >
                          {t('Open', 'فتح')}
                          <ArrowUpRight />
                        </Link>
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <Empty className="on-empty">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {people ? <UsersRound /> : <Building2 />}
                </EmptyMedia>
                <EmptyTitle>
                  {unavailable
                    ? t('Page unavailable', 'الصفحة غير متاحة')
                    : filtered
                      ? t('No matching records', 'لا توجد سجلات مطابقة')
                      : people
                        ? t('No people yet', 'لا يوجد أشخاص بعد')
                        : t('No universities yet', 'لا توجد جامعات بعد')}
                </EmptyTitle>
                <EmptyDescription>
                  {unavailable
                    ? t(
                        'Return to the last available page to see these records.',
                        'ارجع إلى آخر صفحة متاحة لعرض هذه السجلات.',
                      )
                    : filtered
                      ? t(
                          'Try another name or clear the filters.',
                          'جرّب اسمًا آخر أو امسح عوامل التصفية.',
                        )
                      : people
                        ? t(
                            'Invite a supervisor or student to join this university.',
                            'ادعُ مشرفًا أو طالبًا للانضمام إلى هذه الجامعة.',
                          )
                        : t(
                            'Add the first university and invite its administrator.',
                            'أضف الجامعة الأولى وادعُ مديرها.',
                          )}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {unavailable ? null : filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      r.push(path);
                    }}
                  >
                    {t('Clear filters', 'مسح التصفية')}
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href={invite}>
                      {people
                        ? t('Invite person', 'دعوة شخص')
                        : t('Add university', 'إضافة جامعة')}
                    </Link>
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          )}
          {(list.total > 20 || unavailable) && (
            <nav
              className="on-pagination"
              aria-label={t('Results pages', 'صفحات النتائج')}
            >
              <Button
                variant="outline"
                disabled={list.page <= 1}
                onClick={() => {
                  const p = new URLSearchParams(sp);
                  p.set(
                    'page',
                    String(Math.max(1, Math.min(pages, list.page - 1))),
                  );
                  r.push(path + '?' + p);
                }}
              >
                {t('Previous', 'السابق')}
              </Button>
              <span role="status" dir={unavailable ? undefined : 'ltr'}>
                {unavailable
                  ? t('Page unavailable', 'الصفحة غير متاحة')
                  : `${list.page} / ${pages}`}
              </span>
              <Button
                variant="outline"
                disabled={list.page >= pages}
                onClick={() => {
                  const p = new URLSearchParams(sp);
                  p.set('page', String(Math.min(pages, list.page + 1)));
                  r.push(path + '?' + p);
                }}
              >
                {t('Next', 'التالي')}
              </Button>
            </nav>
          )}
        </CollectionPanel>
      </Tabs>
    </section>
  );
}
