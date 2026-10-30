import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { currentAccount } from '../auth/server';
import { accountContext, authorizedReturn } from '../auth/r3-context-server';
import { independentPage } from '../external-reviews/page';
import { routeScope, roleLanding } from './registry';
import { text, type Locale } from './navigation';
import {
  AccountOverview,
  AccountSecurity,
  type PersonalAccount,
} from '../account-entry/account';
import { PersonAccountAccess } from '../account-entry/people';
import { accountAccess } from '../account-entry/access-server';
import { newPasswordPolicy } from '@capstone/db/password-policy';
import { onboardingPage } from '../onboarding/page';
import { projectOnboardingPage } from '../project-onboarding/page';
import { ProjectInbox } from '../academic/inbox';
import { academicPage } from '../academic/page';
import { semesterPage } from '../semester/page';
import { partnerStudioPage } from '../partner-studio/page';
import { personalNavigation } from './navigation-context-server';
import { platformPage } from '../platform/page';
import { sharedExperiencePage } from '../shared-experience/page';
import { ReadUnavailable } from '../onboarding/common';
import { administrativeFilesPage } from '../semester/administrative-files';
import { legacyWorkspacePage } from './legacy-routes';
export async function workspacePage(
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined>,
) {
  const scope = routeScope(path);
  if (!scope) notFound();
  const a = await currentAccount();
  if (!a)
    redirect(
      '/' +
        locale +
        '/login?returnTo=' +
        encodeURIComponent('/' + locale + path),
    );
  const identity = await accountContext(a);
  if (!scope.roles.includes(a.role)) notFound();
  const roleNames: Record<string, readonly [string, string]> = {
    student: ['Student', 'طالب'],
    faculty_supervisor: ['Faculty / supervisor', 'عضو هيئة تدريس / مشرف'],
    university_admin: ['University administrator', 'مدير الجامعة'],
    platform_admin: ['Platform administrator', 'مدير المنصة'],
    partner: ['Partner', 'شريك'],
  };
  const personal: PersonalAccount = {
    id: a.id,
    name: a.name,
    email: a.email,
    institution: locale === 'ar' ? a.universityAr : a.university,
    role: text(roleNames[a.role] ?? ['Account', 'حساب'], locale),
    status: a.status,
    reviewer: identity.reviewerCapable,
  };
  if (path === '/account' || path === '/account/security') {
    try {
      const intent = await personalNavigation(a, identity, locale, query);
      return path === '/account' ? (
        <AccountOverview locale={locale} account={personal} intent={intent} />
      ) : (
        <AccountSecurity
          locale={locale}
          account={personal}
          policy={newPasswordPolicy}
          intent={intent}
        />
      );
    } catch {
      return <ReadUnavailable locale={locale} />;
    }
  }
  const accessResult = await partnerStudioPage(a, locale, path, query);
  if (accessResult) return accessResult;
  if (path === '/notifications')
    return (
      <ProjectInbox
        reviewer={identity.reviewerCapable && query.context === 'independent'}
        actor={a}
        locale={locale}
        page={typeof query.page === 'string' ? query.page : undefined}
        context={
          query.context === 'independent' && identity.reviewerCapable
            ? 'independent'
            : 'supervision'
        }
      />
    );
  const independentResult = await independentPage(
    a,
    locale,
    path,
    query,
    identity,
  );
  if (independentResult) return independentResult;
  const academicResult = await academicPage(a, locale, path, query);
  if (academicResult) return academicResult;
  const semesterResult = await semesterPage(a, locale, path, query);
  if (semesterResult) return semesterResult;
  const adminOriginals =
    path.match(/^\/project-records\/([a-f0-9-]{36})\/files$/i) ??
    (['version', 'submission', 'file'].some((key) => query[key] !== undefined)
      ? path.match(/^\/admin\/university\/records\/([a-f0-9-]{36})$/i)
      : null);
  if (adminOriginals && a.role === 'university_admin')
    return administrativeFilesPage(a, locale, adminOriginals[1]!, query);
  const projectResult = await projectOnboardingPage(a, locale, path, query);
  if (projectResult) return projectResult;
  const onboardingResult = await onboardingPage(a, locale, path, query);
  if (onboardingResult) return onboardingResult;
  const platformResult = await platformPage(a, locale, path, query);
  if (platformResult) return platformResult;
  const sharedResult = await sharedExperiencePage(
    a,
    locale,
    path,
    query,
    identity.reviewerCapable,
  );
  if (sharedResult) return sharedResult;
  const legacyResult = await legacyWorkspacePage(a, locale, path, query);
  if (legacyResult) return legacyResult;
  const personAccess = path.match(
    /^\/admin\/university\/people\/([a-f0-9-]{36})\/account-access$/,
  );
  if (personAccess) {
    try {
      return (
        <PersonAccountAccess
          locale={locale}
          initial={await accountAccess().person(a, personAccess[1]!)}
        />
      );
    } catch {
      notFound();
    }
  }
  if (path === '/workspace') {
    if (typeof query.returnTo === 'string') {
      const { safeAccountReturn } = await import('@capstone/db/account-mail');
      const destination = safeAccountReturn(query.returnTo, locale),
        clean = new URL(destination, 'https://return.invalid').pathname.replace(
          /^\/(en|ar)/,
          '',
        );
      const returnScope = routeScope(clean);
      if (returnScope?.slice === 'R05' && returnScope.roles.includes(a.role)) {
        const { semester } = await import('../semester/server');
        const match = clean.match(
          /^\/(?:projects|supervision\/projects)\/([a-f0-9-]{36})/,
        );
        if (match) {
          try {
            await (await semester()).state(a, match[1]!);
          } catch {
            notFound();
          }
          redirect(
            '/' +
              locale +
              clean +
              new URL(destination, 'https://return.invalid').search,
          );
        }
      }
      if (returnScope?.slice === 'R04' && returnScope.roles.includes(a.role)) {
        let valid = false;
        try {
          valid = !!(await projectOnboardingPage(
            a,
            locale,
            clean,
            Object.fromEntries(
              new URL(destination, 'https://return.invalid').searchParams,
            ),
          ));
        } catch {}
        if (valid)
          redirect(
            '/' +
              locale +
              clean +
              new URL(destination, 'https://return.invalid').search,
          );
      }
      if (returnScope?.slice === 'R03' && returnScope.roles.includes(a.role)) {
        let valid = false;
        try {
          valid = !!(await onboardingPage(
            a,
            locale,
            clean,
            Object.fromEntries(
              new URL(destination, 'https://return.invalid').searchParams,
            ),
          ));
        } catch {}
        if (valid)
          redirect(
            '/' +
              locale +
              clean +
              new URL(destination, 'https://return.invalid').search,
          );
      }
      if (clean === '/account' || clean === '/account/security')
        redirect('/' + locale + clean);
      const person = clean.match(
        /^\/admin\/university\/people\/([a-f0-9-]{36})\/account-access$/,
      );
      if (person && a.role === 'university_admin') {
        try {
          await accountAccess().person(a, person[1]!);
        } catch {
          redirect('/' + locale + roleLanding(identity));
        }
        redirect('/' + locale + clean);
      }
      if (clean === '/admin/university/people' && a.role === 'university_admin')
        redirect('/' + locale + clean);
    }
    const target =
      typeof query.returnTo === 'string'
        ? await authorizedReturn(query.returnTo, a, identity, locale)
        : null;
    redirect(target ?? '/' + locale + roleLanding(identity));
  }
  notFound();
}
