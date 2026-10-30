'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import {
  academicDraftSchema,
  assessmentIssues,
  finalizedInput,
  emptyAcademicDraft,
  type AcademicDraft,
  type AcademicRound,
} from '@capstone/domain';
import {
  Button,
  Field,
  FieldLabel,
  FieldError,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Plus,
  DecisionConfirmation,
} from '@capstone/ui/workspace-v2';
import { t, date, type Locale } from '../semester/common';
import { useSemesterMemory } from '../semester/memory';
import {
  isFinalAssessmentReceipt,
  validAssessmentTotal,
  assessmentSummaryTotal,
} from './receipt-model';
import { assessmentSaveLabel } from '../assessment-studio/view';
import { AcademicEvidence } from './evidence';
import { AcademicCommandProtection, useAcademicCommand } from './command';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
import { deniedRead } from '../semester/read-status';
import { RequestAssessmentReview } from '../shared-experience/correction';
import {
  AcademicAssessmentWorkspace,
  AssessmentCriterionPanel,
  AssessmentSummary,
  type RubricCriterionView,
  type AssessmentLevel,
} from '@capstone/ui/workspace-v2';
const draftSignature = (value: unknown) => {
  const parsed = academicDraftSchema.safeParse(value);
  return parsed.success ? JSON.stringify(parsed.data) : null;
};
export function FinalAssessment({
  locale,
  actor,
  round,
  parent,
  layer,
}: {
  locale: Locale;
  actor: string;
  round: AcademicRound;
  parent: string;
  layer: 'supervisor' | 'committee';
}) {
  const governed = round.committeeWorkflow === true;
  const copy = (en: string, ar: string) => t(locale, en, ar),
    memory = useSemesterMemory(actor, round.project),
    key = 'academic.form.' + round.id + '.' + layer,
    server = round.assessment!.drafts.find((x) => x.layer === layer),
    router = useRouter();
  const initial = (): AcademicDraft => {
    try {
      const p = academicDraftSchema.safeParse(
        JSON.parse(memory[key] ?? 'null'),
      );
      if (p.success && p.data.layer === layer)
        return { ...p.data, inputContract: 'SCORES_ONLY_V3' };
    } catch {}
    return {
      ...(server?.payload ?? emptyAcademicDraft(layer)),
      inputContract: 'SCORES_ONLY_V3',
    };
  };
  const form = useForm<AcademicDraft>({ defaultValues: initial() }),
    values = form.watch(),
    cmd = useAcademicCommand(memory, key, actor),
    [reconciling, setReconciling] = useState(cmd.state === 'unknown'),
    reconciliation = useRef(false),
    [revision, setRevision] = useState(server?.revision ?? 0),
    [index, setIndex] = useState(Number(memory[key + '.criterion'] ?? 0)),
    [step, setStep] = useState(memory[key + '.tab'] ?? 'evidence'),
    [reviewTotal, setReviewTotal] = useState<number | null>(
      server?.total ?? null,
    ),
    [confirm, setConfirm] = useState(false),
    [review, setReview] = useState(false),
    [complete, setComplete] = useState<number | null>(null),
    [confirmedFinal, setConfirmedFinal] = useState(false),
    [denied, setDenied] = useState(false),
    [compare, setCompare] = useState<AcademicRound | null>(null),
    [authoritativeRound, setAuthoritativeRound] =
      useState<AcademicRound | null>(null),
    [issue, setIssue] = useState(''),
    mounted = useRef(true),
    savedPayload = useRef<AcademicDraft>(
      server?.payload ?? emptyAcademicDraft(layer),
    ),
    pendingPayload = useRef<AcademicDraft | undefined>(undefined);
  const dirty =
    draftSignature(values) === null ||
    draftSignature(values) !== draftSignature(savedPayload.current);
  const exitGuard = useAssessmentExit(
    dirty && !['saving', 'unknown'].includes(cmd.state),
    locale,
    () => {
      form.reset(savedPayload.current);
      memory[key] = JSON.stringify(savedPayload.current);
    },
  );
  useEffect(() => {
    setAuthoritativeRound(null);
  }, [round]);
  const model = authoritativeRound?.assessment ?? round.assessment!,
    record = model.assessments.find((x) => x.layer === layer),
    frozen = !!record || confirmedFinal,
    canEdit = !!round.canAssess && !frozen && !denied && layer === 'supervisor',
    criteria = model.rubric.criteria,
    scored = values.criteria.filter((x) => x.level !== null).length;
  const invalidate = useCallback(() => {
    setDenied(true);
    savedPayload.current = emptyAcademicDraft(layer);
    pendingPayload.current = undefined;
    form.reset(emptyAcademicDraft(layer));
    delete memory[key];
  }, [form, layer, memory, key]);
  useEffect(() => {
    memory[key] = JSON.stringify(values);
  }, [values, memory, key]);
  useEffect(() => {
    memory[key + '.criterion'] = String(index);
  }, [index, memory, key]);
  useEffect(() => {
    mounted.current = true;
    const clear = () => invalidate();
    window.addEventListener('semester-memory-cleared', clear);
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      mounted.current = false;
      window.removeEventListener('semester-memory-cleared', clear);
      window.removeEventListener('beforeunload', unload);
    };
  }, [invalidate, form, dirty]);
  useEffect(() => {
    const timer = setInterval(() => {
      void fetch('/api/academic?round=' + round.id, {
        cache: 'no-store',
        headers: { 'X-Workspace-Actor': actor },
      })
        .then((r) => {
          if (deniedRead(r.status) && mounted.current) invalidate();
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [round.id, actor, invalidate]);
  async function save() {
    const payload = form.getValues(),
      parsed = academicDraftSchema.safeParse(payload);
    if (!parsed.success) {
      setIssue(
        copy(
          'Check the entered draft fields.',
          'تحقق من حقول المسودة المدخلة.',
        ),
      );
      return;
    }
    pendingPayload.current = parsed.data;
    const r = await cmd.send({
      operation: 'assessment.save',
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      draftRevision: revision,
      payload,
    });
    if (r && typeof r.revision === 'number') {
      savedPayload.current = parsed.data;
      pendingPayload.current = undefined;
      setRevision(r.revision);
      form.reset(parsed.data);
      setIssue('');
      router.refresh();
    }
  }
  async function readCurrent(): Promise<AcademicRound | null> {
    try {
      const response = await fetch('/api/academic?round=' + round.id, {
        cache: 'no-store',
        headers: { 'X-Workspace-Actor': actor },
      });
      if (deniedRead(response.status)) {
        invalidate();
        return null;
      }
      if (!response.ok) throw Error('READ_UNAVAILABLE');
      const current = (await response.json()) as AcademicRound;
      if (
        current.id !== round.id ||
        current.project !== round.project ||
        current.version !== round.version
      ) {
        setIssue(
          copy(
            'This frozen submission changed. Reopen its current record.',
            'تغيّر الإرسال المحفوظ. افتح سجله الحالي من جديد.',
          ),
        );
        return null;
      }
      setAuthoritativeRound(current);
      return current;
    } catch {
      setIssue(
        copy(
          'The current record could not be checked. Your input is retained; retry when the service is available.',
          'تعذر التحقق من السجل الحالي. يبقى إدخالك محفوظًا؛ أعد المحاولة عند توفر الخدمة.',
        ),
      );
      return null;
    }
  }
  async function openReview() {
    const current = await readCurrent();
    if (!current) return;
    const stored = current.assessment?.drafts.find((d) => d.layer === layer);
    if (
      !stored ||
      stored.revision !== revision ||
      draftSignature(stored.payload) !== draftSignature(form.getValues())
    ) {
      setCompare(current);
      return;
    }
    setReviewTotal(stored.total ?? null);
    setReview(true);
  }
  async function finalize() {
    if (dirty || revision < 1) {
      setIssue(
        copy(
          'Save this draft before finalizing its exact seven scores.',
          'احفظ هذه المسودة قبل تثبيت درجاتها السبع الدقيقة.',
        ),
      );
      return;
    }
    const r = await cmd.send({
      operation: 'assessment.finalize',
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      draftRevision: revision,
      payload: form.getValues(),
    });
    setReview(false);
    if (r && isFinalAssessmentReceipt(r, layer)) {
      setConfirmedFinal(true);
      setComplete(validAssessmentTotal(r.total) ? Number(r.total) : null);
      setReview(false);
      delete memory[key];
      await readCurrent();
      router.refresh();
    } else {
      // A concurrent tab may have finalized the same logical layer.
      const current = await readCurrent();
      const final = current?.assessment?.assessments.find(
        (a) => a.layer === layer,
      );
      if (final) {
        setConfirmedFinal(true);
        setComplete(
          validAssessmentTotal(final.total) ? Number(final.total) : null,
        );
        setReview(false);
        delete memory[key];
        cmd.acknowledgeObservedCompletion();
        router.refresh();
      }
    }
  }
  async function reconcile(retryOriginal = true) {
    if (reconciliation.current) return;
    reconciliation.current = true;
    setReconciling(true);
    try {
      const r = await cmd.recheck(retryOriginal);
      if (!r) return;
      if (isFinalAssessmentReceipt(r, layer)) {
        setConfirmedFinal(true);
        setComplete(validAssessmentTotal(r.total) ? Number(r.total) : null);
        setReview(false);
        delete memory[key];
        await readCurrent();
      } else if (typeof r.revision === 'number') {
        const current = await readCurrent();
        if (!current) return;
        const stored = current.assessment?.drafts.find(
          (x) => x.layer === layer,
        );
        if (!stored) {
          setIssue(
            copy(
              'The saved draft could not be verified.',
              'تعذر التحقق من المسودة المحفوظة.',
            ),
          );
          return;
        }
        savedPayload.current = stored.payload;
        if (stored.revision !== r.revision) {
          setCompare(current);
          setIssue(
            copy(
              'A newer draft exists; compare before continuing.',
              'توجد مسودة أحدث؛ قارن قبل المتابعة.',
            ),
          );
        } else {
          setRevision(stored.revision);
          form.reset(stored.payload);
          pendingPayload.current = undefined;
        }
      }
      router.refresh();
    } finally {
      reconciliation.current = false;
      setReconciling(false);
    }
  }
  async function compareSaved() {
    const current = await readCurrent();
    if (current) setCompare(current);
  }
  useEffect(() => {
    if (cmd.error?.code === 'AUTHORITY_UNAVAILABLE') invalidate();
  }, [cmd.error, invalidate]);
  const initialReconciliation = useRef(false);
  useEffect(() => {
    if (!initialReconciliation.current) {
      initialReconciliation.current = true;
      if (cmd.state === 'unknown') void reconcile(false);
    }
  }, []);

  const errors: Record<string, readonly [string, string]> = {
    MEMBERS: [
      'Enter two or more distinct ordered committee member names.',
      'أدخل أسماء عضوين مميزين أو أكثر للجنة بالترتيب.',
    ],
    ASSESSED_ON: [
      'Enter a valid assessed date, no later than today (UTC).',
      'أدخل تاريخ تقييم صحيحًا لا يتجاوز اليوم بتوقيت UTC.',
    ],
    ATTESTATION: [
      'Confirm that the recorded committee consensus is accurate.',
      'أكد دقة إجماع اللجنة المسجل.',
    ],
    SUPERVISOR_PROVENANCE: [
      'Supervisor and committee provenance must stay separate.',
      'يجب فصل مصدرية المشرف عن مصدرية اللجنة.',
    ],
  };
  const status = reconciling
    ? copy('Checking saved draft…', 'جارٍ التحقق من المسودة المحفوظة…')
    : assessmentSaveLabel(locale, cmd.state, dirty, revision > 0);
  const viewCriteria: RubricCriterionView[] = criteria.map((x) => ({
    key: x.code,
    title: x.label[locale],
    weight: x.weight,
    intent:
      x.description[locale].split('. ')[0]!.split(/[;؛]/)[0]! +
      (locale === 'en' ? '.' : ''),
    ...(x.code === 'C1' ? {} : { guidance: x.description[locale] }),
    anchors: x.anchors.map((a) => ({
      level: a.level as AssessmentLevel,
      label: model.rubric.levels[locale][a.level]!,
      detail: a[locale],
    })),
  }));
  const viewValues = values.criteria.map((x) => ({
    level: x.level,
    note: x.comment,
  }));
  const completionIssues =
    scored === 7
      ? assessmentIssues(
          finalizedInput(values),
          new Date().toISOString().slice(0, 10),
          !governed,
        )
      : [];
  const blocked =
    // The server-rendered saved values precede RHF's client subscription. Do
    // not admit the first score edit until that subscription can retain it.
    !form.formState.isReady ||
    reconciling ||
    !canEdit ||
    ['saving', 'unknown', 'conflict', 'unavailable'].includes(cmd.state);
  const extra = (
    <>
      {layer === 'committee' && (
        <details className="as-provenance" open={scored === 7}>
          <summary>
            {copy('Committee attribution · required', 'مصدرية اللجنة · مطلوبة')}
          </summary>
          <fieldset
            className="as-members"
            disabled={cmd.state === 'saving' || cmd.state === 'unknown'}
          >
            <legend dir="auto">
              {copy('Committee provenance', 'مصدرية اللجنة')}
            </legend>
            <p dir="auto" className="ss-muted">
              {copy(
                'The currently assigned supervisor records the actual consensus. Member names are ordered attribution, not invented accounts, votes or signatures.',
                'يسجل المشرف المعيّن الإجماع الفعلي. أسماء الأعضاء مصدرية مرتبة وليست حسابات أو أصواتًا أو توقيعات مصطنعة.',
              )}
            </p>
            {values.members.map((_, i) => (
              <Field key={i}>
                <FieldLabel htmlFor={'ac-member-' + i}>
                  {copy('Member', 'العضو')} {i + 1}
                </FieldLabel>
                <Input
                  id={'ac-member-' + i}
                  {...form.register(('members.' + i) as 'members.0')}
                  maxLength={200}
                />
                {values.members.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      form.setValue(
                        'members',
                        values.members.filter((_, n) => i !== n),
                        { shouldDirty: true },
                      )
                    }
                  >
                    {copy('Remove member', 'إزالة العضو')}
                  </Button>
                )}
              </Field>
            ))}
            <Button
              type="button"
              variant="outline"

              onClick={() =>
                form.setValue('members', [...values.members, ''], {
                  shouldDirty: true,
                })
              }
            >
              <Plus />
              {copy('Add member', 'إضافة عضو')}
            </Button>
            <Field>
              <FieldLabel htmlFor="ac-date">
                {copy('Assessed date', 'تاريخ التقييم')}
              </FieldLabel>
              <Input
                id="ac-date"
                type="date"
                dir="ltr"
                max={new Date().toISOString().slice(0, 10)}
                value={values.assessedOn ?? ''}
                onChange={(e) =>
                  form.setValue('assessedOn', e.target.value || null, {
                    shouldDirty: true,
                  })
                }
              />
            </Field>
            <label dir="auto" className="as-attestation">
              <input
                type="checkbox"
                checked={values.attestation}
                onChange={(e) =>
                  form.setValue('attestation', e.target.checked, {
                    shouldDirty: true,
                  })
                }
              />
              {copy(
                'I accurately record this committee consensus and its ordered members/date.',
                'أسجل إجماع هذه اللجنة وأعضاءها المرتبين وتاريخها بدقة.',
              )}
            </label>
          </fieldset>
        </details>
      )}
    </>
  );
  const feedback = (
    <>
      {cmd.error?.issues?.map((x) => (
        <p dir="auto" role="alert" className="ss-validation" key={x}>
          {t(
            locale,
            ...(errors[x] ?? [
              'Recheck the entered assessment fields.',
              'أعد التحقق من حقول التقييم المدخلة.',
            ]),
          )}
        </p>
      ))}
      {(issue ||
        (cmd.error &&
          ['rejected', 'conflict', 'unavailable'].includes(cmd.state))) && (
        <FieldError role="alert">
          {issue ||
            copy(
              'The current command was rejected. Compare the saved draft or recheck your role and required committee details.',
              'رُفض الأمر الحالي. قارن المسودة المحفوظة أو تحقق من دورك وتفاصيل اللجنة المطلوبة.',
            )}
        </FieldError>
      )}
      {cmd.state === 'unknown' && (
        <div role="status" aria-live="polite">
          <p dir="auto">
            {cmd.error?.code === 'NOT_COMMITTED'
              ? copy(
                  'No completed operation was found. Your saved inputs are retained; retry the same request safely.',
                  'لم يُعثر على إجراء مكتمل. تبقى مدخلاتك المحفوظة؛ يمكنك إعادة الطلب نفسه بأمان.',
                )
              : copy(
                  'The saved outcome still needs checking. Your input is retained.',
                  'ما زالت النتيجة المحفوظة بحاجة إلى تحقق. يبقى إدخالك محفوظًا.',
                )}
          </p>
          <Button variant="outline" onClick={() => void reconcile()}>
            {cmd.error?.code === 'NOT_COMMITTED'
              ? copy('Retry saved request', 'إعادة الطلب المحفوظ')
              : copy('Check saved status', 'التحقق من الحالة المحفوظة')}
          </Button>
        </div>
      )}
      {cmd.error && ['rejected', 'conflict'].includes(cmd.state) && (
        <Button variant="outline" onClick={() => void compareSaved()}>
          {copy('Compare saved draft', 'مقارنة المسودة المحفوظة')}
        </Button>
      )}
    </>
  );
  const panel = denied ? (
    <p dir="auto" role="alert">
      {copy(
        'Authority has changed. Reload before reading or assessing this case.',
        'تغيرت الصلاحية. أعد التحميل قبل قراءة هذه الحالة أو تقييمها.',
      )}
    </p>
  ) : frozen ? (
    <AssessmentSummary
      locale={locale}
      title={copy('Read-only assessment', 'تقييم للقراءة فقط')}
      total={assessmentSummaryTotal(record, complete)}
      rubric={model.rubric.code}
      criteria={viewCriteria}
      values={
        record
          ? criteria.map((c) => ({
              level:
                record?.criteria.find((x) => x.code === c.code)?.level ?? null,
              note:
                record?.criteria.find((x) => x.code === c.code)?.comment ?? '',
            }))
          : viewValues
      }
      attribution={
        record && (
          <>
            <bdi>
              {model.provenance.find((x) => x.assessment === record.id)?.name ??
                copy('Attribution unavailable', 'المصدرية غير متاحة')}
            </bdi>{' '}
            · {date(locale, record.recorded_at)}
          </>
        )
      }
    >
      {cmd.state === 'unknown' && feedback}
      {record?.member_names.length ? (
        <p dir="auto">
          {record.member_names.join(' · ')} · {record.assessed_on}
        </p>
      ) : null}
      <p dir="auto">
        {copy(
          'This attributed assessment is immutable. The faculty outcome remains a separate decision.',
          'هذا التقييم المنسوب إلى مسجله ثابت. يبقى المصير النهائي قرارًا منفصلًا للمشرف.',
        )}
      </p>
      <Button asChild>
        <Link
          href={
            '/' +
            locale +
            '/supervision/finals/' +
            round.id +
            (layer === 'supervisor' ? '/committee' : '/decision') +
            '?from=' +
            encodeURIComponent(parent)
          }
        >
          {layer === 'supervisor'
            ? round.assessment!.assessments.some(
                (assessment) => assessment.layer === 'committee',
              )
              ? copy(
                  governed
                    ? 'Read committee aggregate'
                    : 'Read historical committee result',
                  governed
                    ? 'قراءة نتيجة اللجنة الإجمالية'
                    : 'قراءة نتيجة اللجنة التاريخية',
                )
              : copy('Manage committee invitations', 'إدارة دعوات اللجنة')
            : copy('Review faculty decision', 'مراجعة قرار المشرف')}
        </Link>
      </Button>
      {record && record.recorded_by === actor && (
        <RequestAssessmentReview
          key={record.id}
          locale={locale}
          actorId={actor}
          assessment={record.id}
          logical={record.logical}
          headRevision={record.headRevision}
          layer={layer}
          caseId={record.case_id}
          title={round.metadata.title}
        />
      )}
    </AssessmentSummary>
  ) : !canEdit ? (
    <p dir="auto">
      {copy(
        'Finalize the supervisor assessment before recording separate committee consensus. Frozen evidence remains read only.',
        'ثبّت تقييم المشرف قبل تسجيل إجماع اللجنة المنفصل. تبقى الأدلة المحفوظة للقراءة فقط.',
      )}
    </p>
  ) : (
    <AssessmentCriterionPanel
      locale={locale}
      criteria={viewCriteria}
      values={viewValues}
      index={index}
      onCriterionChange={setIndex}
      onChoose={(level) =>
        form.setValue(
          ('criteria.' + index + '.level') as 'criteria.0.level',
          level,
          { shouldDirty: true },
        )
      }
      onNote={(note) =>
        form.setValue(
          ('criteria.' + index + '.comment') as 'criteria.0.comment',
          note,
          { shouldDirty: true },
        )
      }
      disabled={blocked}
      onSave={() => void save()}
      saveDisabled={blocked || !dirty}
      onReview={() => void openReview()}
      reviewDisabled={
        blocked ||
        scored !== 7 ||
        dirty ||
        revision < 1 ||
        completionIssues.length > 0
      }
      readiness={
        scored !== 7
          ? copy(
              'Choose all seven levels before review.',
              'اختر المستويات السبعة قبل المراجعة.',
            )
          : completionIssues.length > 0
            ? copy(
                'Review the selected levels and optional criterion notes before continuing.',
                'راجع المستويات المختارة والملاحظات الاختيارية للمعايير قبل المتابعة.',
              )
            : dirty || revision < 1
              ? copy(
                  'Save your draft before reviewing the recorded assessment.',
                  'احفظ مسودتك قبل مراجعة التقييم المسجل.',
                )
              : copy(
                  'All seven levels are saved. Review before finalizing.',
                  'المستويات السبعة محفوظة. راجع التقييم قبل التثبيت.',
                )
      }
      extra={extra}
      feedback={feedback}
    />
  );
  return (
    <>
      {exitGuard}
      <AcademicCommandProtection locale={locale} command={cmd} />
      <AcademicAssessmentWorkspace
        locale={locale}
        variant={layer}
        title={round.metadata.title}
        back={
          <Link href={parent}>
            {copy('Back to task queue', 'العودة إلى قائمة المهام')}
          </Link>
        }
        scope={copy(
          'Read-only frozen final submission ' +
            (round.finalNumber ?? round.round),
          'الإرسال النهائي المحفوظ للقراءة فقط ' +
            (round.finalNumber ?? round.round),
        )}
        status={
          frozen
            ? copy('Read-only completed', 'مكتمل للقراءة فقط')
            : denied
              ? copy('Access unavailable', 'الوصول غير متاح')
              : status
        }
        contextAction={
          <Link
            href={
              '/' +
              locale +
              '/supervision/projects/' +
              round.project +
              '?from=' +
              encodeURIComponent(parent)
            }
          >
            {copy('Open project', 'فتح المشروع')}
          </Link>
        }
        tab={step}
        onTabChange={(v) => {
          setStep(v);
          memory[key + '.tab'] = v;
        }}
        evidence={
          <AcademicEvidence
            locale={locale}
            actor={actor}
            project={round.project}
            version={round.version}
            submission={round.id}
            files={round.files}
            readerOnly
            onDenied={invalidate}
          />
        }
        assessment={panel}
      />
      <Sheet open={review} onOpenChange={setReview}>
        <SheetContent
          className="wsv2 as-sheet"
          closeLabel={copy('Close assessment review', 'أغلق مراجعة التقييم')}
        >
          <SheetHeader>
            <SheetTitle>{copy('Review assessment', 'راجع التقييم')}</SheetTitle>
            <SheetDescription>
              <bdi dir="auto">{round.metadata.title}</bdi> ·{' '}
              {copy('Final round', 'الإرسال النهائي')}{' '}
              {round.finalNumber ?? round.round} ·{' '}
              {layer === 'supervisor'
                ? copy('Supervisor', 'المشرف')
                : copy('Committee consensus', 'إجماع اللجنة')}
            </SheetDescription>
          </SheetHeader>
          <AssessmentSummary
            locale={locale}
            title={copy('Assessment summary', 'ملخص التقييم')}
            total={reviewTotal === null ? null : String(reviewTotal)}
            rubric={model.rubric.code}
            criteria={viewCriteria}
            values={viewValues}
            onEdit={(i) => {
              setReview(false);
              setIndex(i);
              setStep('assessment');
            }}
          />
          <p dir="auto" className="ss-muted">
            {copy(
              'This locks this attributed form once. It does not publish or decide the final outcome. Optional comments can be empty.',
              'يثبت هذا النموذج المنسوب إلى مسجله مرة واحدة. لا ينشر العمل ولا يقرر المصير النهائي. يجوز أن تكون التعليقات الاختيارية فارغة.',
            )}
          </p>
          {values.overall && <p dir="auto">{values.overall}</p>}
          <Button variant="outline" onClick={() => setReview(false)}>
            {copy('Cancel', 'إلغاء')}
          </Button>
          {layer === 'committee' && (
            <p dir="auto">
              {values.members.join(' · ')} · {values.assessedOn}
            </p>
          )}
          <Button
            disabled={
              cmd.state === 'saving' ||
              cmd.state === 'unknown' ||
              reviewTotal === null
            }
            onClick={() => setConfirm(true)}
          >
            {layer === 'supervisor'
              ? copy('Finalize supervisor assessment', 'ثبّت تقييم المشرف')
              : copy('Finalize committee consensus', 'ثبّت إجماع اللجنة')}
          </Button>
          {cmd.error && (
            <p dir="auto" role="alert">
              {copy(
                'Finalization was rejected; recheck seven scores and committee provenance.',
                'رُفض التثبيت؛ تحقق من الدرجات السبع ومصدرية اللجنة.',
              )}
            </p>
          )}
        </SheetContent>
      </Sheet>
      <DecisionConfirmation
        open={confirm}
        onOpenChange={setConfirm}
        title={
          layer === 'supervisor'
            ? copy('Finalize supervisor assessment?', 'تثبيت تقييم المشرف؟')
            : copy('Finalize committee consensus?', 'تثبيت إجماع اللجنة؟')
        }
        description={copy(
          'This locks this attributed form once. It does not publish or decide the outcome.',
          'يثبت هذا النموذج المنسوب إلى مسجله مرة واحدة. لا ينشر العمل ولا يقرر المصير النهائي.',
        )}
      >
        <Button variant="outline" onClick={() => setConfirm(false)}>
          {copy('Cancel', 'إلغاء')}
        </Button>
        <Button
          disabled={blocked || dirty || revision < 1 || reviewTotal === null}
          onClick={() => {
            setConfirm(false);
            void finalize();
          }}
        >
          {copy('Confirm finalization', 'تأكيد التثبيت')}
        </Button>
      </DecisionConfirmation>
      <Sheet
        open={!!compare}
        onOpenChange={(v) => {
          if (!v) setCompare(null);
        }}
      >
        <SheetContent
          className="wsv2 ss-explorer-sheet"
          closeLabel={copy('Close saved draft', 'أغلق المسودة المحفوظة')}
        >
          <SheetHeader>
            <SheetTitle>
              {copy('Compare saved draft', 'قارن المسودة المحفوظة')}
            </SheetTitle>
            <SheetDescription>
              {copy(
                'Your unsaved input stays until you explicitly choose the saved version.',
                'يبقى مدخلك غير المحفوظ حتى تختار النسخة المحفوظة صراحة.',
              )}
            </SheetDescription>
          </SheetHeader>
          {compare?.assessment?.drafts
            .filter((x) => x.layer === layer)
            .map((x) => (
              <div key={x.layer}>
                <p dir="auto">
                  {copy('Revision', 'المراجعة')} {x.revision} ·{' '}
                  {x.payload.criteria.filter((c) => c.level !== null).length}/7
                </p>
                <p dir="auto">{x.payload.overall}</p>
                <Button
                  onClick={() => {
                    savedPayload.current = x.payload;
                    form.reset(x.payload);
                    setRevision(x.revision);
                    memory[key] = JSON.stringify(x.payload);
                    cmd.reset();
                    setCompare(null);
                  }}
                >
                  {copy('Use saved draft', 'استخدم المسودة المحفوظة')}
                </Button>
              </div>
            ))}
          <Button variant="outline" onClick={() => setCompare(null)}>
            {copy('Keep my unsaved input', 'احتفظ بمدخلي غير المحفوظ')}
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
