import 'server-only';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { DatabaseError } from '@capstone/db';
import { submissionUuid } from '@capstone/domain';
import { Button, ArrowLeft, LockKeyhole } from '@capstone/ui/workspace-v2';
import { academic } from './server';
import { publications } from '../publications/server';
import { FinalReadiness } from './readiness';
import { FinalRecord } from './record';
import { FinalAssessment } from './assessment';
import { FacultyDecision } from './decision';
import { t, type Locale } from '../semester/common';
import { FinalScreening } from './flow';
import { InstitutionArchive } from './archive';
import { committee } from '../committee/server';
import { SupervisorCommittee } from '../committee/supervisor';
import '../committee/committee.css';
export async function academicPage(
  actor: AccountView,
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined> = {},
) {
  const ready = path.match(/^\/projects\/([a-f0-9-]{36})\/final$/),
    task = path.match(
      /^\/supervision\/finals\/([a-f0-9-]{36})\/(screening|assessment|committee|decision)$/,
    ),
    record = path.match(/^\/submissions\/([a-f0-9-]{36})$/),
    archive = path === '/admin/university/archive';
  if (!ready && !task && !record && !archive) return null;
  const copy = (en: string, ar: string) => t(locale, en, ar);
  try {
    const engine = await academic();
    if (ready) {
      if (actor.role !== 'student') notFound();
      return (
        <FinalReadiness
          key={actor.id + ':' + ready[1]}
          locale={locale}
          actor={actor.id}
          data={await engine.readiness(actor, ready[1]!)}
        />
      );
    }
    if (archive) {
      const items = (await (await publications()).archive(actor)).items;
      const records = await Promise.all(
        items.map(async (item) => {
          const record = await engine.round(actor, item.submission);
          return {
            ...item,
            department: record.metadata.department.code,
            year: record.metadata.academicYear,
          };
        }),
      );
      return (
        <InstitutionArchive locale={locale} items={records} query={query} />
      );
    }
    const sub = task?.[1] ?? record![1]!,
      round = await engine.round(actor, sub).catch((error: unknown) => {
        // Only this validated task read shares the API's hidden-resource contract.
        // Record handling and unexpected service/framework errors retain their paths.
        if (
          task &&
          error instanceof DatabaseError &&
          error.sqlState === 'P0002'
        )
          notFound();
        throw error;
      });
    if (
      query.file !== undefined &&
      (!record ||
        !submissionUuid(query.file) ||
        !round.files.some((file) => file.id === query.file))
    )
      notFound();
    if (record)
      return (
        <FinalRecord
          key={actor.id + ':' + sub}
          locale={locale}
          actor={actor.id}
          round={round}
          parent={safeParent(locale, query.from, actor.role)}
          faculty={actor.role === 'faculty_supervisor'}
          universityAdmin={actor.role === 'university_admin'}
          initialFile={typeof query.file === 'string' ? query.file : undefined}
        />
      );
    if (
      actor.role !== 'faculty_supervisor' ||
      round.contract !== 'ACADEMIC_FINAL_V1'
    )
      notFound();
    const section = task![2]!;
    if (section === 'committee') {
      const roster = await (
        await committee()
      )
        .status(actor, sub)
        .catch((error: unknown) => {
          if (error instanceof DatabaseError && error.sqlState === '40001')
            return null;
          throw error;
        });
      if (roster)
        return (
          <SupervisorCommittee
            locale={locale}
            actor={actor.id}
            submission={sub}
            title={round.metadata.title}
            initial={roster}
            canManage={
              !!round.canAssess &&
              round.currentRound &&
              !round.decision &&
              !!round.assessment?.assessments.some(
                (a) => a.layer === 'supervisor',
              )
            }
          />
        );
    }
    if (section === 'screening')
      return (
        <FinalScreening
          locale={locale}
          actor={actor.id}
          round={round}
          parent={safeParent(locale, query.from, actor.role)}
        />
      );
    if (
      (!round.assessment &&
        !(
          section === 'decision' &&
          round.committeeWorkflow &&
          round.canDecide
        )) ||
      (round.flow.stage === 'final_screening' &&
        !(
          section === 'decision' &&
          round.committeeWorkflow &&
          round.canDecide
        )) ||
      round.screening?.outcome === 'returned'
    )
      redirect(
        '/' +
          locale +
          '/supervision/finals/' +
          sub +
          '/screening?from=' +
          encodeURIComponent(safeParent(locale, query.from, actor.role)),
      );
    const supervisorScored = round.assessment?.assessments.some(
        (a) => a.layer === 'supervisor',
      ),
      committeeScored = round.assessment?.committee != null;
    if (
      section === 'decision' &&
      !round.committeeWorkflow &&
      !round.decision &&
      !(supervisorScored && committeeScored)
    )
      redirect(
        '/' +
          locale +
          '/supervision/finals/' +
          sub +
          '/' +
          (supervisorScored ? 'committee' : 'assessment') +
          '?from=' +
          encodeURIComponent(safeParent(locale, query.from, actor.role)),
      );
    if (section === 'assessment' || section === 'committee')
      return (
        <section
          className="ss-page as-page"
          data-template={
            section === 'committee' ? 'committee-assessment' : 'assessment-desk'
          }
          data-locale={locale}
        >
          <FinalAssessment
            key={actor.id + ':' + sub + ':' + section}
            locale={locale}
            actor={actor.id}
            round={round}
            parent={safeParent(locale, query.from, actor.role)}
            layer={section === 'committee' ? 'committee' : 'supervisor'}
          />
        </section>
      );
    return (
      <section
        className="ss-page ac-page"
        data-template={
          section === 'decision' ? 'faculty-decision' : 'assessment-desk'
        }
        data-locale={locale}
      >
        <Link
          className="ss-back"
          href={safeParent(locale, query.from, actor.role)}
        >
          <ArrowLeft />
          {copy('Back to originating list', 'العودة إلى القائمة السابقة')}
        </Link>
        <header className="ss-heading">
          <div>
            <h1 dir="auto">{round.metadata.title}</h1>
          </div>
        </header>
        <Link
          className="af-project-return"
          href={
            '/' +
            locale +
            '/supervision/projects/' +
            round.project +
            '?from=' +
            encodeURIComponent(safeParent(locale, query.from, actor.role))
          }
        >
          {copy('Project overview', 'نظرة عامة على المشروع')}
        </Link>
        <nav
          className="ac-task-tabs"
          aria-label={copy('Final review tasks', 'مهام المراجعة النهائية')}
        >
          {(['assessment', 'committee', 'decision'] as const).map((x) =>
            (x === 'committee' && !supervisorScored) ||
            (x === 'decision' &&
              !round.committeeWorkflow &&
              !(supervisorScored && committeeScored)) ? (
              <Button
                key={x}
                disabled
                title={copy(
                  x === 'committee'
                    ? 'Finalize supervisor assessment first'
                    : 'Finalize both assessments before the publication decision',
                  x === 'committee'
                    ? 'ثبّت تقييم المشرف أولًا'
                    : 'ثبّت التقييمين قبل قرار النشر',
                )}
              >
                <LockKeyhole aria-hidden="true" />
                {x === 'committee'
                  ? copy('Committee assessments', 'تقييمات اللجنة')
                  : copy('Faculty decision', 'قرار المشرف')}
              </Button>
            ) : (
              <Button
                disabled={
                  x === 'committee'
                    ? !round.assessment?.assessments.some(
                        (a) => a.layer === 'supervisor',
                      )
                    : x === 'decision'
                      ? !round.canDecide
                      : false
                }
                key={x}
                variant={section === x ? 'secondary' : 'outline'}
                asChild
              >
                <Link
                  aria-current={section === x ? 'step' : undefined}
                  href={
                    '/' +
                    locale +
                    '/supervision/finals/' +
                    sub +
                    '/' +
                    x +
                    '?from=' +
                    encodeURIComponent(
                      safeParent(locale, query.from, actor.role),
                    )
                  }
                >
                  {(
                    x === 'assessment'
                      ? supervisorScored
                      : x === 'committee'
                        ? committeeScored
                        : !!round.decision
                  )
                    ? '✓ '
                    : ''}
                  {x === 'assessment'
                    ? copy('Supervisor assessment', 'تقييم المشرف')
                    : x === 'committee'
                      ? copy('Committee assessments', 'تقييمات اللجنة')
                      : copy('Faculty decision', 'قرار المشرف')}
                </Link>
              </Button>
            ),
          )}
        </nav>
        <FacultyDecision
          locale={locale}
          actor={actor.id}
          round={round}
          parent={safeParent(locale, query.from, actor.role)}
        />
      </section>
    );
  } catch (e) {
    if (ready && e instanceof DatabaseError && e.sqlState === 'P0002')
      notFound();
    if (record && e instanceof DatabaseError && e.sqlState === 'P0002')
      return null;
    throw e;
  }
}

function safeParent(locale: Locale, input: unknown, role: string) {
  const fallback =
    '/' +
    locale +
    (role === 'faculty_supervisor'
      ? '/supervision'
      : role === 'university_admin'
        ? '/admin/university/archive'
        : '/projects');
  if (
    typeof input !== 'string' ||
    !input.startsWith('/') ||
    input.startsWith('//') ||
    /[\\\r\n]/.test(input)
  )
    return fallback;
  const url = new URL(input, 'https://local.invalid');
  const parentPath = url.pathname.replace(/^\/(en|ar)/, '');
  const committeeParent =
    (role === 'university_admin' &&
      parentPath === '/admin/university/committee-assessments') ||
    (role === 'faculty_supervisor' &&
      /^\/supervision\/finals\/[a-f0-9-]{36}\/committee$/.test(parentPath));
  if (
    url.origin !== 'https://local.invalid' ||
    (!committeeParent &&
      ![
        '/projects',
        '/supervision',
        '/reviews',
        '/admin/university/archive',
      ].includes(parentPath))
  )
    return fallback;
  const q = new URLSearchParams();
  for (const k of ['q', 'page', 'selected', 'filter'])
    if (url.searchParams.has(k))
      q.set(k, url.searchParams.get(k)!.slice(0, 250));
  return (
    '/' +
    locale +
    url.pathname.replace(/^\/(en|ar)/, '') +
    (q.size ? '?' + q : '')
  );
}
