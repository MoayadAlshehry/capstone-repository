import 'server-only';
import type { AccountView } from '@capstone/db/auth';
import { DatabaseError } from '@capstone/db';
import type { Locale, WorkspaceIdentity } from './navigation';
import { confirmedUnavailableReturn } from './return-read';
import {
  resolveNavigationContext,
  contextLanding,
  type NavigationContext,
} from './navigation-context';
export async function personalNavigation(
  a: AccountView,
  identity: WorkspaceIdentity,
  locale: Locale,
  query: { context?: unknown; returnTo?: unknown },
): Promise<NavigationContext> {
  const intent = resolveNavigationContext(identity, locale, query),
    path = intent.returnTo.split('?')[0]!.replace(/^\/(en|ar)/, '');
  try {
    const correction = path.match(
      /^\/evaluation\/corrections\/([a-f0-9-]{36})$/i,
    );
    if (correction) {
      const { corrections } = await import('../corrections/server');
      const { issues, assessments } = await (
        await corrections()
      ).view<import('../shared-experience/types').GovernanceView>(
        a,
        undefined,
        correction[1]!,
      );
      const issue = issues.find((item) => item.id === correction[1]);
      const own = assessments.find(
        (item) => item.logical === issue?.logical && item.evaluator === a.id,
      );
      if (!own || a.role !== 'faculty_supervisor')
        throw Error('RETURN_UNAVAILABLE');
      const context =
        own.layer === 'external' && identity.reviewerCapable
          ? 'independent'
          : 'supervision';
      return {
        ...intent,
        context,
        warning: intent.warning || intent.context !== context,
      };
    }
    let match = path.match(/^\/reviewer\/tasks\/([a-f0-9-]{36})$/);
    if (match) {
      const { externalReviews } = await import('../external-reviews/server');
      await (await externalReviews()).view(a, match[1]!);
    }
    match = path.match(/^\/supervision\/finals\/([a-f0-9-]{36})/);
    if (match) {
      const { academic } = await import('../academic/server');
      await (await academic()).round(a, match[1]!);
    }
    match = path.match(
      /^\/(?:projects|supervision\/projects)\/([a-f0-9-]{36})/,
    );
    if (match) {
      const { semester } = await import('../semester/server');
      await (await semester()).state(a, match[1]!);
    }
    match = path.match(
      /^\/(?:submissions|supervision\/rounds)\/([a-f0-9-]{36})$/,
    );
    if (match) {
      const { semester } = await import('../semester/server');
      try {
        await (await semester()).round(a, match[1]!);
      } catch (error) {
        if (!(error instanceof DatabaseError) || error.sqlState !== 'P0002')
          throw error;
        const { submissions } = await import('../submissions/server');
        await (await submissions()).read(a, match[1]!);
      }
    }
    match = path.match(/^\/partner\/grants\/([a-f0-9-]{36})$/);
    if (match) {
      const { partnerAccess } = await import('../access/server');
      const grant = (await partnerAccess().view(a)).grants.find(
        (g) => g.id === match![1],
      );
      if (!grant?.canRead) throw Error('RETURN_UNAVAILABLE');
    }
    match = path.match(
      /^\/admin\/platform\/approvals\/(partners|reviewers)\/([a-f0-9-]{36})$/,
    );
    if (match) {
      const { onboarding } = await import('../onboarding/server');
      await onboarding().approvals(a, match[1]!, match[2]!);
    }
    match = path.match(/^\/admin\/university\/people\/([a-f0-9-]{36})/);
    if (match) {
      const { onboarding } = await import('../onboarding/server');
      await onboarding().read(a, 'person', match[1]!);
    }
    if (path === '/access/lead') {
      const { partnerAccess } = await import('../access/server');
      const uri = new URL(intent.returnTo, 'https://local.invalid'),
        view = await partnerAccess().view(a);
      if (
        !view.requests.some(
          (r) =>
            r.project === uri.searchParams.get('project') &&
            (!uri.searchParams.has('request') ||
              r.id === uri.searchParams.get('request')),
        )
      )
        throw Error('RETURN_UNAVAILABLE');
    }
    match = path.match(
      /^\/admin\/university\/projects\/(?:created\/)?([a-f0-9-]{36})$/,
    );
    if (match) {
      const { projectOnboarding } =
        await import('../project-onboarding/server');
      const project = path.includes('/created/')
        ? (await projectOnboarding().receipt(a, match[1]!))?.id
        : match[1]!;
      if (!project) throw Error('RETURN_UNAVAILABLE');
      await projectOnboarding().record(a, project);
    }
    match = path.match(/^\/admin\/platform\/([a-f0-9-]{36})(?:\/|$)/);
    if (match) {
      const { onboarding } = await import('../onboarding/server');
      await onboarding().read(a, 'university', match[1]!);
    }
  } catch (error) {
    if (!confirmedUnavailableReturn(error)) throw error;
    return {
      ...intent,
      returnTo: contextLanding(identity, locale, intent.context),
      warning: true,
    };
  }
  return intent;
}
