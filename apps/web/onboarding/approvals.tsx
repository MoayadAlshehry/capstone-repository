'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFact, BidiFacts } from '@capstone/ui/bidi';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  RouteTabsPanel,
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  Search,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  ArrowUpRight,
} from '@capstone/ui/workspace-v2';
import {
  TaskHeader,
  StateBadge,
  stateName,
  friendlyDate,
  tr,
  type Locale,
} from './common';
import { MutationPanel } from './mutation';
interface ApprovalRow {
  id: string;
  name: string;
  email?: string;
  context?: string;
  contextAr?: string;
  status: string;
}
export interface ApprovalListData {
  rows: ApprovalRow[];
  total: number;
  pending: number;
  page: number;
  pageSize: number;
}
export interface ApprovalDetailData {
  id: string;
  name: string;
  email?: string;
  organization?: string;
  clarification?: string | null;
  accountStatus?: string;
  institutionEn?: string;
  institutionAr?: string;
  qualification?: string;
  domains?: string[];
  tags?: string[];
  languages?: string[];
  available?: boolean;
  status: string;
  revision: number;
  reason?: string;
  history: {
    revision: number;
    from: string | null;
    to: string;
    reason: string;
    at: string;
  }[];
}
export function ApprovalList({
  locale,
  kind,
  data,
}: {
  locale: Locale;
  kind: 'partners' | 'reviewers';
  data: ApprovalListData;
}) {
  const r = useRouter(),
    path = usePathname(),
    sp = useSearchParams(),
    [search, setSearch] = useState(sp.get('q') ?? ''),
    t = (e: string, a: string) => tr(locale, e, a),
    partners = kind === 'partners';
  useEffect(() => setSearch(sp.get('q') ?? ''), [sp]);
  const filtered = !!(sp.get('q') || sp.get('status'));
  function clearFilters() {
    setSearch('');
    r.push(path + '?tab=' + kind);
  }
  function filter(k: string, v: string) {
    const p = new URLSearchParams(sp);
    p.delete('page');
    if (v) p.set(k, v);
    else p.delete(k);
    r.push(path + '?' + p);
  }
  const href = (id: string) =>
    `/${locale}/admin/platform/approvals/${kind}/${id}?from=` +
    encodeURIComponent(path + '?' + sp);
  return (
    <section className="on-page" data-locale={locale}>
      <TaskHeader
        locale={locale}
        title={t('Approvals', 'الموافقات')}
        description={t(
          'Review partner eligibility and independent reviewer capability.',
          'راجع أهلية الشركاء وصلاحية المقيّمين المستقلين.',
        )}
      />
      <Tabs value={kind} onValueChange={(s) => r.push(path + '?tab=' + s)}>
        <TabsList aria-label={t('Approval categories', 'فئات الموافقات')}>
          <TabsTrigger value="partners">{t('Partners', 'الشركاء')}</TabsTrigger>
          <TabsTrigger value="reviewers">
            {t('Reviewers', 'المقيّمون')}
          </TabsTrigger>
        </TabsList>
        <RouteTabsPanel
          className="on-list-panel"
          value={kind}
          values={['partners', 'reviewers']}
        >
          <div className="on-results-meta">
            <strong>
              {data.pending} {t('pending review', 'بانتظار المراجعة')}
            </strong>
            <span>
              {data.total}{' '}
              {t(
                data.total === 1 ? 'matching record' : 'matching records',
                'سجلًا مطابقًا',
              )}
            </span>
          </div>
          <div className="on-filters">
            <form
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
                  aria-label={t('Search approvals', 'البحث عن موافقات')}
                  value={search}
                  maxLength={200}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <Button type="submit" variant="ghost">
                    {t('Search', 'بحث')}
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </form>
            <Select
              value={sp.get('status') ?? 'all'}
              onValueChange={(s) => filter('status', s === 'all' ? '' : s)}
            >
              <SelectTrigger aria-label={t('Status filter', 'تصفية الحالة')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="wsv2">
                {(partners
                  ? ['all', 'pending', 'approved', 'rejected', 'suspended']
                  : ['all', 'pending', 'approved', 'suspended']
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'all'
                      ? t('All statuses', 'كل الحالات')
                      : stateName(locale, s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtered && (
              <Button variant="outline" onClick={clearFilters}>
                {t('Clear filters', 'مسح التصفية')}
              </Button>
            )}
          </div>
          {data.rows.length ? (
            <>
              <div className="on-desktop">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {partners
                          ? t('Partner / organization', 'الشريك / المؤسسة')
                          : t('Reviewer / institution', 'المقيّم / الجامعة')}
                      </TableHead>
                      <TableHead>{t('Eligibility', 'الأهلية')}</TableHead>
                      <TableHead>
                        {t('Decision record', 'سجل القرار')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell>
                          <strong dir="auto">{x.name}</strong>
                          <span className="on-email" dir="auto">
                            {locale === 'ar' && x.contextAr
                              ? x.contextAr
                              : x.context}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StateBadge locale={locale} state={x.status} />
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="ghost">
                            <Link
                              href={href(x.id)}
                              aria-label={
                                t('Review record for ', 'مراجعة سجل ') + x.name
                              }
                            >
                              {t('Open record', 'فتح السجل')}
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
                {data.rows.map((x) => (
                  <article key={x.id}>
                    <div className="on-row-identity">
                      <strong dir="auto">{x.name}</strong>
                      <span dir="auto">
                        {locale === 'ar' && x.contextAr
                          ? x.contextAr
                          : x.context}
                      </span>
                    </div>
                    <div className="on-row-actions">
                      <StateBadge locale={locale} state={x.status} />
                      <Button variant="outline" asChild>
                        <Link
                          href={href(x.id)}
                          aria-label={
                            t('Review record for ', 'مراجعة سجل ') + x.name
                          }
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
                <EmptyTitle>
                  {sp.get('q') || sp.get('status')
                    ? t('No matching records', 'لا توجد سجلات مطابقة')
                    : t('No approval records yet', 'لا توجد سجلات موافقات بعد')}
                </EmptyTitle>
                <EmptyDescription>
                  {t(
                    'Pending and completed decisions appear here when eligible profiles exist.',
                    'تظهر القرارات المعلقة والمكتملة هنا عند وجود ملفات مؤهلة.',
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {data.total > 20 && (
            <nav
              className="on-pagination"
              aria-label={t('Results pages', 'صفحات النتائج')}
            >
              <Button
                variant="outline"
                disabled={data.page === 1}
                onClick={() => filter('page', String(data.page - 1))}
              >
                {t('Previous', 'السابق')}
              </Button>
              <span>
                {data.page} / {Math.ceil(data.total / 20)}
              </span>
              <Button
                variant="outline"
                disabled={data.page * 20 >= data.total}
                onClick={() => filter('page', String(data.page + 1))}
              >
                {t('Next', 'التالي')}
              </Button>
            </nav>
          )}
        </RouteTabsPanel>
      </Tabs>
    </section>
  );
}
export function ApprovalDetail({
  locale,
  kind,
  record,
  parent,
}: {
  locale: Locale;
  kind: 'partners' | 'reviewers';
  record: ApprovalDetailData;
  parent: string;
}) {
  const t = (e: string, a: string) => tr(locale, e, a),
    partner = kind === 'partners',
    context = partner
      ? record.organization
      : locale === 'ar'
        ? record.institutionAr
        : record.institutionEn,
    actions = partner
      ? record.accountStatus !== 'active'
        ? []
        : record.status === 'pending'
          ? [
              {
                operation: 'approve',
                label: t('Review approval', 'مراجعة الاعتماد'),
              },
              {
                operation: 'reject',
                label: t('Review rejection', 'مراجعة الرفض'),
                required: true,
              },
            ]
          : record.status === 'approved'
            ? [
                {
                  operation: 'suspend',
                  label: t('Review suspension', 'مراجعة الإيقاف'),
                  required: true,
                },
              ]
            : record.status === 'suspended'
              ? [
                  {
                    operation: 'reapprove',
                    label: t('Review reapproval', 'مراجعة إعادة الاعتماد'),
                  },
                ]
              : []
      : record.status === 'approved'
        ? [
            {
              operation: 'suspend',
              label: t('Review suspension', 'مراجعة الإيقاف'),
              required: true,
            },
          ]
        : [
            {
              operation: 'approve',
              label: t('Review approval', 'مراجعة الاعتماد'),
              required: true,
            },
          ];
  const consequences: Record<string, string> = partner
    ? {
        approve: t(
          'Approval establishes partner eligibility. It does not grant access to any restricted project files.',
          'يحدد الاعتماد أهلية الشريك، ولا يمنح وصولًا إلى أي ملفات مشروع مقيّدة.',
        ),
        reject: t(
          'Reject partner eligibility. The person can clarify the organization or intended use and resubmit. Public projects remain available.',
          'ارفض أهلية الشريك. يمكن للشخص توضيح المؤسسة أو الاستخدام المقصود وإعادة التقديم. تبقى المشاريع العامة متاحة.',
        ),
        suspend: t(
          'Suspend partner eligibility. Restricted-file access and new requests are blocked while suspended. Recorded access history is retained.',
          'أوقف أهلية الشريك. يُحظر الوصول للملفات المقيّدة والطلبات الجديدة أثناء الإيقاف. يبقى سجل الوصول محفوظًا.',
        ),
        reapprove: t(
          'Reapprove partner eligibility. Restricted-file reads still require a current, valid project permission.',
          'أعد اعتماد أهلية الشريك. تظل قراءة الملفات المقيّدة بحاجة إلى إذن مشروع حالي وصالح.',
        ),
      }
    : {
        approve: t(
          'Approval enables independent reviewer capability. It does not create an assignment or authorize a project packet.',
          'يفعّل الاعتماد صلاحية المقيّم المستقل، ولا ينشئ مهمة أو يصرح بوصول إلى حزمة مشروع.',
        ),
        suspend: t(
          'Suspend independent reviewer capability. New offers and assignment evidence reads are blocked while suspended. Recorded assessments remain unchanged.',
          'أوقف صلاحية المقيّم المستقل. تُحظر العروض الجديدة وقراءة أدلة المهام أثناء الإيقاف. تبقى التقييمات المسجلة دون تغيير.',
        ),
      };
  return (
    <section className="on-page" data-locale={locale}>
      <TaskHeader
        locale={locale}
        title={record.name}
        description={
          (partner
            ? t('Partner eligibility', 'أهلية الشريك')
            : t('Reviewer capability', 'صلاحية المقيّم')) +
          ' · ' +
          (context ?? '')
        }
        back={{
          href: parent,
          label: t('Back to Approvals', 'العودة إلى الموافقات'),
        }}
      />
      <StateBadge locale={locale} state={record.status} />
      <div className="on-record-grid">
        <Card>
          <CardHeader>
            <CardTitle>
              {partner
                ? t('Partner profile', 'ملف الشريك')
                : t('Reviewer declaration', 'إقرار المقيّم')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {partner ? (
              <BidiFacts className="on-facts">
                <BidiFact>
                  <BidiLabel dir="auto">
                    {t('Organization', 'المؤسسة')}
                  </BidiLabel>
                  <BidiData dir="auto">{record.organization}</BidiData>
                </BidiFact>
                {record.clarification && (
                  <BidiFact>
                    <BidiLabel dir="auto">
                      {t('Organization response', 'رد المؤسسة')}
                    </BidiLabel>
                    <BidiData dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                      {record.clarification}
                    </BidiData>
                  </BidiFact>
                )}
                <BidiFact>
                  <BidiLabel dir="auto">{t('Email', 'البريد')}</BidiLabel>
                  <BidiData dir="ltr">{record.email}</BidiData>
                </BidiFact>
                <BidiFact>
                  <BidiLabel dir="auto">{t('Account', 'الحساب')}</BidiLabel>
                  <BidiData dir="auto">
                    {stateName(locale, record.accountStatus ?? '')}
                  </BidiData>
                </BidiFact>
              </BidiFacts>
            ) : (
              <>
                <p dir="auto" className="on-qualification">
                  {record.qualification}
                </p>
                <BidiFacts className="on-facts">
                  <BidiFact>
                    <BidiLabel dir="auto">{t('Expertise', 'الخبرة')}</BidiLabel>
                    <BidiData dir="auto">
                      {record.domains
                        ?.map(
                          (s) =>
                            ({
                              software: t('Software', 'البرمجيات'),
                              data: t('Data', 'البيانات'),
                              hardware: t('Hardware', 'الأجهزة'),
                            })[s] ?? t('Other expertise', 'خبرة أخرى'),
                        )
                        .join(' · ')}
                    </BidiData>
                  </BidiFact>
                  <BidiFact>
                    <BidiLabel dir="auto">{t('Tags', 'التخصصات')}</BidiLabel>
                    <BidiData dir="auto">
                      {record.tags?.length
                        ? record.tags.join(' · ')
                        : t('Not declared', 'لم تُذكر')}
                    </BidiData>
                  </BidiFact>
                  <BidiFact>
                    <BidiLabel dir="auto">
                      {t('Reading languages', 'لغات القراءة')}
                    </BidiLabel>
                    <BidiData dir="auto">
                      {record.languages
                        ?.map((s) =>
                          s === 'ar'
                            ? t('Arabic', 'العربية')
                            : t('English', 'الإنجليزية'),
                        )
                        .join(' · ')}
                    </BidiData>
                  </BidiFact>
                  <BidiFact>
                    <BidiLabel dir="auto">
                      {t('Available for review', 'متاح للتقييم')}
                    </BidiLabel>
                    <BidiData dir="auto">
                      {record.available ? t('Yes', 'نعم') : t('No', 'لا')}
                    </BidiData>
                  </BidiFact>
                </BidiFacts>
              </>
            )}
          </CardContent>
        </Card>
        <MutationPanel
          locale={locale}
          title={t('Eligibility decision', 'قرار الأهلية')}
          description={
            partner
              ? t(
                  'Approval establishes partner eligibility. It does not grant access to any restricted project files.',
                  'يحدد الاعتماد أهلية الشريك، ولا يمنح وصولًا إلى أي ملفات مشروع مقيّدة.',
                )
              : t(
                  'Approval enables independent reviewer capability. It does not create an assignment or authorize a project packet.',
                  'يفعّل الاعتماد صلاحية المقيّم المستقل، ولا ينشئ مهمة أو يصرح بوصول إلى حزمة مشروع.',
                )
          }
          subject={record.name}
          university={context ?? ''}
          id={record.id}
          revision={record.revision}
          kind={kind}
          actions={actions.map((action) => ({
            ...action,
            description: consequences[action.operation]!,
          }))}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('Decision history', 'سجل القرارات')}</CardTitle>
        </CardHeader>
        <CardContent>
          {record.history.length ? (
            <ol className="on-history">
              {record.history.map((h) => (
                <li key={h.revision}>
                  <strong>{stateName(locale, h.to)}</strong>
                  {h.reason && <p dir="auto">{h.reason}</p>}
                  <time dir="ltr">{friendlyDate(locale, h.at)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p dir="auto">
              {t('No completed decision yet.', 'لا يوجد قرار مكتمل بعد.')}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
