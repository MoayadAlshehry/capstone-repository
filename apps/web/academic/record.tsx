'use client';
import { formatScore } from '@capstone/ui/score-format';
import Link from 'next/link';
import type { AcademicRound } from '@capstone/domain';
import { Button, ArrowLeft } from '@capstone/ui/workspace-v2';
import { t, date, type Locale } from '../semester/common';
import { AcademicEvidence } from './evidence';
export function FinalRecord({
  locale,
  actor,
  round,
  faculty,
  parent,
  universityAdmin = false,
  initialFile,
}: {
  locale: Locale;
  actor: string;
  round: AcademicRound;
  faculty: boolean;
  parent: string;
  universityAdmin?: boolean;
  initialFile?: string | undefined;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    decision = round.decision?.decision,
    state =
      decision === 'archived'
        ? 'published'
        : decision === 'rejected'
          ? 'retained'
          : decision === 'revision_required' ||
              round.screening?.outcome === 'returned'
            ? 'returned'
            : round.screening?.outcome === 'accepted'
              ? 'assessment'
              : 'waiting',
    titles = {
      published: copy('Published archive', 'أرشيف منشور'),
      retained: copy('Retained internally', 'محفوظ داخليًا'),
      returned: copy('Returned for changes', 'أعيد للتعديل'),
      assessment: copy('Academic assessment', 'التقييم الأكاديمي'),
      waiting: copy('Awaiting supervisor review', 'بانتظار مراجعة المشرف'),
    },
    note =
      round.screening?.outcome === 'returned'
        ? round.screening.reason
        : (round.decisionScope?.reason ?? round.decision?.comment),
    who = round.decisionScope?.actor_name ?? round.screening?.actor;
  const recordScore = round.assessment?.internal ?? round.publication.internal;
  const step = round.flow.stage,
    path =
      step === 'final_screening'
        ? 'screening'
        : step === 'supervisor_assessment'
          ? 'assessment'
          : step === 'committee_consensus'
            ? 'committee'
            : 'decision';
  return (
    <section
      className="ss-page ac-page af-final-record"
      data-template="final-record"
      data-locale={locale}
    >
      <Link className="ss-back" href={parent}>
        <ArrowLeft />
        {copy('Back to originating list', 'العودة إلى القائمة السابقة')}
      </Link>
      <header className="ss-heading">
        <div>
          <p dir="auto" className="ac-eyebrow">
            {copy('Final submission', 'الإرسال النهائي')}
          </p>
          <span className="af-record-state">{titles[state]}</span>
          <h1 dir="auto">{round.metadata.title}</h1>
          <p dir="auto">
            <bdi dir="ltr">
              {round.metadata.department.code} · {round.metadata.academicYear}
            </bdi>
          </p>
        </div>
      </header>
      <p dir="auto">
        {state === 'waiting'
          ? copy(
              'Your supervisor will check the submitted work before assessment. Files cannot be edited while this review is pending.',
              'سيتحقق المشرف من العمل المرسل قبل التقييم. لا يمكن تحرير الملفات أثناء انتظار هذه المراجعة.',
            )
          : state === 'assessment'
            ? copy(
                'The submitted work was accepted for supervisor and committee assessment. Publication remains a separate faculty decision.',
                'قُبل العمل المرسل لتقييم المشرف واللجنة. يبقى النشر قرارًا منفصلًا من المشرف.',
              )
            : state === 'returned'
              ? copy(
                  'Follow the recorded feedback in your project. This earlier submission stays unchanged when you resubmit.',
                  'تابع الملاحظات المسجلة في مشروعك. يبقى هذا الإرسال السابق دون تغيير عند إعادة الإرسال.',
                )
              : copy(
                  'This final project record is read only.',
                  'هذا السجل النهائي للمشروع للقراءة فقط.',
                )}
      </p>
      <section className="af-record-decision">
        <h2 dir="auto">{copy('Review and decision', 'المراجعة والقرار')}</h2>
        {note && <p dir="auto">{note}</p>}
        {who && (
          <p dir="auto">
            <bdi dir="auto">{who}</bdi> ·{' '}
            {date(
              locale,
              round.decision?.decidedAt ??
                round.screening?.recordedAt ??
                round.submittedAt,
            )}
          </p>
        )}
        {!who && (
          <p dir="auto">
            {copy('Submitted', 'أُرسل')} · {date(locale, round.submittedAt)}
          </p>
        )}
      </section>
      {recordScore !== null && (
        <section className="ac-score-summary">
          <h2 dir="auto">{copy('Academic assessment', 'التقييم الأكاديمي')}</h2>
          <strong>
            <bdi dir="ltr">{formatScore(recordScore, locale)}/100</bdi>
          </strong>
          <p dir="auto">
            {copy(
              'Academic project assessment, separate from course grades.',
              'تقييم المشروع الأكاديمي، منفصل عن درجات المقررات.',
            )}
          </p>
        </section>
      )}
      <div className="af-record-actions">
        {!faculty && !universityAdmin && round.evaluationCase && (
          <Button asChild variant="outline">
            <Link
              href={
                '/' +
                locale +
                '/evaluation/feedback/' +
                round.evaluationCase +
                '?from=' +
                encodeURIComponent('/' + locale + '/submissions/' + round.id)
              }
            >
              {copy('Read academic feedback', 'قراءة الملاحظات الأكاديمية')}
            </Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link
            href={
              '/' +
              locale +
              (faculty
                ? '/supervision/projects/'
                : universityAdmin
                  ? '/admin/university/projects/'
                  : '/projects/') +
              round.project +
              '?from=' +
              encodeURIComponent(parent)
            }
          >
            {copy('Open project', 'افتح المشروع')}
          </Link>
        </Button>
        {faculty &&
          round.currentRound &&
          (round.canScreen || round.canAssess) && (
            <Button asChild>
              <Link
                href={
                  '/' +
                  locale +
                  '/supervision/finals/' +
                  round.id +
                  '/' +
                  path +
                  '?from=' +
                  encodeURIComponent(parent)
                }
              >
                {path === 'screening'
                  ? copy('Review final', 'راجع الإرسال النهائي')
                  : copy('Continue assessment', 'تابع التقييم')}
              </Link>
            </Button>
          )}
        {round.publication.published && state === 'published' && (
          <Button asChild variant="outline">
            <Link href={'/' + locale + '/catalogue/' + round.project}>
              {copy('View public project', 'عرض المشروع العام')}
            </Link>
          </Button>
        )}
      </div>
      <section className="af-record-summary">
        <h2 dir="auto">{copy('Project summary', 'ملخص المشروع')}</h2>
        <p dir="auto">{round.metadata.abstract}</p>
        <p dir="auto">
          <bdi dir="ltr">
            {round.metadata.department.code} · {round.metadata.academicYear}
          </bdi>
        </p>
        <p dir="auto">
          <bdi dir="auto">{round.authors.map((x) => x.name).join(' · ')}</bdi>
        </p>
      </section>
      <section className="ac-record-files">
        <h2 dir="auto">
          {copy('Submitted project files', 'ملفات المشروع المرسلة')}
        </h2>
        <p dir="auto">
          {copy(
            'Read the original files available to your account.',
            'اقرأ الملفات الأصلية المتاحة لحسابك.',
          )}
        </p>
        <AcademicEvidence
          locale={locale}
          actor={actor}
          project={round.project}
          version={round.version}
          submission={round.id}
          files={round.files}
          initialFile={initialFile}
          readerOnly
          recordNavigation
        />
      </section>
    </section>
  );
}
