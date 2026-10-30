'use client';
import { formatScore } from '@capstone/ui/score-format';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AcademicRound } from '@capstone/domain';
import {
  Button,
  RadioGroup,
  RadioGroupItem,
  Label,
  Field,
  FieldLabel,
  Textarea,
} from '@capstone/ui/workspace-v2';
import {
  Globe,
  LockKeyhole,
  Check,
  RotateCcw,
  DecisionConfirmation,
} from '@capstone/ui/workspace-v2';

import { t, date, type Locale } from '../semester/common';
import { useSemesterMemory } from '../semester/memory';
import { AcademicCommandProtection, useAcademicCommand } from './command';
import { deniedRead } from '../semester/read-status';
export function FacultyDecision({
  locale,
  actor,
  round,
  parent,
}: {
  locale: Locale;
  actor: string;
  round: AcademicRound;
  parent: string;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    memory = useSemesterMemory(actor, round.project),
    cmd = useAcademicCommand(memory, 'decision.' + round.id, actor),
    router = useRouter(),
    [outcome, setOutcome] = useState(
      ['publish', 'revision', 'retain'].includes(
        memory['academic.outcome.' + round.id] ?? '',
      )
        ? memory['academic.outcome.' + round.id]!
        : '',
    ),
    [reason, setReason] = useState(memory['academic.reason.' + round.id] ?? ''),
    [confirm, setConfirm] = useState(false),
    [denied, setDenied] = useState(false),
    s = round.assessment ?? {
      supervisor: null,
      committee: null,
      internal: null,
      provenance: [],
      disagreement: false,
    },
    publicFiles = round.files.filter((f) => f.visibility === 'public'),
    labels = {
      publish: copy('Publish & archive', 'نشر وأرشفة'),
      revision: copy('Request final revision', 'طلب تعديل نهائي'),
      retain: copy('Retain internally', 'حفظ داخلي'),
    };
  useEffect(() => {
    let live = true;
    const clear = () => {
      setDenied(true);
      setReason('');
      setOutcome('');
      delete memory['academic.reason.' + round.id];
      delete memory['academic.outcome.' + round.id];
    };
    const check = () => {
      void fetch('/api/academic?round=' + round.id, {
        cache: 'no-store',
        headers: { 'X-Workspace-Actor': actor },
      })
        .then((r) => {
          if (deniedRead(r.status) && live) clear();
        })
        .catch(() => {});
    };
    window.addEventListener('semester-memory-cleared', clear);
    window.addEventListener('focus', check);
    const timer = setInterval(check, 30000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('semester-memory-cleared', clear);
      window.removeEventListener('focus', check);
    };
  }, [actor, memory, round.id]);
  useEffect(() => {
    if (cmd.error?.code === 'AUTHORITY_UNAVAILABLE') {
      setDenied(true);
    }
  }, [cmd.error]);
  async function commit() {
    const r = await cmd.send({
      operation: 'final.decide',
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      outcome,
      reason,
      publicManifestDigest: round.publicManifestDigest,
    });
    setConfirm(false);
    if (r) {
      delete memory['academic.reason.' + round.id];
      setConfirm(false);
      router.push(
        '/' +
          locale +
          '/submissions/' +
          round.id +
          '?from=' +
          encodeURIComponent(parent),
      );
      router.refresh();
    }
  }
  async function reconcile() {
    const r = await cmd.recheck();
    if (r) {
      setConfirm(false);
      router.push(
        '/' +
          locale +
          '/submissions/' +
          round.id +
          '?from=' +
          encodeURIComponent(parent),
      );
      router.refresh();
    }
  }
  const blocked = denied || cmd.state === 'saving' || cmd.state === 'unknown';
  const reasonLength = [...reason].length,
    invalidReason =
      reasonLength > 2000 ||
      (outcome !== 'publish' && [...reason.trim()].length < 3);
  const consequences = {
    publish: copy(
      'Publish the project and keep its final record read only. Only Public files are available without signing in.',
      'انشر المشروع واحتفظ بسجله النهائي للقراءة فقط. تُتاح الملفات العامة وحدها دون تسجيل دخول.',
    ),
    retain: copy(
      'Keep an immutable private academic record. No public project page or anonymous file access.',
      'احتفظ بسجل أكاديمي خاص وثابت. لا توجد صفحة مشروع عامة أو إتاحة ملفات دون تسجيل دخول.',
    ),
    revision: copy(
      'Return this project to private preparation. Students can revise; this assessment remains a past attempt. Nothing is published.',
      'أعد المشروع إلى الإعداد الخاص. يستطيع الطلاب التعديل؛ يبقى هذا التقييم محاولة سابقة. لا يُنشر شيء.',
    ),
  };
  return (
    <section className="ac-decision" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <AcademicCommandProtection locale={locale} command={cmd} />
      {denied && (
        <p dir="auto" role="alert">
          {copy(
            'Authority changed. Reload the final record to check your current assignment before retrying.',
            'تغيرت الصلاحية. أعد تحميل السجل النهائي للتحقق من إسنادك الحالي قبل المحاولة.',
          )}
        </p>
      )}
      <header>
        <p dir="auto" className="ac-eyebrow">
          {copy('Assigned faculty judgment', 'حكم المشرف المعيّن')} ·{' '}
          <bdi dir="auto">{round.metadata.supervisor.name}</bdi>
        </p>
        <h2 dir="auto">
          {round.decision
            ? copy('Recorded faculty decision', 'قرار المشرف المحفوظ')
            : copy('Choose the final outcome', 'اختر المصير النهائي')}
        </h2>
        <p dir="auto" className="ss-muted">
          {copy(
            'This repository assessment is not a course grade. Finalized forms do not publish this project.',
            'تقييم المستودع ليس درجة مقرر. لا تنشر النماذج المثبتة هذا المشروع.',
          )}
        </p>
      </header>
      <div className="ac-score-strip">
        {(['supervisor', 'committee', 'internal'] as const).map((key, i) => (
          <div key={key} data-emphasis={key === 'internal'}>
            <span>
              {
                [
                  copy('Supervisor assessment (S)', 'تقييم المشرف (S)'),
                  copy(
                    round.committeeWorkflow
                      ? 'System-computed committee aggregate (C)'
                      : 'Historical committee result (C)',
                    round.committeeWorkflow
                      ? 'نتيجة اللجنة المحتسبة آليًا (C)'
                      : 'نتيجة اللجنة التاريخية (C)',
                  ),
                  copy('Internal assessment (I)', 'التقييم الداخلي (I)'),
                ][i]
              }
            </span>
            <strong
              dir={s[key] === null ? 'auto' : 'ltr'}
              data-unavailable={s[key] === null || undefined}
            >
              {s[key] === null ? (
                copy('Not available', 'غير متاح')
              ) : (
                <>
                  {formatScore(s[key], locale)}
                  <small>/100</small>
                </>
              )}
            </strong>
          </div>
        ))}
      </div>
      <details className="ac-score-details">
        <summary>{copy('About the assessment', 'حول التقييم')}</summary>
        <p dir="ltr">I = 0.40 × S + 0.60 × C</p>
        <p dir="auto">
          {copy(
            'Supervisor and committee assessments contribute to the project result.',
            'يسهم تقييم المشرف وإجماع اللجنة في نتيجة المشروع.',
          )}
        </p>
        {s.provenance.map((x) => (
          <p dir="auto" key={x.assessment}>
            <bdi dir="auto">{x.name}</bdi> · {date(locale, x.recordedAt)}
          </p>
        ))}
      </details>
      {s.disagreement && (
        <p dir="auto" className="ac-disagreement" role="note">
          {copy(
            'Recorded disagreement · Both assessments remain independent. This is not an automatic publication veto.',
            'اختلاف مسجل · يبقى التقييمان مستقلين. لا يمنع هذا النشر تلقائيًا.',
          )}
        </p>
      )}
      {round.decision ? (
        <section className="af-record-decision" role="status">
          <h3 dir="auto">
            {round.decision.decision === 'archived'
              ? copy('Published & archived', 'نُشر وأُرشف')
              : round.decision.decision === 'rejected'
                ? copy('Retained internally', 'حُفظ داخليًا')
                : copy('Final revision requested', 'طُلب تعديل نهائي')}
          </h3>
          {round.decision.comment && <p dir="auto">{round.decision.comment}</p>}
          <p dir="auto">
            <bdi dir="auto">
              {round.decisionScope?.actor_name ??
                copy('Attribution unavailable', 'المصدرية غير متاحة')}
            </bdi>{' '}
            · {date(locale, round.decision.decidedAt)}
          </p>
        </section>
      ) : !round.canDecide ? (
        <p dir="auto" role="status">
          {copy(
            'This round is already decided or is unavailable to your current assignment.',
            'اتُخذ قرار هذا الإرسال أو أنه غير متاح لإسنادك الحالي.',
          )}
        </p>
      ) : (
        <>
          <RadioGroup
            value={outcome}
            disabled={blocked}
            onValueChange={(v) => {
              setOutcome(v);
              memory['academic.outcome.' + round.id] = v;
            }}
            aria-label={copy('Final outcome', 'المصير النهائي')}
            className="ac-outcomes"
          >
            {(['publish', 'revision', 'retain'] as const).map((x, i) => {
              const Icon = [Globe, RotateCcw, LockKeyhole][i]!;
              return (
                <Field
                  key={x}
                  className="ac-outcome-card"
                  data-selected={outcome === x}
                >
                  <Label htmlFor={'ac-outcome-' + x}>
                    <RadioGroupItem
                      id={'ac-outcome-' + x}
                      value={x}
                      disabled={
                        x === 'publish' && !round.publication.canPublish
                      }
                    />
                    <Icon aria-hidden="true" />
                    <span>
                      <b>{labels[x]}</b>
                      <span>{consequences[x]}</span>
                      {x === 'publish' && !round.publication.canPublish && (
                        <em>
                          {copy(
                            'Finalize the supervisor assessment and every required guest form for this exact round before publishing.',
                            'ثبّت تقييم المشرف وجميع نماذج الأعضاء المطلوبة للإرسال نفسه قبل النشر.',
                          )}
                        </em>
                      )}
                    </span>
                    {outcome === x && (
                      <Check
                        className="ac-choice-check"
                        aria-label={copy('Selected', 'مختار')}
                      />
                    )}
                  </Label>
                </Field>
              );
            })}
          </RadioGroup>
          {outcome === 'publish' && (
            <section className="ac-public-scope">
              <h3 dir="auto">
                {copy('What will be public?', 'ما الذي سيكون عامًا؟')}
              </h3>
              <p dir="auto">
                <b>
                  {publicFiles.length} {copy('Public', 'عام')} /{' '}
                  {round.files.length - publicFiles.length}{' '}
                  {copy('Restricted', 'مقيّد')}
                </b>
              </p>
              {!publicFiles.length && (
                <p dir="auto">
                  {copy(
                    'Metadata will be visible. No public files will be available.',
                    'ستظهر بيانات المشروع. لن تتوفر ملفات عامة.',
                  )}
                </p>
              )}
              <details>
                <summary>
                  {copy(
                    'Review exact file access',
                    'راجع إتاحة الملفات الدقيقة',
                  )}
                </summary>
                <ul>
                  {round.files.map((f) => (
                    <li key={f.id}>
                      <code dir="ltr">{f.path}</code>
                      <span>
                        {f.visibility === 'public'
                          ? copy('Public after publication', 'عام بعد النشر')
                          : copy('Restricted', 'مقيّد')}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              <p dir="auto" className="ss-muted">
                {copy(
                  'Public intent never overrides this immutable scope or licensing rights. Restricted originals stay private.',
                  'لا تتجاوز نية الإتاحة العامة النطاق الثابت أو حقوق الترخيص. تبقى الأصول المقيّدة خاصة.',
                )}
              </p>
              <details>
                <summary>
                  {copy(
                    'Add a judgment note (optional)',
                    'أضف ملاحظة حكم (اختيارية)',
                  )}
                </summary>
                <Textarea
                  id="ac-reason"
                  aria-label={copy(
                    'Faculty judgment note (optional)',
                    'ملاحظة حكم المشرف (اختيارية)',
                  )}
                  disabled={blocked}
                  value={reason}
                  maxLength={4000}
                  aria-invalid={reasonLength > 2000 || undefined}
                  onChange={(e) => {
                    setReason(e.target.value);
                    memory['academic.reason.' + round.id] = e.target.value;
                  }}
                />
                <p dir="auto" className="ss-muted">
                  {copy(
                    'Optional · up to 2000 characters.',
                    'اختيارية · 2000 حرف كحد أقصى.',
                  )}{' '}
                  <bdi dir="ltr">{reasonLength}/2000</bdi>
                </p>
              </details>
            </section>
          )}
          {(outcome === 'revision' || outcome === 'retain') && (
            <Field className="ac-decision-reason">
              <FieldLabel htmlFor="ac-reason">
                {outcome === 'revision'
                  ? copy('What needs to change?', 'ما الذي يحتاج إلى تعديل؟')
                  : copy('Reason for internal retention', 'سبب الحفظ الداخلي')}
              </FieldLabel>
              <Textarea
                id="ac-reason"
                disabled={blocked}
                rows={3}
                maxLength={4000}
                value={reason}
                aria-describedby="ac-reason-help"
                aria-invalid={reason.length > 0 && invalidReason}
                onChange={(e) => {
                  setReason(e.target.value);
                  memory['academic.reason.' + round.id] = e.target.value;
                }}
              />
              <p dir="auto" id="ac-reason-help" className="ss-muted">
                {copy(
                  'Required · 3–2000 characters. The assigned team sees the recorded reason.',
                  'مطلوب · 3–2000 حرف. يرى الفريق المعيّن السبب المسجل.',
                )}{' '}
                <bdi dir="ltr">{reasonLength}/2000</bdi>
              </p>
              {reason.length > 0 && [...reason.trim()].length < 3 && (
                <p dir="auto" role="alert">
                  {copy(
                    'Enter at least 3 meaningful characters.',
                    'أدخل 3 أحرف ذات معنى على الأقل.',
                  )}
                </p>
              )}
            </Field>
          )}
          {reasonLength > 2000 && (
            <p dir="auto" role="alert">
              {copy(
                'Keep the note within 2000 characters.',
                'اجعل الملاحظة ضمن 2000 حرف.',
              )}
            </p>
          )}
          {cmd.error && (
            <p dir="auto" role="alert">
              {copy(
                'Decision rejected. Recheck current scope and assignment; no outcome is claimed.',
                'رُفض القرار. تحقق من النطاق والإسناد الحاليين؛ لا يُدّعى تحقق مصير.',
              )}
            </p>
          )}
          <footer className="ac-decision-footer">
            <p dir="auto">
              {outcome
                ? consequences[outcome as keyof typeof consequences]
                : copy(
                    'Choose one outcome to review its consequences.',
                    'اختر مصيرًا واحدًا لمراجعة آثاره.',
                  )}
            </p>
            {cmd.state === 'unknown' ? (
              <>
                <p dir="auto" role="status">
                  {copy(
                    'Unknown result. Recheck the original receipt before continuing.',
                    'نتيجة غير معروفة. تحقق من الإيصال الأصلي قبل المتابعة.',
                  )}
                </p>
                <Button onClick={() => void reconcile()}>
                  {copy('Recheck original request', 'تحقق من الطلب الأصلي')}
                </Button>
              </>
            ) : (
              <Button
                disabled={!outcome || invalidReason || blocked}
                onClick={() => setConfirm(true)}
              >
                {copy('Review', 'راجع')}{' '}
                {labels[outcome as keyof typeof labels] ??
                  copy('decision', 'القرار')}
              </Button>
            )}
          </footer>
        </>
      )}
      <DecisionConfirmation
        open={confirm}
        onOpenChange={(v) => {
          if (!blocked) setConfirm(v);
        }}
        title={
          copy('Confirm', 'أكد') +
          ' ' +
          (labels[outcome as keyof typeof labels] ?? '')
        }
        description={
          <>
            <p dir="auto">
              <bdi dir="auto">{round.metadata.title}</bdi> ·{' '}
              {copy('Final submission', 'الإرسال النهائي')}
            </p>
            <p dir="auto">
              {consequences[outcome as keyof typeof consequences]}
            </p>
            {outcome === 'publish' && (
              <p dir="auto">
                {publicFiles.length} {copy('Public', 'عام')} /{' '}
                {round.files.length - publicFiles.length}{' '}
                {copy('Restricted', 'مقيّد')}.{' '}
                {!publicFiles.length &&
                  copy(
                    'Metadata only; no public ZIP.',
                    'بيانات فقط؛ لا ZIP عام.',
                  )}
              </p>
            )}
            <p dir="auto">
              {copy(
                'The recorded decision remains immutable.',
                'يبقى القرار المسجل ثابتًا.',
              )}
            </p>
            {reason && <p dir="auto">{reason}</p>}
          </>
        }
      >
        <div className="ac-confirm-actions">
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() => setConfirm(false)}
          >
            {copy('Cancel', 'إلغاء')}
          </Button>
          <Button disabled={blocked} onClick={() => void commit()}>
            {copy('Confirm', 'أكد')} {labels[outcome as keyof typeof labels]}
          </Button>
        </div>
      </DecisionConfirmation>
    </section>
  );
}
