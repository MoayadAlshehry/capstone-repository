import 'server-only';
import { notFound } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import type { ReviewTask } from '@capstone/domain/external-reviews';
import type { Locale } from '../semester/common';
import { externalReviews } from './server';
import { reviewers } from '../reviewers/server';
import { ReviewerProfileForm } from '../reviewers/profile';
import { ReadUnavailable } from '../onboarding/common';
import { privateReadError } from '../semester/private-read-error';
import { personalNavigation } from '../workspace-v2/navigation-context-server';
import { personalHref } from '../workspace-v2/navigation-context';
import type { WorkspaceIdentity } from '../workspace-v2/navigation';
import {
  IndependentTasks,
  IndependentOffer,
  IndependentDesk,
  IndependentResult,
} from './studio';
function parent(locale: Locale, input: unknown) {
  const fallback = '/' + locale + '/reviewer';
  if (
    typeof input !== 'string' ||
    !/^\/(en|ar)\/reviewer(?:\?|$)/.test(input) ||
    /[\\\r\n]/.test(input)
  )
    return fallback;
  const u = new URL(input, 'https://local.invalid'),
    q = new URLSearchParams();
  if (
    ['offers', 'progress', 'history'].includes(u.searchParams.get('tab') ?? '')
  )
    q.set('tab', u.searchParams.get('tab')!);
  if (u.searchParams.has('q'))
    q.set('q', u.searchParams.get('q')!.slice(0, 250));
  return fallback + (q.size ? '?' + q : '');
}
export async function independentPage(
  actor: AccountView,
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined>,
  identity: WorkspaceIdentity,
) {
  if (path === '/reviewer/profile') {
    if (actor.role !== 'faculty_supervisor') notFound();
    const model = await reviewers().view(actor);
    const intent = await personalNavigation(actor, identity, locale, {
      context:
        query.context ??
        (identity.reviewerCapable ? 'independent' : 'supervision'),
      returnTo: query.returnTo ?? '/' + locale + '/reviewer/profile',
    });
    return (
      <ReviewerProfileForm
        locale={locale}
        actor={actor.id}
        profile={model.profiles.find((p) => p.id === actor.id) ?? null}
        intent={intent}
        reviewerCapable={identity.reviewerCapable}
        backHref={personalHref(locale, 'account', intent)}
      />
    );
  }
  if (
    !['/reviewer', '/reviewer/history'].includes(path) &&
    !/^\/reviewer\/tasks\/[a-f0-9-]{36}$/.test(path)
  )
    return null;
  const service = await externalReviews();
  if (path === '/reviewer' || path === '/reviewer/history') {
    try {
      const [tasks, reviewerModel] = await Promise.all([
        service.view(actor),
        reviewers().view(actor),
      ]);
      const model = tasks as {
        items: ReviewTask[];
        serverTime: string;
      };
      return (
        <IndependentTasks
          locale={locale}
          actor={actor.id}
          model={model}
          calibrationRequired={
            reviewerModel.profiles.find((p) => p.id === actor.id)
              ?.calibrationVersion !== 'EXTERNAL_V1'
          }
          tab={
            path === '/reviewer/history'
              ? 'history'
              : typeof query.tab === 'string'
                ? query.tab
                : 'offers'
          }
          search={typeof query.q === 'string' ? query.q : ''}
        />
      );
    } catch (error) {
      if (privateReadError(error).status === 404) notFound();
      return <ReadUnavailable locale={locale} />;
    }
  }
  let task: ReviewTask;
  try {
    task = (await service.view(actor, path.split('/').at(-1)!)) as ReviewTask;
  } catch (error) {
    if (privateReadError(error).status === 404) notFound();
    return <ReadUnavailable locale={locale} />;
  }
  const back = parent(locale, query.from),
    props = { locale, actor: actor.id, task, parent: back };
  if (task.status === 'offered') return <IndependentOffer {...props} />;
  if (task.status === 'accepted') return <IndependentDesk {...props} />;
  return <IndependentResult {...props} name={actor.name} />;
}
