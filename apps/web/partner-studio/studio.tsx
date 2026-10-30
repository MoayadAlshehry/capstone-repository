'use client';
import { ProjectCover } from '@capstone/ui/visual-media';
import Link from 'next/link';
import {
  useState,
  useEffect,
  useRef,
  useTransition,
  type ReactNode,
  type MouseEvent,
} from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Button,
  Badge,
  Item,
  ItemGroup,
  Tabs,
  TabsList,
  TabsTrigger,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ArrowLeft,
  ArrowUpRight,
  Download,
  LockKeyhole,
  ShieldCheck,
  Clock3,
  CircleCheck,
  Archive,
  FileText,
} from '@capstone/ui/workspace-v2';
import type { PartnerProfile } from '../partners/types';
import type { SemesterFile } from '@capstone/domain';
import type { AccessView } from '../access/types';
import type {
  AccessPresentation,
  AccessRecord,
  GrantRecord,
  AccessAction,
} from './presentation';
import { accessHub, requestRecord } from './presentation';
import { AcademicEvidence } from '../academic/evidence';
import { copy, accessState, type Locale } from './model';
import { auditActionMessage } from '@capstone/domain/notification-types';
import { recheckGrantRead } from './reader-recovery';
export function Stamp({ locale, value }: { locale: Locale; value: string }) {
  return (
    <time dateTime={value} dir="auto">
      {new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Riyadh',
      }).format(new Date(value))}{' '}
      · UTC+3
    </time>
  );
}
export function Status({ locale, value }: { locale: Locale; value: string }) {
  const Icon = ['active', 'approved'].includes(value)
    ? CircleCheck
    : ['pending', 'awaiting_lead', 'expired'].includes(value)
      ? Clock3
      : ['revoked', 'paused', 'suspended', 'unavailable', 'unknown'].includes(
            value,
          )
        ? LockKeyhole
        : Archive;
  return (
    <Badge variant="outline" className={'ps-state ps-state-' + value}>
      <Icon size={14} aria-hidden="true" />
      {accessState(locale, value)}
    </Badge>
  );
}
export function PartnerHeader({
  locale,
  title,
  description,
  back,
  backLabel,
  children,
}: {
  locale: Locale;
  title: string;
  description?: string;
  back?: string | undefined;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="ps-heading">
      {back && (
        <Link className="ss-back" href={back}>
          <ArrowLeft />
          {backLabel ?? copy(locale, 'Back', 'العودة')}
        </Link>
      )}
      <div className="ps-heading-row">
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <h1 dir="auto">{title}</h1>
          {description && <p dir="auto">{description}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}
export function ProjectLink({
  locale,
  item,
}: {
  locale: Locale;
  item: { project: string; title: string };
}) {
  return (
    <Link
      className="ps-project-title"
      href={'/' + locale + '/catalogue/' + item.project}
      aria-label={
        copy(locale, 'View public project: ', 'عرض المشروع العام: ') +
        item.title
      }
    >
      <bdi dir="auto">{item.title}</bdi>
      <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  );
}
function actionLabel(locale: Locale, kind: AccessAction['kind']) {
  const labels = {
    files: ['Open original files', 'فتح الملفات الأصلية'],
    record: ['View permission', 'عرض الإذن'],
    request: ['View request', 'عرض الطلب'],
    history: ['View access history', 'عرض سجل الوصول'],
    review: ['Review request', 'مراجعة الطلب'],
    protect: ['Review protective action', 'مراجعة الإجراء الوقائي'],
    eligibility: ['Review eligibility', 'مراجعة الأهلية'],
    retry: ['Check access again', 'التحقق من الوصول مجددًا'],
  } as const;
  return copy(locale, labels[kind][0], labels[kind][1]);
}
export function AccessTaskLink({
  locale,
  action,
  from,
  label,
}: {
  locale: Locale;
  action: AccessAction;
  from?: string;
  label?: string | undefined;
}) {
  const href =
    action.href +
    (from
      ? (action.href.includes('?') ? '&' : '?') +
        'from=' +
        encodeURIComponent(from)
      : '');
  return (
    <Button asChild variant="outline">
      <Link href={href}>
        {label ?? actionLabel(locale, action.kind)}
        <ArrowUpRight size={14} />
      </Link>
    </Button>
  );
}
function AccessRecordRow({
  locale,
  record,
  from,
  compact = false,
}: {
  locale: Locale;
  record: AccessRecord;
  from?: string;
  compact?: boolean;
}) {
  const t = (e: string, a: string) => copy(locale, e, a),
    dateLabel = {
      expires: t('Expires', 'ينتهي'),
      requested: t('Requested', 'طُلب'),
      decided: t('Decision', 'القرار'),
      granted: t('Approved', 'اعتمد'),
      ended: t('Ended', 'انتهى'),
    }[record.dateKind];
  return (
    <Item role="listitem" className="ps-row">
      <ProjectCover
        projectId={record.project}
        versionId={record.version}
        grant={record.kind === 'grant' ? record.id : undefined}
        published={record.kind === 'request'}
        className="visual-project-thumb"
      />
      <div className="ps-row-copy">
        <ProjectLink locale={locale} item={record} />
        <div className="ps-meta">
          <Status locale={locale} value={record.state} />
          <span>
            {dateLabel}: <Stamp locale={locale} value={record.date} />
          </span>
        </div>
        {!compact && record.organization && (
          <p dir="auto">{record.organization}</p>
        )}
        {!compact && record.reason && (
          <p className="ps-muted" dir="auto">
            {record.reason}
          </p>
        )}
      </div>
      <AccessTaskLink
        locale={locale}
        action={record.action}
        {...(from ? { from } : {})}
      />
    </Item>
  );
}
function RecordList({
  locale,
  records,
  from,
  empty,
  compact = false,
}: {
  locale: Locale;
  records: AccessRecord[];
  from?: string;
  empty: string;
  compact?: boolean;
}) {
  return records.length ? (
    <ItemGroup>
      {records.map((record) => (
        <AccessRecordRow
          key={record.kind + record.id}
          locale={locale}
          record={record}
          compact={compact}
          {...(from ? { from } : {})}
        />
      ))}
    </ItemGroup>
  ) : (
    <div className="ps-empty-inline">
      <p dir="auto">{empty}</p>
    </div>
  );
}
function Filters({ locale, statuses }: { locale: Locale; statuses: string[] }) {
  const router = useRouter(),
    path = usePathname(),
    sp = useSearchParams(),
    [q, setQ] = useState(sp.get('q') ?? ''),
    [searchReady, setSearchReady] = useState(false),
    [navigating, startNavigation] = useTransition(),
    t = (e: string, a: string) => copy(locale, e, a);
  useEffect(() => {
    setQ(sp.get('q') ?? '');
    setSearchReady(true);
  }, [sp]);
  function change(key: string, v: string) {
    const p = new URLSearchParams(sp);
    p.delete('page');
    if (v && v !== 'all') p.set(key, v);
    else p.delete(key);
    startNavigation(() => router.push(path + '?' + p));
  }
  return (
    <div className="ps-filters">
      <form
        aria-busy={!searchReady || navigating}
        onSubmit={(e) => {
          e.preventDefault();
          change('q', q);
        }}
      >
        <Input
          disabled={!searchReady || navigating}
          value={q}
          maxLength={200}
          aria-label={t('Search project access', 'البحث في وصول المشاريع')}
          placeholder={t('Project or organization', 'المشروع أو المؤسسة')}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button
          variant="outline"
          type="submit"
          disabled={!searchReady || navigating}
        >
          {t('Search', 'بحث')}
        </Button>
      </form>
      <Select
        disabled={!searchReady || navigating}
        value={sp.get('status') ?? 'all'}
        onValueChange={(v) => change('status', v)}
      >
        <SelectTrigger aria-label={t('Status filter', 'تصفية الحالة')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="wsv2">
          {['all', ...statuses].map((s) => (
            <SelectItem key={s} value={s}>
              {s === 'all'
                ? t('All statuses', 'كل الحالات')
                : accessState(locale, s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(sp.get('q') || sp.get('status')) && (
        <Button
          variant="ghost"
          disabled={!searchReady || navigating}
          onClick={() => {
            const p = new URLSearchParams(sp);
            for (const k of ['q', 'status', 'page']) p.delete(k);
            startNavigation(() => router.push(path + '?' + p));
          }}
        >
          {t('Clear filters', 'مسح التصفية')}
        </Button>
      )}
    </div>
  );
}
function filtered(
  records: AccessRecord[],
  sp: ReturnType<typeof useSearchParams>,
) {
  const q = (sp.get('q') ?? '').toLocaleLowerCase(),
    status = sp.get('status'),
    project = sp.get('project');
  return records.filter(
    (r) =>
      (!project || r.project === project) &&
      (!status ||
        status === 'all' ||
        r.state === status ||
        (status === 'pending' && r.state === 'awaiting_lead')) &&
      (!q ||
        [r.title, r.organization, r.purpose ?? '', r.reason ?? '']
          .join(' ')
          .toLocaleLowerCase()
          .includes(q)),
  );
}
function Pagination({ locale, count }: { locale: Locale; count: number }) {
  const pth = usePathname(),
    sp = useSearchParams(),
    router = useRouter(),
    pages = Math.max(1, Math.ceil(count / 10)),
    page = Math.min(
      pages,
      Math.max(1, Math.floor(Number(sp.get('page')) || 1)),
    );
  if (pages === 1) return null;
  const change = (n: number) => {
    const p = new URLSearchParams(sp);
    p.set('page', String(n));
    router.push(pth + '?' + p);
  };
  return (
    <nav
      className="ps-pagination"
      aria-label={copy(locale, 'Access records pages', 'صفحات سجلات الوصول')}
    >
      <Button
        variant="outline"
        disabled={page === 1}
        onClick={() => change(page - 1)}
      >
        {copy(locale, 'Previous', 'السابق')}
      </Button>
      <span>
        {page} / {pages}
      </span>
      <Button
        variant="outline"
        disabled={page === pages}
        onClick={() => change(page + 1)}
      >
        {copy(locale, 'Next', 'التالي')}
      </Button>
    </nav>
  );
}
export function PartnerAccessHub({
  locale,
  data,
}: {
  locale: Locale;
  data: AccessPresentation;
}) {
  const router = useRouter(),
    path = usePathname(),
    sp = useSearchParams(),
    t = (e: string, a: string) => copy(locale, e, a),
    tab = ['active', 'pending', 'history'].includes(sp.get('tab') ?? '')
      ? (sp.get('tab')! as 'active' | 'pending' | 'history')
      : 'active',
    all =
      tab === 'active'
        ? data.active
        : tab === 'pending'
          ? data.pending
          : data.history,
    rows = filtered(all, sp),
    page = Math.min(
      Math.max(1, Math.floor(Number(sp.get('page')) || 1)),
      Math.max(1, Math.ceil(rows.length / 10)),
    ),
    shown = rows.slice((page - 1) * 10, page * 10),
    from = path + '?' + sp,
    labels = {
      active: t('Active grants', 'أذونات سارية'),
      pending: t('Pending requests', 'طلبات معلّقة'),
      history: t('History', 'السجل'),
    };
  return (
    <section
      className="ps-page"
      data-template="access-hub"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={t('Project access', 'الوصول إلى المشاريع')}
        description={t(
          'Your permissions, requests and previous decisions.',
          'أذوناتك وطلباتك وقراراتك السابقة.',
        )}
      >
        <Button asChild variant="outline">
          <Link href={'/' + locale + '/catalogue'}>
            {t('Discover projects', 'استكشاف المشاريع')}
            <ArrowUpRight />
          </Link>
        </Button>
      </PartnerHeader>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const p = new URLSearchParams(sp);
          p.set('tab', v);
          p.delete('page');
          p.delete('status');
          router.push(path + '?' + p);
        }}
      >
        <TabsList className="ps-hub-tabs" variant="line">
          {(['active', 'pending', 'history'] as const).map((k) => (
            <TabsTrigger
              key={k}
              value={k}
              aria-controls="partner-access-region"
            >
              {labels[k]} <span className="ps-tab-count">{data[k].length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Filters
        locale={locale}
        statuses={
          tab === 'active'
            ? ['active']
            : tab === 'pending'
              ? ['awaiting_lead']
              : [
                  'active',
                  'revoked',
                  'expired',
                  'paused',
                  'denied',
                  'cancelled',
                  'unavailable',
                ]
        }
      />
      <div className="ps-section-title" id="partner-access-region">
        <h2 dir="auto">{labels[tab]}</h2>
        <span className="ps-muted">
          {rows.length} {t(rows.length === 1 ? 'record' : 'records', 'سجلًا')}
        </span>
      </div>
      {shown.length ? (
        tab === 'pending' ? (
          <RecordList locale={locale} records={shown} from={from} empty="" />
        ) : (
          Array.from(new Set(shown.map((r) => r.project))).map((project) => {
            const group = shown
                .filter((r) => r.project === project)
                .sort(
                  (a, b) =>
                    Number(b.state === 'active') -
                      Number(a.state === 'active') ||
                    Date.parse(b.date) - Date.parse(a.date),
                ),
              old = data.history.filter(
                (r) => r.project === project && r.state !== 'active',
              );
            return (
              <section key={project} className="ps-project-group">
                <RecordList
                  locale={locale}
                  records={group}
                  from={from}
                  empty=""
                />
                {tab === 'active' && old.length > 0 && (
                  <Link
                    className="ps-history-link"
                    href={accessHub(locale, 'history', project)}
                  >
                    <Archive size={15} />
                    {t('Previous decisions', 'القرارات السابقة')} · {old.length}
                  </Link>
                )}
              </section>
            );
          })
        )
      ) : (
        <div className="ps-empty">
          <h2 dir="auto">
            {sp.get('q') || sp.get('status')
              ? t('No matching records', 'لا توجد سجلات مطابقة')
              : tab === 'active'
                ? t('No active project access', 'لا يوجد وصول ساري للمشاريع')
                : tab === 'pending'
                  ? t(
                      'No request is waiting for a lead',
                      'لا يوجد طلب ينتظر القائد',
                    )
                  : t('No previous decisions', 'لا توجد قرارات سابقة')}
          </h2>
          <p dir="auto">
            {tab === 'active'
              ? t(
                  'An eligible partner can request a project; its lead decides access.',
                  'يمكن للشريك المؤهل طلب مشروع؛ ويقرر قائده الوصول.',
                )
              : t(
                  'Your actual requests and decisions appear here.',
                  'تظهر هنا طلباتك وقراراتك الفعلية.',
                )}
          </p>
          <Button asChild variant="outline">
            <Link
              href={
                '/' +
                locale +
                (data.canRequest ? '/catalogue' : '/partner/eligibility')
              }
            >
              {data.canRequest
                ? t('Discover projects', 'استكشاف المشاريع')
                : t('Check eligibility', 'التحقق من الأهلية')}
            </Link>
          </Button>
        </div>
      )}
      <Pagination locale={locale} count={rows.length} />
    </section>
  );
}
export function PartnerOverview({
  locale,
  profile,
  data,
}: {
  locale: Locale;
  profile: PartnerProfile;
  data: AccessPresentation;
}) {
  const t = (e: string, a: string) => copy(locale, e, a),
    eligible = data.canRequest;
  return (
    <section
      className="ps-page"
      data-template="partner-overview"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={t('Partner workspace', 'مساحة الشريك')}
        description={t(
          'Continue your project access and research collaboration.',
          'تابع وصولك إلى المشاريع وتعاونك البحثي.',
        )}
      />
      <section className="ps-overview-status">
        <ShieldCheck />
        <div>
          <h2 dir="auto">
            {t('Organization & eligibility', 'المؤسسة والأهلية')}
          </h2>
          <p dir="auto">
            {profile.organization ||
              t('Organization not submitted', 'لم تُقدّم المؤسسة')}
          </p>
          <Status locale={locale} value={profile.status} />
          {profile.reason && (
            <p className="ps-reason" dir="auto">
              {profile.reason}
            </p>
          )}
        </div>
        <Button asChild variant="outline">
          <Link href={'/' + locale + '/partner/eligibility'}>
            {t('View organization', 'عرض المؤسسة')}
            <ArrowUpRight />
          </Link>
        </Button>
      </section>
      <div className="ps-summary">
        <Link href={accessHub(locale, 'active')}>
          <FileText />
          <span>{t('Active grants', 'أذونات سارية')}</span>
          <strong>{data.active.length}</strong>
        </Link>
        <Link href={accessHub(locale, 'pending')}>
          <Clock3 />
          <span>{t('Pending requests', 'طلبات معلّقة')}</span>
          <strong>{data.pending.length}</strong>
        </Link>
        <Link href={accessHub(locale, 'history')}>
          <Archive />
          <span>{t('Access history', 'سجل الوصول')}</span>
          <strong>{data.history.length}</strong>
        </Link>
      </div>
      {profile.status === 'rejected' && (
        <section className="ps-section">
          <h3 dir="auto">{t('Needs your attention', 'يحتاج انتباهك')}</h3>
          <Link href={'/' + locale + '/partner/eligibility'}>
            {t('Respond to the organization decision', 'الرد على قرار المؤسسة')}
          </Link>
        </section>
      )}
      <div className="ps-two-columns">
        <section className="ps-section">
          <div className="ps-section-title">
            <h2 dir="auto">{t('Awaiting a decision', 'بانتظار قرار')}</h2>
            {eligible && (
              <Link href={'/' + locale + '/catalogue'}>
                {t('Discover', 'استكشف')}
              </Link>
            )}
          </div>
          <RecordList
            locale={locale}
            records={data.pending.slice(0, 3)}
            compact
            from={'/' + locale + '/partner'}
            empty={
              eligible
                ? t(
                    'No requests are waiting. Discover projects or continue your granted files.',
                    'لا توجد طلبات معلّقة. استكشف المشاريع أو تابع ملفاتك الممنوحة.',
                  )
                : t(
                    'Review your eligibility before requesting Restricted files.',
                    'راجع أهليتك قبل طلب الملفات المقيّدة.',
                  )
            }
          />
        </section>
        <section className="ps-section">
          <h2 dir="auto">{t('Available projects', 'المشاريع المتاحة')}</h2>
          {!data.active.length && (
            <p dir="auto" className="ps-muted">
              {t(
                'Approved project permissions appear here.',
                'تظهر أذونات المشاريع المعتمدة هنا.',
              )}
            </p>
          )}
          {!!data.active.length && (
            <ItemGroup>
              {data.active.slice(0, 2).map((r) => (
                <AccessRecordRow
                  key={r.id}
                  locale={locale}
                  record={r}
                  compact
                  from={'/' + locale + '/partner'}
                />
              ))}
            </ItemGroup>
          )}
        </section>
        <section className="ps-section">
          <div className="ps-section-title">
            <h2 dir="auto">
              {t('Recent access activity', 'نشاط الوصول الأخير')}
            </h2>
            <Link href={accessHub(locale, 'history')}>
              {t('View history', 'عرض السجل')}
            </Link>
          </div>
          <RecordList
            locale={locale}
            records={data.history
              .filter((r) => r.state !== 'active')
              .slice(0, 3)}
            compact
            from={'/' + locale + '/partner'}
            empty={t(
              'No earlier access changes.',
              'لا توجد تغييرات سابقة في الوصول.',
            )}
          />
        </section>
      </div>
    </section>
  );
}
export function AccessCollection({
  locale,
  view,
  mode,
  project,
  parent,
}: {
  locale: Locale;
  view: AccessView;
  mode: 'lead' | 'oversight';
  project?: string;
  parent?: string;
}) {
  const sp = useSearchParams(),
    path = usePathname(),
    t = (e: string, a: string) => copy(locale, e, a),
    lead = mode === 'lead',
    records: AccessRecord[] = lead
      ? view.requests
          .filter((r) => !project || r.project === project)
          .map((r) => ({
            ...requestRecord(r, locale),
            action: {
              kind: 'review',
              href:
                '/' +
                locale +
                '/access/lead?' +
                new URLSearchParams({ project: r.project, request: r.id }),
            },
          }))
      : view.grants.map((g) => ({
          id: g.id,
          project: g.project,
          version: g.version,
          title: g.title,
          organization: g.organization,
          state: g.state,
          date: g.expiresAt,
          dateKind: 'expires',
          kind: 'grant',
          versionNumber: g.versionNumber,
          action: {
            kind: 'protect',
            href: '/' + locale + '/admin/access?grant=' + g.id,
          },
        })),
    rows = filtered(records, sp),
    page = Math.min(
      Math.max(1, Math.floor(Number(sp.get('page')) || 1)),
      Math.max(1, Math.ceil(rows.length / 10)),
    );
  return (
    <section
      className="ps-page"
      data-template="access-task-queue"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={
          lead
            ? t('Partner requests', 'طلبات الشركاء')
            : t('Protective access review', 'مراجعة حماية الوصول')
        }
        description={
          lead
            ? t(
                'Requests for your projects. Open the organization and purpose before deciding.',
                'طلبات مشاريعك. افتح المؤسسة والغرض قبل اتخاذ القرار.',
              )
            : t(
                'Existing permissions only. New access remains a project-lead decision.',
                'أذونات قائمة فقط. يبقى الوصول الجديد قرار قائد المشروع.',
              )
        }
        back={parent}
        backLabel={
          lead
            ? t('Back to project', 'العودة إلى المشروع')
            : t('Back to overview', 'العودة إلى النظرة العامة')
        }
      />
      <Filters
        locale={locale}
        statuses={
          lead
            ? ['awaiting_lead', 'approved', 'denied', 'cancelled']
            : ['active', 'revoked', 'expired']
        }
      />
      <p dir="auto" className="ps-muted">
        {rows.length} {t('matching records', 'سجلًا مطابقًا')}
      </p>
      <RecordList
        locale={locale}
        records={rows.slice((page - 1) * 10, page * 10)}
        from={path + '?' + sp}
        empty={
          lead
            ? t(
                'No partner requests match this view.',
                'لا توجد طلبات شركاء تطابق هذا العرض.',
              )
            : t(
                'No access records match this authorized scope.',
                'لا توجد سجلات وصول تطابق هذا النطاق المسموح.',
              )
        }
      />
      <Pagination locale={locale} count={rows.length} />
    </section>
  );
}
export function GrantedReader({
  locale,
  actor,
  grant,
  files,
  parent,
  now,
  canRequest,
}: {
  locale: Locale;
  actor: string;
  grant: GrantRecord;
  files: SemesterFile[];
  parent: string;
  now: string;
  canRequest: boolean;
}) {
  const t = (e: string, a: string) => copy(locale, e, a),
    [denied, setDenied] = useState(grant.effective !== 'active'),
    [state, setState] = useState(grant.effective),
    [retrying, setRetrying] = useState(false),
    retryLock = useRef(false),
    generation = useRef(0),
    url = (mode: string, file?: string) =>
      '/api/granted-files?' +
      new URLSearchParams({
        grant: grant.id,
        project: grant.project,
        version: grant.version,
        mode,
        ...(file ? { file } : {}),
        ...(mode === 'preview' ? { syntax: 'studio' } : {}),
      });
  useEffect(() => {
    generation.current++;
    const clear = () => {
      generation.current++;
      retryLock.current = false;
      setRetrying(false);
      setDenied(true);
      setState('unavailable');
    };
    window.addEventListener('semester-memory-cleared', clear);
    window.addEventListener('account-draft-cleared', clear);
    return () => {
      generation.current++;
      window.removeEventListener('semester-memory-cleared', clear);
      window.removeEventListener('account-draft-cleared', clear);
    };
  }, [actor, grant.id, grant.project, grant.version]);
  async function retryRead(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (retryLock.current) return;
    retryLock.current = true;
    setRetrying(true);
    const observed = generation.current;
    const confirmed = await recheckGrantRead({
      actor,
      id: grant.id,
      project: grant.project,
      version: grant.version,
    });
    if (observed !== generation.current) return;
    retryLock.current = false;
    setRetrying(false);
    if (!confirmed) return;
    setState('active');
    setDenied(false);
  }
  useEffect(() => {
    if (grant.effective !== 'active') return;
    const ms = Math.max(0, Date.parse(grant.expiresAt) - Date.parse(now));
    if (ms > 2147483647) return;
    const timer = setTimeout(() => {
      setDenied(true);
      setState('expired');
    }, ms);
    return () => clearTimeout(timer);
  }, [grant.effective, grant.expiresAt, now]);
  return (
    <section
      className="ps-page ps-reader"
      data-template="partner-reader"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={grant.title}
        back={parent}
        backLabel={t(
          'Back to Project access',
          'العودة إلى الوصول إلى المشاريع',
        )}
      >
        <ProjectCover
          projectId={grant.project}
          versionId={grant.version}
          grant={grant.id}
          className="visual-project-thumb"
        />
        <Button asChild variant="outline">
          <Link href={'/' + locale + '/catalogue/' + grant.project}>
            {t('View public project', 'عرض المشروع العام')}
            <ArrowUpRight />
          </Link>
        </Button>
      </PartnerHeader>
      <div className="ps-reader-context">
        <Status locale={locale} value={state} />
        <span>
          {t('Expires', 'ينتهي')}:{' '}
          <Stamp locale={locale} value={grant.expiresAt} />
        </span>
        <span className="ps-muted">
          {t(
            'This approved archived version only',
            'هذه النسخة المؤرشفة المعتمدة فقط',
          )}{' '}
          · {grant.versionNumber}
        </span>
        {!denied && files.length > 0 && (
          <Button asChild variant="outline">
            <a href={url('zip')} download>
              <Download />
              {t('Download permitted ZIP', 'تنزيل ZIP المسموح')}
            </a>
          </Button>
        )}
      </div>
      {denied ? (
        <div className="ps-access-ended">
          <LockKeyhole />
          <div>
            <h2 dir="auto">
              {state === 'revoked'
                ? t('This permission was revoked', 'سُحب هذا الإذن')
                : state === 'expired'
                  ? t('This permission has expired', 'انتهت صلاحية هذا الإذن')
                  : state === 'paused'
                    ? t('Access is paused', 'الوصول موقوف')
                    : t('Access cannot be confirmed', 'تعذر تأكيد الوصول')}
            </h2>
            <p dir="auto">
              {grant.reason ??
                t(
                  'Your file reader is closed. Review current eligibility and access history.',
                  'أُغلق قارئ ملفاتك. راجع الأهلية الحالية وسجل الوصول.',
                )}
            </p>
            <div className="ps-actions">
              {['unavailable', 'unknown'].includes(state) && (
                <Button asChild variant="outline">
                  <Link
                    href={'/' + locale + '/partner/grants/' + grant.id}
                    onClick={(event) => void retryRead(event)}
                    aria-disabled={retrying}
                    tabIndex={retrying ? -1 : undefined}
                  >
                    {t('Retry file access', 'إعادة محاولة الوصول إلى الملفات')}
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={accessHub(locale, 'history', grant.project)}>
                  {t('View access history', 'عرض سجل الوصول')}
                </Link>
              </Button>
              {canRequest && ['expired', 'revoked'].includes(state) && (
                <Button asChild variant="outline">
                  <Link
                    href={
                      '/' +
                      locale +
                      '/partner/request?' +
                      new URLSearchParams({
                        project: grant.project,
                        version: grant.version,
                      })
                    }
                  >
                    {t('Request access again', 'طلب الوصول مجددًا')}
                  </Link>
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link href={'/' + locale + '/partner/eligibility'}>
                  {t('Check eligibility', 'التحقق من الأهلية')}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : files.length ? (
        <AcademicEvidence
          key={actor + grant.id + grant.version}
          locale={locale}
          actor={actor}
          project={grant.project}
          version={grant.version}
          files={files}
          readerOnly={false}
          showDownload={false}
          recordNavigation
          queryUrl={url}
          authorityUrl={'/api/partner-access?grant=' + grant.id}
          scopeKey={grant.id}
          originalLabel={t('Approved archived original', 'أصل مؤرشف معتمد')}
          readingNotice={t(
            'Read-only originals. File access does not provide a reuse licence or ownership.',
            'أصول للقراءة فقط. الوصول إلى الملفات لا يمنح ترخيص إعادة استخدام أو ملكية.',
          )}
          onDenied={() => {
            setDenied(true);
            setState('unavailable');
          }}
        />
      ) : (
        <div className="ps-empty">
          <h2 dir="auto">
            {t('No permitted files are available', 'لا تتوفر ملفات مسموح بها')}
          </h2>
          <p dir="auto">
            {t(
              'The permission is recorded, but there is no original available to read.',
              'الإذن مسجل، لكن لا يوجد أصل متاح للقراءة.',
            )}
          </p>
        </div>
      )}
    </section>
  );
}
export function PlatformOverview({
  locale,
  pending,
  grants,
  activity,
}: {
  locale: Locale;
  pending: PartnerProfile[];
  grants: AccessView['grants'];
  activity: {
    id: string;
    actor: string;
    action: string;
    occurred_at: string;
    context?: string | null;
  }[];
}) {
  const t = (e: string, a: string) => copy(locale, e, a);
  return (
    <section
      className="ps-page"
      data-template="platform-overview"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={t('Platform overview', 'نظرة عامة على المنصة')}
        description={t(
          'Eligibility decisions and exceptional access protection.',
          'قرارات الأهلية والحماية الاستثنائية للوصول.',
        )}
      />
      <div className="ps-two-columns">
        <section className="ps-section">
          <div className="ps-section-title">
            <h2 dir="auto">
              <ShieldCheck />
              {t('Eligibility awaiting review', 'أهلية تنتظر المراجعة')}{' '}
              <span className="ps-tab-count">{pending.length}</span>
            </h2>
            <Link
              href={
                '/' +
                locale +
                '/admin/platform/approvals?tab=partners&status=pending'
              }
            >
              {t('Review all', 'مراجعة الكل')}
            </Link>
          </div>
          {!!pending.length && (
            <ItemGroup>
              {pending.slice(0, 5).map((p) => (
                <Item key={p.id} role="listitem" className="ps-row">
                  <div>
                    <strong dir="auto">{p.organization}</strong>
                    <p dir="auto">{p.name}</p>
                    <Status locale={locale} value={p.status} />
                  </div>
                  <Button asChild variant="outline">
                    <Link
                      href={
                        '/' +
                        locale +
                        '/admin/platform/approvals/partners/' +
                        p.id
                      }
                    >
                      {t('Review eligibility', 'مراجعة الأهلية')}
                    </Link>
                  </Button>
                </Item>
              ))}
            </ItemGroup>
          )}
          {!pending.length && (
            <p dir="auto" className="ps-muted">
              {t(
                'No organization is awaiting a decision.',
                'لا توجد مؤسسة تنتظر قرارًا.',
              )}
            </p>
          )}
        </section>
        <section className="ps-section">
          <div className="ps-section-title">
            <h2 dir="auto">
              <LockKeyhole />
              {t('Access protection', 'حماية الوصول')}
            </h2>
            <Link href={'/' + locale + '/admin/access'}>
              {t('View permissions', 'عرض الأذونات')}
            </Link>
          </div>
          <p dir="auto" className="ps-muted">
            {t(
              'Leads approve access. Platform intervention can revoke it with a recorded reason.',
              'يعتمد القادة الوصول. يمكن لتدخل المنصة سحبه بسبب مسجل.',
            )}
          </p>
          {grants
            .filter((g) => g.state === 'active')
            .slice(0, 3)
            .map((g) => (
              <Item key={g.id} className="ps-row">
                <div>
                  <ProjectLink locale={locale} item={g} />
                  <p dir="auto">{g.organization}</p>
                  <p dir="auto">
                    {t('Expires', 'ينتهي')}:{' '}
                    <Stamp locale={locale} value={g.expiresAt} />
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href={'/' + locale + '/admin/access?grant=' + g.id}>
                    {t('Review protective action', 'مراجعة الإجراء الوقائي')}
                  </Link>
                </Button>
              </Item>
            ))}
          {!grants.some((g) => g.state === 'active') && (
            <p dir="auto" className="ps-muted">
              {t(
                'No active permissions in this authorized scope.',
                'لا توجد أذونات سارية ضمن هذا النطاق المسموح.',
              )}
            </p>
          )}
        </section>
      </div>
      <section className="ps-section">
        <div className="ps-section-title">
          <h2 dir="auto">
            {t('Recent eligibility activity', 'نشاط الأهلية الأخير')}
          </h2>
          <Link href={'/' + locale + '/audit'}>
            {t('Open scoped Audit', 'فتح التدقيق المحدد')}
          </Link>
        </div>
        {!!activity.length && (
          <ItemGroup>
            {activity.slice(0, 5).map((a) => (
              <Item key={a.id} role="listitem" className="ps-row">
                <div>
                  <p dir="auto">{a.context ?? a.actor}</p>
                  <p dir="auto">
                    {auditActionMessage(a.action, locale)} ·{' '}
                    <bdi dir="auto">{a.actor}</bdi>
                  </p>
                  <Stamp locale={locale} value={a.occurred_at} />
                </div>
              </Item>
            ))}
          </ItemGroup>
        )}
        {!activity.length && (
          <p dir="auto" className="ps-muted">
            {t(
              'No relevant activity has been recorded.',
              'لم يُسجّل نشاط ذو صلة.',
            )}
          </p>
        )}
      </section>
    </section>
  );
}
