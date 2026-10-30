'use client';
import { formatScore } from '@capstone/ui/score-format';
import Link from 'next/link';
import { coreRubric } from '@capstone/domain';
import { externalRubric } from '@capstone/domain/external-reviews';
import {
  AssessmentSummary,
  Button,
  type RubricCriterionView,
  type AssessmentLevel,
} from '@capstone/ui/workspace-v2';
import { t, type Locale } from '../semester/common';
import type { AuthorFeedback, FeedbackAssessment } from './types';

export function ReleasedFeedback({
  locale,
  initial,
  backHref,
}: {
  locale: Locale;
  initial: AuthorFeedback;
  backHref: string;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar);
  const panel = (
    assessment: FeedbackAssessment,
    external: boolean,
    position: number,
  ) => {
    const rubric = external ? externalRubric : coreRubric;
    const derived = assessment.form.kind === 'committee_aggregate';
    const criteria: RubricCriterionView[] = rubric.criteria.map(
      (criterion) => ({
        key: criterion.code,
        title: criterion.label[locale],
        weight: criterion.weight,
        intent: criterion.description[locale],
        anchors: criterion.anchors.map((anchor) => ({
          level: anchor.level as AssessmentLevel,
          label: external
            ? copy('Level ' + anchor.level, 'المستوى ' + anchor.level)
            : coreRubric.levels[locale][anchor.level]!,
          detail: anchor[locale],
        })),
      }),
    );
    const title = external
      ? copy(
          'Independent review ' + (assessment.label ?? position + 1),
          'التقييم المستقل ' + (assessment.label ?? position + 1),
        )
      : assessment.layer === 'committee'
        ? derived
          ? copy(
              'System-computed committee aggregate',
              'نتيجة اللجنة المحتسبة آليًا',
            )
          : copy('Historical committee result', 'نتيجة اللجنة التاريخية')
        : copy('Supervisor assessment', 'تقييم المشرف');
    return (
      <section
        key={(external ? 'external' : 'internal') + position}
        className="ss-card"
      >
        <h2 dir="auto">{title}</h2>
        <p dir="auto">
          <bdi dir="ltr">{formatScore(assessment.score, locale)}/100</bdi>
          {assessment.corrected
            ? ' · ' + copy('Corrected record', 'سجل مصحح')
            : ''}
        </p>
        <p dir="auto">
          {derived
            ? copy(
                'The unrounded mean of every required verified member form. This does not assert unanimous agreement.',
                'المتوسط غير المقرب لجميع نماذج الأعضاء المطلوبة والموثقة. لا يعني ذلك الإجماع.',
              )
            : assessment.form.overall ||
              copy('No overall comment recorded.', 'لم يُسجل تعليق عام.')}
        </p>
        <details className="ss-snapshot-details">
          <summary>
            {copy('View criterion feedback', 'عرض ملاحظات المعايير')}
          </summary>
          <AssessmentSummary
            derived={derived}
            locale={locale}
            title={title}
            total={String(assessment.score)}
            rubric={rubric.code}
            criteria={criteria}
            values={criteria.map((criterion) => {
              const value = (assessment.form.criteria ?? []).find(
                (item) => item.code === criterion.key,
              );
              return {
                level: value?.level ?? null,
                note: derived
                  ? copy(
                      'Derived display-only mean, not an individual integer rating.',
                      'متوسط مشتق للعرض فقط، وليس تقييمًا فرديًا صحيحًا.',
                    )
                  : (value?.comment ?? ''),
              };
            })}
          />
        </details>
      </section>
    );
  };
  return (
    <section
      className="ss-page ac-page"
      data-template="academic-feedback"
      data-locale={locale}
    >
      <Button asChild variant="outline">
        <Link href={backHref}>
          {copy('Back to your project', 'العودة إلى مشروعك')}
        </Link>
      </Button>
      <header className="ss-heading">
        <div>
          <h1 dir="auto">
            {copy('Academic feedback', 'الملاحظات الأكاديمية')}
          </h1>
          {initial.context?.title && <p dir="auto">{initial.context.title}</p>}
          <p dir="auto">
            {copy(
              'Read-only feedback for your project. Independent evaluator identities are concealed; only released independent feedback appears.',
              'ملاحظات للقراءة فقط على مشروعك. تُحجب هويات المقيمين المستقلين؛ وتظهر الملاحظات المستقلة التي أُتيح عرضها فقط.',
            )}
          </p>
        </div>
      </header>
      <section>
        <h2 dir="auto">{copy('Internal assessments', 'التقييمات الداخلية')}</h2>
        {initial.internal.map((assessment, position) =>
          panel(assessment, false, position),
        )}
        {!initial.internal.length && (
          <p dir="auto">
            {copy(
              'No internal feedback is recorded yet.',
              'لم تُسجل ملاحظات داخلية بعد.',
            )}
          </p>
        )}
      </section>
      <section>
        <h2 dir="auto">{copy('Independent feedback', 'الملاحظات المستقلة')}</h2>
        {initial.externalReleased ? (
          initial.external.map((assessment, position) =>
            panel(assessment, true, position),
          )
        ) : (
          <p dir="auto" role="status">
            {copy(
              'Independent feedback has not been released. Unreleased scores and evaluator identities are not shown.',
              'لم تُتح الملاحظات المستقلة للعرض. لا تظهر الدرجات غير المتاحة أو هويات المقيمين.',
            )}
          </p>
        )}
      </section>
      <p dir="auto" className="ss-muted">
        {copy(
          'These repository assessments are separate from official course grades. Original records and appended corrections remain attributable.',
          'هذه تقييمات المستودع، وهي منفصلة عن درجات المقررات الرسمية. تبقى السجلات الأصلية والتصحيحات الملحقة منسوبة إلى مصادرها.',
        )}
      </p>
    </section>
  );
}
