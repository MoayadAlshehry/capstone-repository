import 'server-only';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { DatabaseError } from '@capstone/db';
import type { SemesterFile } from '@capstone/domain';
import { Button } from '@capstone/ui/workspace-v2';
import { partners } from '../partners/server';
import { partnerAccess } from '../access/server';
import { discovery } from '../discovery/server';
import { nativeReader } from '../native-files/server';
import { draftView } from '../drafts/server';
import { governance } from '../governance/server';
import { administration } from '../admin/server';
import { copy, accessParent, type Locale } from './model';
import {
  PartnerOverview,
  AccessCollection,
  GrantedReader,
  PartnerHeader,
  PartnerAccessHub,
  PlatformOverview,
} from './studio';
import { Eligibility, AccessRequestPage, AccessDecision } from './forms';
import { ContextInbox, AuditRecord } from './shared';
import { knownUnavailableFile } from '../semester/private-read-error';
function AccessUnavailable({
  locale,
  kind,
  partner = false,
  path,
  back,
}: {
  locale: Locale;
  kind: 'task' | 'read';
  partner?: boolean;
  path: string;
  back?: string;
}) {
  const t = (e: string, a: string) => copy(locale, e, a);
  return (
    <section
      className="ps-page"
      data-template="access-unavailable"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={
          kind === 'task'
            ? t('This link cannot be opened', 'لا يمكن فتح هذا الرابط')
            : t('This information is unavailable', 'هذه المعلومات غير متاحة')
        }
        description={
          kind === 'task'
            ? t(
                'Return to your own workspace to check the current task or access records.',
                'عد إلى مساحة عملك للتحقق من المهمة الحالية أو سجلات الوصول.',
              )
            : t(
                'No action was confirmed. Reload to check the current server state.',
                'لم يُؤكد أي إجراء. أعد التحميل للتحقق من حالة الخادم الحالية.',
              )
        }
        back={
          back ??
          '/' +
            locale +
            (path.startsWith('/notifications/')
              ? '/notifications'
              : '/partner/access?tab=active')
        }
      />
      {kind === 'read' ? (
        <Button asChild variant="outline">
          <Link href={'/' + locale + path}>{t('Retry', 'إعادة المحاولة')}</Link>
        </Button>
      ) : partner ? (
        <Button asChild variant="outline">
          <Link href={accessHub(locale, 'history')}>
            {t('View current access', 'عرض الوصول الحالي')}
          </Link>
        </Button>
      ) : null}
    </section>
  );
}
import {
  partnerPresentation,
  eligibilityActions,
  decisionActions,
  noticeAction,
  contextualNotices,
} from './views';
import { compatibleHubQuery, accessHub } from './presentation';
const uuid = (x: unknown): x is string =>
  typeof x === 'string' &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(x);
export async function partnerStudioPage(
  actor: AccountView,
  locale: Locale,
  path: string,
  q: Record<string, string | string[] | undefined>,
) {
  const partner = path === '/partner' || path.startsWith('/partner/'),
    lead =
      path === '/access/lead' ||
      /^\/projects\/[a-f0-9-]{36}\/sharing(?:\/requests)?$/.test(path),
    oversight = path === '/admin/access',
    notice = path.match(/^\/notifications\/([a-f0-9-]{36})$/),
    inbox = path === '/notifications' && actor.role !== 'faculty_supervisor',
    audit = path === '/audit',
    overview = path === '/admin/platform/overview';
  if (
    !partner &&
    !lead &&
    !oversight &&
    !notice &&
    !inbox &&
    !audit &&
    !overview
  )
    return null;
  try {
    if (notice) {
      let target;
      try {
        const current = await noticeAction(actor, notice[1]!, locale);
        if (current.action && !current.action.href.includes('/notifications/'))
          redirect(current.action.href);
        target = await governance().target(actor, notice[1]!);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('NEXT_')) throw e;
        if (
          !knownUnavailableFile(e) &&
          !(e instanceof Error && e.message === 'NOT_FOUND')
        )
          throw e;
        return (
          <AccessUnavailable
            locale={locale}
            kind="task"
            partner={actor.role === 'partner'}
            path={path}
          />
        );
      }
      const destination =
        target.kind === 'review-task'
          ? '/reviewer/tasks/' + target.id
          : target.kind === 'evaluation-feedback'
            ? '/evaluation/feedback/' + target.id
            : target.kind === 'evaluation-governance'
              ? '/evaluation/issues?issue=' + target.id
              : target.kind === 'grant'
                ? '/partner/grants/' + target.id
                : target.kind === 'lead'
                  ? '/access/lead?project=' + target.project
                  : target.kind === 'partner-access'
                    ? '/partner/access'
                    : target.kind === 'partner'
                      ? '/partner/eligibility'
                      : target.kind === 'account'
                        ? '/account'
                        : target.kind === 'university-admin'
                          ? '/admin/university'
                          : target.kind === 'project'
                            ? (actor.role === 'faculty_supervisor'
                                ? '/supervision/projects/'
                                : '/projects/') + target.id
                            : target.kind === 'submission'
                              ? '/submissions/' + target.id
                              : target.kind === 'checkpoint'
                                ? (actor.role === 'faculty_supervisor'
                                    ? '/supervision/rounds/'
                                    : '/submissions/') + target.id
                                : null;
      if (!destination) notFound();
      redirect('/' + locale + destination);
    }
    if (inbox) {
      const data = await governance().notices(
        actor,
        q.unread === 'true',
        typeof q.before === 'string' ? q.before : undefined,
        typeof q.beforeId === 'string' ? q.beforeId : undefined,
      );
      return (
        <ContextInbox
          locale={locale}
          actor={actor.id}
          data={await contextualNotices(actor, data, locale)}
        />
      );
    }
    if (audit) {
      if (
        !['platform_admin', 'university_admin', 'faculty_supervisor'].includes(
          actor.role,
        )
      )
        notFound();
      const filters: Record<string, string> = uuid(q.project)
        ? { project: q.project }
        : {};
      const institutions =
        actor.role === 'platform_admin'
          ? (await administration().view(actor)).universities
              .filter((u) => u.status === 'active')
              .map((u) => ({
                id: u.id,
                name: locale === 'ar' ? u.name_ar : u.name_en,
              }))
          : [];
      return (
        <AuditRecord
          locale={locale}
          actor={actor.id}
          data={await governance().audit(actor, filters)}
          filters={filters}
          parent={accessParent(
            locale,
            q.from,
            actor.role === 'faculty_supervisor'
              ? '/supervision'
              : actor.role === 'platform_admin'
                ? '/admin/platform/overview'
                : '/admin/university',
          )}
          platform={actor.role === 'platform_admin'}
          institutions={institutions}
        />
      );
    }
    if (overview) {
      if (actor.role !== 'platform_admin') notFound();
      const [profiles, view, audit] = await Promise.all([
        partners().view(actor),
        partnerAccess().view(actor),
        governance().audit(actor, {}),
      ]);
      return (
        <PlatformOverview
          locale={locale}
          pending={profiles.filter((p) => p.status === 'pending')}
          grants={view.grants}
          activity={audit.items.filter((x) => x.action.startsWith('partner.'))}
        />
      );
    }
    if (partner) {
      if (actor.role !== 'partner') notFound();
      const profiles = await partners().view(actor),
        profile = profiles.find((p) => p.id === actor.id);
      if (!profile) notFound();
      const { view, grants, presentation } = await partnerPresentation(
        actor,
        profile,
        locale,
      );
      if (path === '/partner')
        return (
          <PartnerOverview
            locale={locale}
            profile={profile}
            data={presentation}
          />
        );
      if (path === '/partner/eligibility')
        return (
          <Eligibility
            locale={locale}
            actor={actor.id}
            profile={profile}
            canResubmit={eligibilityActions(profile).canResubmit}
          />
        );
      if (path === '/partner/grants')
        redirect(
          '/' + locale + '/partner/access?' + compatibleHubQuery(q, true),
        );
      if (path === '/partner/access') {
        if (
          !['active', 'pending', 'history'].includes(
            typeof q.tab === 'string' ? q.tab : '',
          )
        ) {
          const params = compatibleHubQuery(q);
          if (!q.status && !q.q && !q.page)
            params.set(
              'tab',
              typeof q.project === 'string'
                ? presentation.active.some((x) => x.project === q.project)
                  ? 'active'
                  : presentation.pending.some((x) => x.project === q.project)
                    ? 'pending'
                    : 'history'
                : 'active',
            );
          redirect('/' + locale + '/partner/access?' + params);
        }
        return <PartnerAccessHub locale={locale} data={presentation} />;
      }
      const grantRoute = path.match(/^\/partner\/grants\/([a-f0-9-]{36})$/);
      if (grantRoute) {
        const grant = grants.find((g) => g.id === grantRoute[1]);
        if (!grant)
          return (
            <AccessUnavailable
              locale={locale}
              kind="task"
              partner
              path={path}
            />
          );
        let files: SemesterFile[] = [];
        if (grant.canRead)
          try {
            files = await (
              await nativeReader()
            ).list(
              { kind: 'partner-grant', actor, grant: grant.id },
              grant.project,
              grant.version,
            );
          } catch (error) {
            if (!knownUnavailableFile(error)) throw error;
            grant.canRead = false;
            grant.effective = 'unavailable';
          }
        return (
          <GrantedReader
            key={actor.id + grant.id + grant.version + grant.effective}
            now={view.now}
            canRequest={presentation.canRequest}
            locale={locale}
            actor={actor.id}
            grant={grant}
            files={files}
            parent={
              typeof q.from === 'string' &&
              /^\/(en|ar)\/partner\/(access|grants)(?:\?|$)/.test(q.from)
                ? accessParent(locale, q.from, '/partner/access?tab=active')
                : accessHub(
                    locale,
                    grant.effective === 'active' ? 'active' : 'history',
                  )
            }
          />
        );
      }
      if (path === '/partner/request') {
        if (!uuid(q.project) || !uuid(q.version)) notFound();
        const existing = q.request
            ? view.requests.find(
                (x) =>
                  x.id === q.request &&
                  x.project === q.project &&
                  x.version === q.version,
              )
            : view.requests.find(
                (x) => x.project === q.project && x.version === q.version,
              ),
          grant =
            q.request && existing
              ? view.grants.find((g) => g.request === existing.id)
              : view.grants.find(
                  (g) => g.project === q.project && g.version === q.version,
                );
        if (q.request && !existing) notFound();
        let target;
        try {
          const p = await discovery().detail(q.project, actor);
          if (p.version !== q.version && !existing && !grant) notFound();
          target = {
            project: q.project,
            version: q.version,
            title: existing?.title ?? grant?.title ?? p.title,
            versionNumber:
              existing?.versionNumber ??
              grant?.versionNumber ??
              p.versionNumber,
            institution:
              locale === 'ar' ? p.university.nameAr : p.university.nameEn,
          };
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('NEXT_'))
            throw error;
          if (
            !knownUnavailableFile(error) &&
            !(error instanceof Error && error.message === 'NOT_FOUND')
          )
            throw error;
          if (!existing && !grant) notFound();
          const x = existing ?? grant!;
          target = {
            project: x.project,
            version: x.version,
            title: x.title,
            versionNumber: x.versionNumber,
            institution: '',
          };
        }
        return (
          <AccessRequestPage
            canRequest={
              presentation.canRequest &&
              existing?.status !== 'pending' &&
              !grants.some(
                (g) =>
                  g.project === q.project &&
                  g.version === q.version &&
                  g.effective === 'active',
              )
            }
            locale={locale}
            actor={actor.id}
            profile={profile}
            target={target}
            {...(existing ? { existing } : {})}
            {...(grant ? { grant } : {})}
            parent={accessParent(locale, q.from, '/partner/access?tab=pending')}
          />
        );
      }
      notFound();
    }
    const view = await partnerAccess().view(actor);
    if (lead) {
      if (actor.role !== 'student' || !view.lead) notFound();
      const project = path.startsWith('/projects/')
        ? path.split('/')[2]
        : q.project;
      if (project !== undefined && !uuid(project)) notFound();
      if (project) {
        const p = (await draftView(actor, project)).projects.find(
          (p) => p.id === project && p.lead,
        );
        if (!p) notFound();
      }
      const parent = accessParent(
        locale,
        q.from,
        project ? '/projects/' + project : '/projects',
      );
      if (q.request) {
        const request = view.requests.find(
          (x) => x.id === q.request && (!project || x.project === project),
        );
        if (!request) notFound();
        const grant = view.grants.find((g) => g.request === request.id);
        return (
          <AccessDecision
            actions={decisionActions(request, grant, false)}
            locale={locale}
            actor={actor.id}
            request={request}
            {...(grant ? { grant } : {})}
            parent={accessParent(
              locale,
              q.from,
              '/access/lead' + (project ? '?project=' + project : ''),
            )}
          />
        );
      }
      return (
        <AccessCollection
          locale={locale}
          view={view}
          mode="lead"
          {...(project ? { project } : {})}
          parent={parent}
        />
      );
    }
    if (oversight) {
      if (!['platform_admin', 'university_admin'].includes(actor.role))
        notFound();
      if (q.grant) {
        const grant = view.grants.find((g) => g.id === q.grant);
        if (!grant) notFound();
        return (
          <AccessDecision
            actions={decisionActions(undefined, grant, true)}
            locale={locale}
            actor={actor.id}
            grant={grant}
            protective
            parent={accessParent(locale, q.from, '/admin/access')}
          />
        );
      }
      return (
        <AccessCollection
          locale={locale}
          view={view}
          mode="oversight"
          parent={
            '/' +
            locale +
            (actor.role === 'platform_admin'
              ? '/admin/platform/overview'
              : '/admin/university')
          }
        />
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('NEXT_')) throw e;
    if (
      e instanceof DatabaseError &&
      ['42501', 'P0002', '22023'].includes(e.sqlState ?? '')
    )
      notFound();
    const back =
      '/' +
      locale +
      (actor.role === 'partner'
        ? '/partner/access?tab=active'
        : actor.role === 'platform_admin'
          ? '/admin/platform/overview'
          : actor.role === 'university_admin'
            ? '/admin/university'
            : actor.role === 'faculty_supervisor'
              ? '/supervision'
              : '/projects');
    const retry = new URLSearchParams(
      Object.entries(q).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    return (
      <AccessUnavailable
        locale={locale}
        kind="read"
        path={path + (retry.size ? '?' + retry : '')}
        back={
          path.startsWith('/notifications')
            ? '/' + locale + '/notifications'
            : back
        }
      />
    );
  }
  return null;
}
