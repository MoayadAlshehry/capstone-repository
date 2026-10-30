import 'server-only';
import { notFound } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { corrections } from '../corrections/server';
import { privateReadError } from '../semester/private-read-error';
import { ReadUnavailable, type Locale } from '../onboarding/common';
import { AdminMatters } from './admin';
import { CorrectionEditor } from './correction';
import { ReleasedFeedback } from './feedback';
import type { GovernanceView, AuthorFeedback } from './types';
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export async function sharedExperiencePage(
  actor: AccountView,
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined>,
  reviewerCapable: boolean,
) {
  const correction = path.match(
      /^\/evaluation\/corrections\/([a-f0-9-]{36})$/i,
    ),
    feedback = path.match(/^\/evaluation\/feedback\/([a-f0-9-]{36})$/i);
  if (path !== '/evaluation/issues' && !correction && !feedback) return null;
  if (
    Object.keys(query).some(
      (key) =>
        !(
          path === '/evaluation/issues'
            ? ['case', 'issue', 'command', 'task']
            : feedback
              ? ['from']
              : ['command', 'task']
        ).includes(key),
    ) ||
    Object.values(query).some(
      (value) => typeof value !== 'string' || value.length > 1400,
    )
  )
    notFound();
  if (
    (typeof query.case === 'string' && !uuid.test(query.case)) ||
    (typeof query.issue === 'string' && !uuid.test(query.issue)) ||
    (typeof query.command === 'string' && !uuid.test(query.command)) ||
    !!query.command !== !!query.task ||
    (query.case !== undefined && query.issue !== undefined) ||
    (correction && !uuid.test(correction[1]!)) ||
    (feedback && !uuid.test(feedback[1]!))
  )
    notFound();
  try {
    const engine = await corrections();
    if (feedback) {
      if (actor.role !== 'student') notFound();
      const data = await engine.feedback<AuthorFeedback>(actor, feedback[1]!);
      let backHref =
        data.context?.submission && uuid.test(data.context.submission)
          ? `/${locale}/submissions/${data.context.submission}`
          : data.context?.project && uuid.test(data.context.project)
            ? `/${locale}/projects/${data.context.project}/reviews`
            : `/${locale}/projects`;
      if (
        typeof query.from === 'string' &&
        /^\/(en|ar)\/projects\/[a-f0-9-]{36}\/(review|reviews)$/.test(
          query.from,
        ) &&
        data.context?.project &&
        query.from.includes('/projects/' + data.context.project + '/')
      )
        backHref = query.from.replace(/^\/(en|ar)/, '/' + locale);
      else if (
        typeof query.from === 'string' &&
        /^\/(en|ar)\/submissions\/[a-f0-9-]{36}$/.test(query.from) &&
        data.context?.submission &&
        query.from.split('/').at(-1) === data.context.submission
      )
        backHref = query.from.replace(/^\/(en|ar)/, '/' + locale);
      return (
        <ReleasedFeedback
          key={actor.id + ':' + feedback[1]}
          locale={locale}
          initial={data}
          backHref={backHref}
        />
      );
    }
    if (
      !['platform_admin', 'university_admin', 'faculty_supervisor'].includes(
        actor.role,
      )
    )
      notFound();
    const caseId = typeof query.case === 'string' ? query.case : undefined;
    const issueId =
      correction?.[1] ??
      (typeof query.issue === 'string' ? query.issue : undefined);
    if (
      actor.role === 'faculty_supervisor' &&
      path === '/evaluation/issues' &&
      (!issueId || caseId)
    )
      notFound();
    const commandScope =
      correction && actor.role === 'faculty_supervisor'
        ? 'correction.' + issueId
        : 'admin.' + (issueId ?? caseId ?? 'collection');
    if (query.task !== undefined && query.task !== commandScope) notFound();
    const data = await engine.view<GovernanceView>(
      actor,
      correction ? undefined : caseId,
      issueId,
    );
    const selectedIssue = issueId
      ? data.issues.find((issue) => issue.id === issueId)
      : undefined;
    if (issueId && !selectedIssue) notFound();
    if (
      actor.role === 'faculty_supervisor' &&
      path === '/evaluation/issues' &&
      !data.assessments.some(
        (assessment) =>
          assessment.logical === selectedIssue!.logical &&
          assessment.evaluator === actor.id,
      )
    )
      notFound();
    if (
      caseId &&
      !data.cases.some((item) => item.case === caseId) &&
      !data.assessments.some((item) => item.case === caseId)
    )
      notFound();
    if (correction && actor.role === 'faculty_supervisor') {
      const issue = data.issues.find((item) => item.id === correction[1])!,
        assessment = data.assessments.find(
          (item) => item.logical === issue.logical,
        );
      if (!assessment || assessment.evaluator !== actor.id) notFound();
      return (
        <CorrectionEditor
          key={actor.id + ':' + issue.id}
          locale={locale}
          actorId={actor.id}
          reviewerCapable={reviewerCapable}
          independent={assessment.layer === 'external'}
          initial={data}
          issueId={issue.id}
        />
      );
    }
    return (
      <AdminMatters
        key={actor.id + ':' + (issueId ?? caseId ?? 'collection')}
        locale={locale}
        actorId={actor.id}
        actorRole={actor.role}
        initial={data}
        {...(caseId || selectedIssue
          ? { caseId: caseId ?? selectedIssue!.case }
          : {})}
        {...(issueId ? { issueId } : {})}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NEXT_'))
      throw error;
    if (privateReadError(error).status !== 503) notFound();
    return <ReadUnavailable locale={locale} />;
  }
}
