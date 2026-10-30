import 'server-only';
import { notFound, redirect } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { submissionUuid } from '@capstone/domain';
import { editions } from '../editions/server';
import { submissions } from '../submissions/server';
import { nativeReader } from '../native-files/server';
import { onboarding } from '../onboarding/server';
import { projectOnboarding } from '../project-onboarding/server';
import { ReadUnavailable } from '../onboarding/common';
import { confirmedUnavailableReturn } from './return-read';
import type { Locale } from './navigation';

/** Identified links from the replaced presentation resolve to actual supported tasks. */
export async function legacyWorkspacePage(
  actor: AccountView,
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined>,
) {
  const approval = path.match(
    /^\/admin\/platform\/(partners|reviewers)(?:\/([a-f0-9-]{36}))?$/i,
  );
  const oldPerson = path.match(/^\/admin\/university\/([a-f0-9-]{36})$/i);
  const assignment = path.match(
    /^\/admin\/university\/assignments(?:\/(new|[a-f0-9-]{36}))?$/i,
  );
  const project = path.match(
    /^\/project-records(?:\/([a-f0-9-]{36})(?:\/(files|sharing|packets))?)?$/i,
  );
  const authorFile = path.match(/^\/projects\/([a-f0-9-]{36})\/packets$/i);
  const oldScore = path.match(
    /^\/supervision\/rounds\/([a-f0-9-]{36})\/(assessment|committee|decision)$/i,
  );
  if (
    !approval &&
    !oldPerson &&
    !assignment &&
    !project &&
    !authorFile &&
    !oldScore
  )
    return null;
  try {
    if (approval) {
      if (actor.role !== 'platform_admin') notFound();
      if (approval[2]) {
        await onboarding().approvals(actor, approval[1]!, approval[2]!);
        redirect(
          `/${locale}/admin/platform/approvals/${approval[1]}/${approval[2]}`,
        );
      }
      redirect(`/${locale}/admin/platform/approvals?tab=${approval[1]}`);
    }
    if (oldPerson) {
      if (actor.role !== 'university_admin') notFound();
      await onboarding().read(actor, 'person', oldPerson[1]!);
      redirect(`/${locale}/admin/university/people/${oldPerson[1]}`);
    }
    if (assignment) {
      if (actor.role !== 'university_admin') notFound();
      if (!assignment[1]) redirect(`/${locale}/admin/university`);
      if (assignment[1] === 'new')
        redirect(`/${locale}/admin/university/projects/new`);
      await projectOnboarding().record(actor, assignment[1]!);
      redirect(`/${locale}/admin/university/projects/${assignment[1]}`);
    }
    if (oldScore) {
      if (actor.role !== 'faculty_supervisor') notFound();
      const { academic } = await import('../academic/server');
      const round = await (await academic()).round(actor, oldScore[1]!);
      redirect(
        round.contract === 'ACADEMIC_FINAL_V1'
          ? `/${locale}/supervision/finals/${round.id}/${oldScore[2]}`
          : `/${locale}/submissions/${round.id}`,
      );
    }
    const id = authorFile?.[1] ?? project?.[1];
    if (!id)
      redirect(
        '/' +
          locale +
          ({
            student: '/projects',
            faculty_supervisor: '/supervision',
            university_admin: '/admin/university',
          }[actor.role] ?? '/account'),
      );
    if (!submissionUuid(id)) notFound();
    const history = await (await editions()).history(actor, id);
    const version =
      typeof query.version === 'string'
        ? query.version
        : history.currentVersion;
    if (
      !submissionUuid(version) ||
      !history.items.some((item) => item.id === version)
    )
      notFound();
    const requested = query.submission;
    if (requested !== undefined && !submissionUuid(requested)) notFound();
    const file = query.file;
    if (file !== undefined && !submissionUuid(file)) notFound();
    const edition = history.items.find((item) => item.id === version)!;
    const snapshot =
      typeof requested === 'string'
        ? requested
        : version !== history.currentVersion
          ? (edition.approvedSubmission ?? edition.submission)
          : undefined;
    if (snapshot) {
      const record = await (await submissions()).read(actor, snapshot);
      if (
        record.project !== id ||
        record.version !== version ||
        (typeof file === 'string' &&
          !record.files.some((item) => item.id === file))
      )
        notFound();
      redirect(
        `/${locale}/submissions/${snapshot}` +
          (typeof file === 'string' ? '?file=' + file : ''),
      );
    }
    if (version !== history.currentVersion) notFound();
    if (typeof file === 'string')
      await (await nativeReader()).metadata(actor, id, version, file);
    const files = !!authorFile || !!project?.[2];
    const target =
      actor.role === 'student'
        ? `/projects/${id}`
        : actor.role === 'faculty_supervisor'
          ? `/supervision/projects/${id}`
          : `/admin/university/projects/${id}`;
    if (actor.role === 'university_admin') {
      await projectOnboarding().record(actor, id);
      redirect(
        '/' + locale + (files ? `/project-records/${id}/files` : target),
      );
    }
    const { semester } = await import('../semester/server');
    await (await semester()).state(actor, id);
    redirect(
      '/' +
        locale +
        target +
        (files ? '/files' : '') +
        (typeof file === 'string' ? '?file=' + file : ''),
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NEXT_'))
      throw error;
    if (confirmedUnavailableReturn(error)) notFound();
    return <ReadUnavailable locale={locale} />;
  }
}
