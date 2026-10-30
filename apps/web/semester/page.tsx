import 'server-only';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { DatabaseError } from '@capstone/db';
import { submissionUuid, type CheckpointRound } from '@capstone/domain';
import { ArrowLeft } from '@capstone/ui/workspace-v2';
import { ReadUnavailable } from '../onboarding/common';
import { semester, uploadEndpoint } from './server';
import { projectOnboarding } from '../project-onboarding/server';
import { submissions } from '../submissions/server';
import { SemesterProjects } from './collection';
import { SemesterStudio } from './studio';
import { FrozenDesk } from './desk';
import { StateBadge, date, t, type Locale, type FrozenRecord } from './common';
function parent(locale: Locale, value: unknown, fallback: string) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  )
    return '/' + locale + fallback;
  try {
    const url = new URL(value, 'https://local.invalid');
    if (
      url.origin !== 'https://local.invalid' ||
      !['/projects', '/supervision', '/reviews'].includes(
        url.pathname.replace(/^\/(en|ar)/, ''),
      )
    )
      return '/' + locale + fallback;
    const query = new URLSearchParams();
    for (const k of ['q', 'page', 'selected', 'filter'])
      if (url.searchParams.has(k))
        query.set(k, url.searchParams.get(k)!.slice(0, 250));
    return (
      '/' +
      locale +
      url.pathname.replace(/^\/(en|ar)/, '') +
      (query.size ? '?' + query : '')
    );
  } catch {
    return '/' + locale + fallback;
  }
}
export async function semesterPage(
  actor: AccountView,
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined>,
) {
  const route = path.match(
      /^\/(projects|supervision\/projects)\/([a-f0-9-]{36})(?:\/(files|reviews|team|edit|review|history))?$/,
    ),
    roundRoute = path.match(
      /^\/(supervision\/rounds|submissions)\/([a-f0-9-]{36})$/,
    ),
    collection = ['/projects', '/supervision', '/reviews'].includes(path);
  if (!route && !roundRoute && !collection) return null;
  if (
    !['student', 'faculty_supervisor'].includes(actor.role) &&
    !(
      roundRoute &&
      path.startsWith('/submissions/') &&
      actor.role === 'university_admin'
    )
  )
    notFound();
  if (
    (path.startsWith('/projects') && actor.role !== 'student') ||
    ((path.startsWith('/supervision') || path === '/reviews') &&
      actor.role !== 'faculty_supervisor')
  )
    notFound();
  try {
    const engine = await semester();
    if (collection) {
      const data = await engine.collection(actor, path === '/reviews');
      if (actor.role === 'faculty_supervisor')
        for (const item of data.items) {
          const stage = item.workflow?.stage;
          item.finalTask =
            stage === 'final_screening'
              ? 'screening'
              : stage === 'committee_consensus'
                ? 'committee'
                : stage === 'faculty_decision'
                  ? 'decision'
                  : 'assessment';
        }
      return (
        <SemesterProjects
          locale={locale}
          data={data}
          faculty={actor.role === 'faculty_supervisor'}
          queue={path === '/reviews'}
          query={query}
          assignedCount={
            path === '/reviews'
              ? (await engine.collection(actor, false)).items.length
              : data.items.length
          }
        />
      );
    }
    if (roundRoute) {
      const sub = roundRoute[2]!;
      let round: FrozenRecord;
      let legacy = false;
      try {
        round = await engine.round(actor, sub);
      } catch (e) {
        if (!(e instanceof DatabaseError) || e.sqlState !== 'P0002') throw e;
        const old = await (await submissions()).read(actor, sub);
        legacy = true;
        round = {
          ...old,
          purpose: 'FINAL',
          contract: 'FINAL_LEGACY',
          number: old.round,
          state:
            old.status === 'rejected'
              ? 'retained'
              : old.status === 'archived'
                ? 'archived'
                : 'final_pending',
          canDecide: false,
          current: old.currentRound,
          decision: old.decision
            ? {
                state: old.decision.decision,
                comment: old.decision.comment,
                actor: '',
                decidedAt: old.decision.decidedAt,
              }
            : null,
        };
      }
      const destination = parent(
        locale,
        query.from,
        actor.role === 'student' ? '/projects' : '/reviews',
      );
      if (
        query.file !== undefined &&
        (!submissionUuid(query.file) ||
          !round.files.some((file) => file.id === query.file))
      )
        notFound();
      const locked =
        typeof query.command === 'string' && submissionUuid(query.command)
          ? query.command
          : undefined;
      if (locked) {
        const receipt = await engine.receipt(actor, locked);
        if (
          receipt &&
          (receipt.project !== round.project ||
            receipt.submission !== round.id ||
            !['checkpoint.changes', 'checkpoint.accept'].includes(
              receipt.operation,
            ))
        )
          notFound();
      }
      return (
        <section
          className="ss-page"
          data-locale={locale}
          data-template="checkpoint-review"
        >
          <Link className="ss-back" href={destination}>
            <ArrowLeft />
            {t(locale, 'Back to Projects', 'العودة إلى المشاريع')}
          </Link>
          <header className="ss-heading">
            <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              <p dir="auto">
                {legacy
                  ? t(
                      locale,
                      'Final submission record · read only',
                      'سجل تقديم نهائي · للقراءة فقط',
                    )
                  : t(
                      locale,
                      `Checkpoint ${round.number}`,
                      `نقطة المراجعة ${round.number}`,
                    )}
                {' · '}
                <bdi dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                  {date(locale, round.submittedAt)}
                </bdi>
              </p>
              <h1 dir="auto">{round.metadata.title}</h1>
            </div>
            <StateBadge locale={locale} state={round.state} />
          </header>
          <FrozenDesk
            key={actor.id + ':' + round.id}
            locale={locale}
            actor={actor.id}
            round={round}
            faculty={!legacy && actor.role === 'faculty_supervisor'}
            locked={locked}
            initialFile={
              typeof query.file === 'string' ? query.file : undefined
            }
          />
        </section>
      );
    }
    const pid = route![2]!,
      section = route![3] ?? 'overview',
      rootPath = '/' + route![1] + '/' + pid;
    if (['review', 'history'].includes(section)) {
      await engine.state(actor, pid);
      redirect('/' + locale + rootPath + '/reviews');
    }
    if (section === 'edit' && actor.role !== 'student') notFound();
    const state = await engine.state(actor, pid),
      team = await projectOnboarding().record(actor, pid);
    if (
      query.file !== undefined &&
      (section !== 'files' ||
        !submissionUuid(query.file) ||
        !state.files.some((file) => file.id === query.file))
    )
      notFound();
    if (state.role === 'lead' && state.workflow?.stage === 'returned') {
      const { academic } = await import('../academic/server');
      state.canResubmit = (
        await (await academic()).readiness(actor, pid)
      ).final.canSubmit;
    }
    let selectedRound: CheckpointRound | null = null;
    if (typeof query.round === 'string') {
      if (section !== 'reviews' || !submissionUuid(query.round)) notFound();
      selectedRound = await engine.round(actor, query.round);
      if (
        selectedRound.project !== pid ||
        selectedRound.version !== state.project.version
      )
        notFound();
    }
    const locked =
        typeof query.command === 'string' && submissionUuid(query.command)
          ? query.command
          : undefined,
      task = typeof query.task === 'string' ? query.task : undefined;
    if (task?.startsWith('license.')) notFound();
    if (locked) {
      const receipt = await engine.receipt(actor, locked);
      if (
        receipt &&
        (receipt.project !== pid ||
          receipt.version !== state.project.version ||
          (task === 'metadata'
            ? receipt.operation !== 'metadata.save'
            : receipt.operation !== 'checkpoint.send'))
      )
        notFound();
    }
    return (
      <SemesterStudio
        key={actor.id + ':' + pid}
        locale={locale}
        actor={actor.id}
        state={state}
        team={team}
        rootPath={rootPath}
        section={section}
        parent={parent(
          locale,
          query.from,
          actor.role === 'student' ? '/projects' : '/supervision',
        )}
        selectedRound={selectedRound}
        initialFile={typeof query.file === 'string' ? query.file : undefined}
        uploadBase={uploadEndpoint()}
        locked={locked}
        task={task}
      />
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('NEXT_')) throw e;
    if (
      e instanceof DatabaseError &&
      ['P0002', '42501', '22P02'].includes(e.sqlState ?? '')
    )
      notFound();
    return <ReadUnavailable locale={locale} />;
  }
}
