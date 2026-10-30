import 'server-only';
import type { AccountView } from '@capstone/db/auth';
import { partnerAccess } from '../access/server';
import { semester } from '../semester/server';
import { nativeReader } from '../native-files/server';
import { projectPath, type Project, type Locale } from './core';
export type PublicEntry = { kind: string; href: string; registration?: string };
export async function publicAccess(
  account: AccountView | null,
  p: Project,
  locale: Locale,
): Promise<PublicEntry> {
  const from = projectPath(locale, p.project),
    request = `/${locale}/partner/request?${new URLSearchParams({ project: p.project, version: p.version, from })}`;
  try {
    if (!account)
      return {
        kind: 'signIn',
        href: `/${locale}/login?returnTo=${encodeURIComponent(request)}`,
        registration: `/${locale}/partner/register?returnTo=${encodeURIComponent(request)}`,
      };
    if (account.role === 'partner') {
      const view = await partnerAccess().view(account);
      if (account.partnerStatus !== 'approved')
        return {
          kind: 'reviewEligibility',
          href: `/${locale}/partner/eligibility?from=${encodeURIComponent(from)}`,
        };
      const grant = view.grants.find(
        (x) => x.project === p.project && x.version === p.version && x.canRead,
      );
      if (grant) {
        await (
          await nativeReader()
        ).list(
          { kind: 'partner-grant', actor: account, grant: grant.id },
          p.project,
          p.version,
        );
        return {
          kind: 'openGranted',
          href: `/${locale}/partner/grants/${grant.id}?from=${encodeURIComponent(from)}`,
        };
      }
      if (
        view.requests.some(
          (x) =>
            x.project === p.project &&
            x.version === p.version &&
            x.status === 'pending',
        )
      )
        return {
          kind: 'viewRequest',
          href: `/${locale}/partner/access?${new URLSearchParams({ project: p.project, tab: 'pending', from })}`,
        };
      return {
        kind: view.grants.some((x) => x.project === p.project)
          ? 'requestAgain'
          : 'request',
        href: request,
      };
    }
    if (
      ['student', 'faculty_supervisor'].includes(account.role) &&
      (await (await semester()).collection(account)).items.some(
        (x) => x.id === p.project,
      )
    )
      return {
        kind: 'openWorkspace',
        href: `/${locale}/${account.role === 'student' ? 'projects' : 'supervision/projects'}/${p.project}`,
      };
    return { kind: 'none', href: '' };
  } catch {
    return { kind: 'failed', href: from + '#public-files' };
  }
}
