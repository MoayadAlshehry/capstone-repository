'use client';
import { formatScore } from '@capstone/ui/score-format';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { submissionUuid } from '@capstone/domain';
import { useRouter } from 'next/navigation';
import {
  assessmentIssues,
  coreQuarterPoints,
  type AssessmentInput,
} from '@capstone/domain';
import {
  externalFormIssues,
  externalQuarterPoints,
  type ExternalForm,
} from '@capstone/domain/external-reviews';
import {
  AcademicAssessmentWorkspace,
  AssessmentCriterionPanel,
  AssessmentSummary,
  Button,
  Field,
  FieldLabel,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  DecisionConfirmation,
  type RubricCriterionView,
  type AssessmentLevel,
} from '@capstone/ui/workspace-v2';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
import { useSemesterMemory } from '../semester/memory';
import { t, type Locale } from '../semester/common';
import { useGovernedCommand } from './command';
import { validGovernedReason } from './command-model';
import { useValidatedPersonalNavigation } from '../workspace-v2/navigation-context-client';
import { usePathname, useSearchParams } from 'next/navigation';
import type { NavigationContext } from '../workspace-v2/navigation-context';
import {
  correctionForm,
  decodeRubric,
  type AssessmentForm,
  type GovernanceView,
  type GovIssue,
} from './types';

const timestamp = (locale: Locale, value: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value)) + ' · UTC';
const issueNames: Record<GovIssue['type'], [string, string]> = {
  transcription_error: ['Recorded transcription error', 'خطأ في نقل التقييم'],
  missing_evidence: ['Missing assessment evidence', 'دليل مفقود في التقييم'],
  identity_integrity: ['Identity integrity concern', 'مشكلة في صحة الهوية'],
  undeclared_conflict: ['Undeclared conflict', 'تعارض غير معلن'],
  internal_disagreement: [
    'Internal assessment disagreement',
    'اختلاف في التقييم الداخلي',
  ],
  access_integrity: ['Assessment access integrity', 'صحة الوصول أثناء التقييم'],
};

export function RequestAssessmentReview({
  locale,
  actorId,
  assessment,
  logical,
  headRevision,
  layer,
  caseId,
  title,
}: {
  locale: Locale;
  actorId: string;
  assessment: string;
  logical: string;
  headRevision: number;
  layer: 'supervisor' | 'committee' | 'external';
  caseId?: string | undefined;
  title?: string | undefined;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    memory = useSemesterMemory(actorId, 'request.' + assessment),
    requestQuery = useSearchParams(),
    originalScope = requestQuery.get('task'),
    fallbackScope =
      originalScope?.startsWith('request.') &&
      originalScope.split('.').length === 2 &&
      submissionUuid(originalScope.split('.')[1]) &&
      submissionUuid(requestQuery.get('command'))
        ? originalScope
        : 'request.' + logical,
    cmd = useGovernedCommand(
      actorId,
      caseId ? 'request.' + caseId + '.' + layer : fallbackScope,
      { logical, layer },
    ),
    [open, setOpen] = useState(cmd.unknown),
    [confirm, setConfirm] = useState(false),
    [reason, setReason] = useState(memory.reason ?? ''),
    [kind, setKind] = useState<GovIssue['type']>('transcription_error');
  const guard = useAssessmentExit(
    !!reason || cmd.pending || cmd.unknown,
    locale,
    () => {
      setReason('');
      delete memory.reason;
    },
    {
      preserveLocaleSwitch: true,
      canDiscard: !cmd.pending && !cmd.unknown,
      ...(cmd.pending || cmd.unknown
        ? {}
        : {
            stayLabel: copy('Keep editing', 'متابعة التحرير'),
            description: copy(
              'Keep your unsent review request here, or discard it before continuing. A request is recorded only after confirmation.',
              'احتفظ بطلب المراجعة غير المرسل هنا، أو تجاهله قبل المتابعة. لا يُسجل الطلب إلا بعد التأكيد.',
            ),
          }),
    },
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (reason || cmd.pending || cmd.unknown) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [reason, cmd.pending, cmd.unknown]);
  useEffect(() => {
    memory.reason = reason;
  }, [reason, memory]);
  useEffect(() => {
    if (cmd.denied) {
      setReason('');
      delete memory.reason;
    }
  }, [cmd.denied, memory]);
  useEffect(() => {
    if (cmd.lastResult) {
      setReason('');
      delete memory.reason;
    }
  }, [cmd.lastResult, memory]);
  async function send() {
    if (
      !submissionUuid(logical) ||
      !Number.isSafeInteger(headRevision) ||
      headRevision < 0
    )
      return;
    const result = await cmd.send('issue', {
      assessment: logical,
      expectedHead: assessment,
      expectedRevision: headRevision,
      type: kind,
      reason: reason.trim(),
    });
    setConfirm(false);
    if (result) delete memory.reason;
  }
  const outcome = cmd.lastResult;
  return (
    <>
      {guard}
      <Button variant="outline" onClick={() => setOpen(true)}>
        {copy('Request assessment review', 'طلب مراجعة التقييم')}
      </Button>
      <DecisionConfirmation
        open={open}
        onOpenChange={(value) => {
          if (!cmd.pending) setOpen(value);
        }}
        title={copy('Review your recorded assessment', 'مراجعة تقييمك المسجل')}
        description={copy(
          'A request goes to the responsible administrator. Your finalized assessment stays unchanged until an authorized correction is appended by its original evaluator. This does not reopen closed file access.',
          'يذهب الطلب إلى المدير المختص. يبقى تقييمك المثبت دون تغيير حتى يُلحق المقيم الأصلي تصحيحًا مصرحًا به. لا يعيد هذا فتح الوصول المغلق إلى الملفات.',
        )}
      >
        <p dir="auto">
          {title ?? copy('Your recorded assessment', 'تقييمك المسجل')} ·{' '}
          {layer === 'external'
            ? copy('Independent review', 'التقييم المستقل')
            : layer === 'committee'
              ? copy('Committee consensus', 'إجماع اللجنة')
              : copy('Supervisor assessment', 'تقييم المشرف')}
        </p>
        {outcome ? (
          <p dir="auto" role="status">
            {copy(
              'Assessment review requested. The recorded result is unchanged. Follow your Inbox for the administrator’s decision.',
              'طُلبت مراجعة التقييم. لم تتغير النتيجة المسجلة. تابع الوارد للاطلاع على قرار المدير.',
            )}
          </p>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor={'review-kind-' + assessment}>
                {copy('What needs review?', 'ما الذي يحتاج إلى مراجعة؟')}
              </FieldLabel>
              <Select
                value={kind}
                disabled={cmd.pending || cmd.unknown || cmd.denied}
                onValueChange={(value) => setKind(value as GovIssue['type'])}
              >
                <SelectTrigger id={'review-kind-' + assessment}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="wsv2">
                  {(Object.keys(issueNames) as GovIssue['type'][])
                    .filter((type) =>
                      layer === 'external'
                        ? type !== 'internal_disagreement'
                        : type !== 'access_integrity',
                    )
                    .map((type) => (
                      <SelectItem key={type} value={type}>
                        {copy(...issueNames[type])}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={'review-reason-' + assessment}>
                {copy('Reason for review', 'سبب المراجعة')}
              </FieldLabel>
              <Textarea
                id={'review-reason-' + assessment}
                dir="auto"
                rows={4}
                value={reason}
                maxLength={4000}
                disabled={cmd.pending || cmd.unknown || cmd.denied}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby={'review-reason-help-' + assessment}
              />
              <p dir="auto" id={'review-reason-help-' + assessment}>
                {copy(
                  'Explain the concern in 20–2,000 characters. The responsible administrator sees this reason.',
                  'وضّح المشكلة في 20–2,000 حرف. يرى المدير المختص هذا السبب.',
                )}
              </p>
            </Field>
            <Button
              disabled={
                cmd.pending ||
                cmd.unknown ||
                cmd.denied ||
                !validGovernedReason(reason)
              }
              onClick={() => setConfirm(true)}
            >
              {copy('Review request', 'مراجعة الطلب')}
            </Button>
            {confirm && (
              <section className="ss-notice">
                <p dir="auto">{copy(...issueNames[kind])}</p>
                <p dir="auto">{reason}</p>
                <Button variant="outline" onClick={() => setConfirm(false)}>
                  {copy('Keep editing', 'متابعة التحرير')}
                </Button>
                <Button disabled={cmd.pending} onClick={() => void send()}>
                  {copy('Confirm review request', 'تأكيد طلب المراجعة')}
                </Button>
              </section>
            )}
            {cmd.error && !cmd.unknown && (
              <p dir="auto" role="alert">
                {copy(
                  'The request was not confirmed. Your input is retained; recheck the current recorded assessment and your authority before retrying.',
                  'لم يُؤكد الطلب. يبقى إدخالك محفوظًا؛ تحقق من التقييم الحالي وصلاحيتك قبل المحاولة مجددًا.',
                )}
              </p>
            )}
            {cmd.unknown && (
              <>
                <p dir="auto" role="status">
                  {copy(
                    'Outcome unknown. Recheck the same original request before creating another.',
                    'النتيجة غير معروفة. أعد فحص الطلب الأصلي نفسه قبل إنشاء طلب آخر.',
                  )}
                </p>
                {cmd.error === 'ORIGINAL_PAYLOAD_UNAVAILABLE' && (
                  <p dir="auto" role="alert">
                    {copy(
                      'No committed receipt was found. The original unsent input was held only in this browser document and cannot be recovered after a full refresh. Keep this command reference and check again; do not send a new request while its result is unresolved.',
                      'لم يُعثر على إيصال مسجل. كان الإدخال الأصلي غير المرسل محفوظًا داخل صفحة المتصفح فقط ولا يمكن استعادته بعد تحديث كامل. احتفظ بمرجع هذا الأمر وتحقق مجددًا؛ لا ترسل طلبًا جديدًا ما دامت نتيجته غير محسومة.',
                    )}
                  </p>
                )}
                <Button disabled={cmd.pending} onClick={() => void cmd.retry()}>
                  {copy(
                    'Recheck original review request',
                    'إعادة فحص طلب المراجعة الأصلي',
                  )}
                </Button>
              </>
            )}
          </>
        )}
        <Button
          variant="outline"
          disabled={cmd.pending}
          onClick={() => setOpen(false)}
        >
          {copy('Close', 'إغلاق')}
        </Button>
      </DecisionConfirmation>
    </>
  );
}

export function CorrectionEditor({
  locale,
  actorId,
  initial,
  issueId,
  reviewerCapable,
  independent,
}: {
  locale: Locale;
  actorId: string;
  initial: GovernanceView;
  issueId: string;
  reviewerCapable: boolean;
  independent: boolean;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    router = useRouter(),
    pathname = usePathname(),
    query = useSearchParams(),
    issue = initial.issues.find((item) => item.id === issueId),
    assessment = initial.assessments.find(
      (item) => item.logical === issue?.logical,
    ),
    rubric = decodeRubric(assessment?.rubricDefinition),
    original = assessment
      ? correctionForm(assessment.payload, assessment.layer)
      : null,
    memory = useSemesterMemory(actorId, 'correction.' + issueId),
    cmd = useGovernedCommand(actorId, 'correction.' + issueId),
    [form, setForm] = useState<AssessmentForm | null>(() => {
      let candidate = original;
      try {
        if (assessment)
          candidate =
            correctionForm(
              JSON.parse(memory.form ?? 'null'),
              assessment.layer,
            ) ?? original;
      } catch {
        /* retain the actual original form */
      }
      return candidate
        ? { ...candidate, inputContract: 'SCORES_ONLY_V3' }
        : null;
    }),
    [reason, setReason] = useState(memory.reason ?? ''),
    [index, setIndex] = useState(0),
    [tab, setTab] = useState('assessment'),
    [review, setReview] = useState(false),
    [validation, setValidation] = useState<string[]>([]);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const validBinding =
      !!issue &&
      !!assessment &&
      assessment.evaluator === actorId &&
      !!rubric &&
      rubric.code === assessment.rubric &&
      !!form &&
      !!original &&
      ['ASSESSMENT_UX_V2', 'REFERENCED_ASSESSMENT_V1'].includes(
        assessment.correctionPolicy,
      ),
    modern =
      form?.inputContract === 'SCORES_ONLY_V3' ||
      assessment?.correctionPolicy === 'ASSESSMENT_UX_V2',
    active =
      validBinding &&
      issue!.state === 'amendment_authorized' &&
      !assessment!.invalidated &&
      !cmd.lastResult,
    dirty =
      !!form && (JSON.stringify(form) !== JSON.stringify(original) || !!reason),
    blocked = cmd.pending || cmd.unknown || cmd.denied || !active;
  const queryString = query.toString(),
    navigationIntent = useMemo<NavigationContext>(
      () => ({
        context: independent && reviewerCapable ? 'independent' : 'supervision',
        returnTo: pathname + (queryString ? '?' + queryString : ''),
        warning: false,
      }),
      [independent, reviewerCapable, pathname, queryString],
    );
  useValidatedPersonalNavigation(actorId, reviewerCapable, navigationIntent);
  const guard = useAssessmentExit(
    (active && dirty) || cmd.unknown || cmd.pending,
    locale,
    () => {
      setForm(original);
      setReason('');
      delete memory.form;
      delete memory.reason;
    },
    {
      preserveLocaleSwitch: true,
      canDiscard: !cmd.unknown && !cmd.pending,
      ...(cmd.unknown || cmd.pending
        ? {}
        : {
            stayLabel: copy('Keep editing', 'متابعة التحرير'),
            description: copy(
              'Keep editing this correction, or discard your unsaved input before continuing. The recorded assessment is unchanged until a complete correction is confirmed.',
              'تابع تحرير هذا التصحيح، أو تجاهل الإدخال غير المحفوظ قبل المتابعة. لا يتغير التقييم المسجل حتى يُؤكد تصحيح كامل.',
            ),
          }),
    },
  );
  useEffect(() => {
    if (form) memory.form = JSON.stringify(form);
    memory.reason = reason;
  }, [form, reason, memory]);
  useEffect(() => {
    if (cmd.denied) {
      setForm(null);
      setReason('');
      delete memory.form;
      delete memory.reason;
    }
  }, [cmd.denied, memory]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if ((active && dirty) || cmd.pending || cmd.unknown) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [active, dirty, cmd.pending, cmd.unknown]);
  if (!validBinding)
    return (
      <section className="ss-page">
        <h1 dir="auto">{copy('Correction unavailable', 'التصحيح غير متاح')}</h1>
        <p dir="auto" role="alert">
          {copy(
            'The authorized form or its exact rubric could not be read. Reload to check the current record; no replacement score is shown.',
            'تعذر قراءة النموذج المصرح به أو دليله الدقيق. أعد التحميل للتحقق من السجل الحالي؛ لا تُعرض درجة بديلة.',
          )}
        </p>
      </section>
    );
  const criteria: RubricCriterionView[] = rubric!.criteria.map((criterion) => ({
    key: criterion.code,
    title: criterion.label[locale],
    weight: criterion.weight,
    intent: criterion.description[locale],
    guidance: criterion.description[locale],
    anchors: criterion.anchors.map((anchor) => ({
      level: anchor.level as AssessmentLevel,
      label:
        rubric!.levels?.[locale][anchor.level] ??
        copy('Level ' + anchor.level, 'المستوى ' + anchor.level),
      detail: anchor[locale],
    })),
  }));
  const values = criteria.map((criterion) => {
    const value = form!.criteria.find((item) => item.code === criterion.key)!;
    return { level: value.level, note: value.comment };
  });
  const update = (fields: Partial<AssessmentForm['criteria'][number]>) => {
    setForm({
      ...form!,
      criteria: form!.criteria.map((criterion) =>
        criterion.code === criteria[index]!.key
          ? { ...criterion, ...fields }
          : criterion,
      ),
    } as AssessmentForm);
    setValidation([]);
    setReview(false);
  };
  const current = form!.criteria.find(
      (criterion) => criterion.code === criteria[index]!.key,
    )!,
    files = assessment!.evidenceChoices ?? [];
  function issues() {
    const found =
      assessment!.layer === 'external'
        ? externalFormIssues(
            form,
            files.map((file) => file.id),
            true,
            true,
          )
        : assessmentIssues(
            form as AssessmentInput,
            new Date().toISOString().slice(0, 10),
            true,
          );
    return [...found, ...(!validGovernedReason(reason) ? ['REASON'] : [])];
  }
  const criterionIssues = issues();
  const total =
    assessment!.layer === 'external'
      ? externalQuarterPoints(form as ExternalForm) / 4
      : coreQuarterPoints((form as AssessmentInput).criteria) / 4;
  async function submit() {
    const found = issues();
    if (found.length) {
      setValidation(found);
      setReview(false);
      return;
    }
    const result = await cmd.send('correct', {
      issue: issueId,
      expectedRevision: issue!.revision,
      expectedHead: issue!.expectedHead,
      reason: reason.trim(),
      form: { ...form, inputContract: 'SCORES_ONLY_V3' },
    });
    setReview(false);
    if (result) {
      delete memory.form;
      delete memory.reason;
      router.refresh();
    }
  }
  const extra = (
    <>
      <details className="as-overall" open>
        <summary>{copy('Correction details', 'تفاصيل التصحيح')}</summary>
        {'members' in form! && assessment!.layer === 'committee' && (
          <>
            <Field>
              <FieldLabel htmlFor="correction-members">
                {copy('Ordered committee members', 'أعضاء اللجنة بالترتيب')}
              </FieldLabel>
              <Textarea
                id="correction-members"
                dir="auto"
                disabled={blocked}
                rows={3}
                value={(form as AssessmentInput).members.join('\n')}
                onChange={(event) =>
                  setForm({
                    ...form!,
                    members: event.target.value.split('\n'),
                  } as AssessmentInput)
                }
              />
              <p dir="auto">
                {copy(
                  'One actual member per line; at least two distinct names.',
                  'عضو فعلي واحد لكل سطر؛ اسمان مختلفان على الأقل.',
                )}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="correction-date">
                {copy('Assessed date', 'تاريخ التقييم')}
              </FieldLabel>
              <Input
                id="correction-date"
                type="date"
                dir="ltr"
                disabled={blocked}
                max={new Date().toISOString().slice(0, 10)}
                value={(form as AssessmentInput).assessedOn ?? ''}
                onChange={(event) =>
                  setForm({
                    ...form!,
                    assessedOn: event.target.value || null,
                  } as AssessmentInput)
                }
              />
            </Field>
            <label dir="auto" className="as-attestation">
              <input
                type="checkbox"
                disabled={blocked}
                checked={(form as AssessmentInput).attestation}
                onChange={(event) =>
                  setForm({
                    ...form!,
                    attestation: event.target.checked,
                  } as AssessmentInput)
                }
              />
              {copy(
                'I accurately record this committee consensus and its members/date.',
                'أسجل إجماع اللجنة وأعضاءها وتاريخها بدقة.',
              )}
            </label>
          </>
        )}
        <Field data-invalid={validation.includes('REASON')}>
          <FieldLabel htmlFor="correction-reason">
            {copy('Reason for the correction', 'سبب التصحيح')}
          </FieldLabel>
          <Textarea
            id="correction-reason"
            ref={reasonInput}
            aria-invalid={validation.includes('REASON')}
            aria-describedby="correction-reason-help"
            dir="auto"
            disabled={blocked}
            rows={3}
            maxLength={4000}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (validGovernedReason(event.target.value))
                setValidation((current) =>
                  current.filter((issue) => issue !== 'REASON'),
                );
            }}
          />
          <p dir="auto" id="correction-reason-help">
            {copy(
              'Required: 20–2,000 characters. This becomes part of the immutable correction record.',
              'مطلوب: 20–2,000 حرف. يصبح هذا جزءًا من سجل التصحيح الثابت.',
            )}
          </p>
        </Field>
      </details>
    </>
  );
  const feedback = (
    <>
      {validation.length > 0 && (
        <p dir="auto" role="alert">
          {copy(
            modern
              ? 'Select every criterion level and enter a correction reason of 20–2,000 characters. Check the committee details where applicable; notes and external references remain optional.'
              : 'Select all levels and give the required correction reason. Historical assessment context is preserved.',
            modern
              ? 'اختر مستوى لكل معيار وأدخل سببًا للتصحيح من 20 إلى 2,000 حرف. تحقق من تفاصيل اللجنة عند انطباقها؛ وتبقى الملاحظات والمراجع الخارجية اختيارية.'
              : 'اختر جميع المستويات وأدخل سبب التصحيح المطلوب. يُحفظ سياق التقييم السابق.',
          )}
        </p>
      )}
      {cmd.error && !cmd.unknown && (
        <p dir="auto" role="alert">
          {copy(
            'The correction was not confirmed. Your input is retained. Reload the current authorized record and compare it before retrying.',
            'لم يُؤكد التصحيح. يبقى إدخالك محفوظًا. أعد تحميل السجل الحالي المصرح به وقارنه قبل المحاولة مجددًا.',
          )}
        </p>
      )}
      {cmd.unknown && (
        <>
          <p dir="auto" role="status">
            {copy(
              'The result is unknown. Recheck the exact original correction before making another change.',
              'النتيجة غير معروفة. أعد فحص التصحيح الأصلي نفسه قبل إجراء تغيير آخر.',
            )}
          </p>
          {cmd.error === 'ORIGINAL_PAYLOAD_UNAVAILABLE' && (
            <p dir="auto" role="alert">
              {copy(
                'No committed receipt was found. The original input cannot be reconstructed after a full refresh. Keep this command reference and recheck it before another action.',
                'لم يُعثر على إيصال مسجل. لا يمكن إعادة إنشاء الإدخال الأصلي بعد تحديث كامل. احتفظ بمرجع هذا الأمر وأعد فحصه قبل إجراء آخر.',
              )}
            </p>
          )}
          <Button
            disabled={cmd.pending}
            onClick={() =>
              void cmd.retry().then((result) => {
                if (result) router.refresh();
              })
            }
          >
            {copy('Recheck original correction', 'إعادة فحص التصحيح الأصلي')}
          </Button>
        </>
      )}
    </>
  );
  return (
    <section
      className="ss-page as-page"
      data-template="assessment-correction"
      data-locale={locale}
    >
      {guard}
      <AcademicAssessmentWorkspace
        locale={locale}
        variant={
          assessment!.layer === 'external' ? 'independent' : assessment!.layer
        }
        title={
          assessment!.context?.title ??
          copy('Authorized assessment correction', 'تصحيح تقييم مصرح به')
        }
        back={
          <Link
            href={
              assessment!.layer === 'external' && reviewerCapable
                ? '/' + locale + '/reviewer?tab=history'
                : '/' + locale + '/supervision'
            }
          >
            {copy('Back to your workspace', 'العودة إلى مساحة عملك')}
          </Link>
        }
        scope={copy(
          'Original evaluator · append a complete correction; the original remains unchanged.',
          'المقيم الأصلي · إلحاق تصحيح كامل؛ يبقى الأصل دون تغيير.',
        )}
        status={
          cmd.lastResult
            ? copy('Correction recorded', 'سُجل التصحيح')
            : active
              ? copy('Unsaved correction', 'تصحيح غير محفوظ')
              : copy('Read-only record', 'سجل للقراءة فقط')
        }
        tab={tab}
        onTabChange={setTab}
        evidence={
          <>
            <p dir="auto">{issue!.reason}</p>
            <AssessmentSummary
              locale={locale}
              title={copy(
                'Current recorded assessment',
                'التقييم المسجل الحالي',
              )}
              total={String(assessment!.score)}
              rubric={rubric!.code}
              criteria={criteria}
              values={criteria.map((criterion) => {
                const value = original!.criteria.find(
                  (item) => item.code === criterion.key,
                )!;
                return { level: value.level, note: value.comment };
              })}
            >
              <p dir="auto">{original!.overall}</p>
            </AssessmentSummary>
            {assessment!.history.length > 0 && (
              <details>
                <summary>
                  {copy('Immutable correction history', 'سجل التصحيحات الثابت')}
                </summary>
                {assessment!.history.map((entry) => (
                  <p dir="auto" key={entry.id}>
                    {timestamp(locale, entry.finalizedAt)} ·{' '}
                    <bdi dir="ltr">
                      {formatScore(entry.quarterPoints / 4, locale)}/100
                    </bdi>
                  </p>
                ))}
              </details>
            )}
          </>
        }
        assessment={
          active ? (
            <AssessmentCriterionPanel
              locale={locale}
              criteria={criteria}
              values={values}
              criterionComplete={criteria.map(
                (criterion, position) =>
                  values[position]!.level !== null &&
                  !criterionIssues.some((issue) =>
                    issue.startsWith(criterion.key + ':'),
                  ),
              )}
              index={index}
              onCriterionChange={setIndex}
              onChoose={(level) => update({ level })}
              onNote={(comment) => update({ comment })}
              disabled={blocked}
              noteLabel={
                !modern && (current.level === 0 || current.level === 4)
                  ? copy(
                      'Justification required for this level (20–1,000 characters)',
                      'يلزم تبرير لهذا المستوى (20–1,000 حرف)',
                    )
                  : copy(
                      'Criterion comment (optional)',
                      'تعليق المعيار (اختياري)',
                    )
              }
              onReview={() => {
                const found = issues();
                setValidation(found);
                if (found.includes('REASON')) reasonInput.current?.focus();
                if (!found.length) setReview(true);
              }}
              reviewDisabled={blocked}
              readiness={copy(
                modern
                  ? assessment!.layer === 'external'
                    ? 'Complete every criterion before reviewing this full correction. Notes and evidence references are optional.'
                    : 'Complete every criterion before reviewing this full correction. Notes are optional; the saved artifact snapshot remains bound automatically.'
                  : 'Complete every criterion and its evidence references before reviewing this full correction.',
                modern
                  ? assessment!.layer === 'external'
                    ? 'أكمل كل معيار قبل مراجعة هذا التصحيح الكامل. الملاحظات ومراجع الأدلة اختيارية.'
                    : 'أكمل كل معيار قبل مراجعة هذا التصحيح الكامل. الملاحظات اختيارية؛ يبقى ارتباط اللقطة المحفوظة تلقائيًا.'
                  : 'أكمل كل معيار ومراجع أدلته قبل مراجعة هذا التصحيح الكامل.',
              )}
              extra={extra}
              feedback={feedback}
            />
          ) : (
            <>
              <p dir="auto" role="status">
                {copy(
                  'This correction is closed or is no longer authorized. The recorded assessment remains read only.',
                  'أُغلق هذا التصحيح أو لم يعد مصرحًا به. يبقى التقييم المسجل للقراءة فقط.',
                )}
              </p>
              {feedback}
            </>
          )
        }
      />
      <DecisionConfirmation
        open={review}
        onOpenChange={(value) => {
          if (!cmd.pending) setReview(value);
        }}
        title={copy(
          'Append this complete correction?',
          'إلحاق هذا التصحيح الكامل؟',
        )}
        description={copy(
          'The new assessment supersedes the current head without erasing the original. Its full form, reason and evaluator remain attributable. Closed task file access is unchanged.',
          'يحل التقييم الجديد محل النسخة الحالية دون محو الأصل. يبقى النموذج الكامل والسبب والمقيم منسوبين إلى مصدرهم. لا يتغير الوصول المغلق إلى ملفات المهمة.',
        )}
      >
        <AssessmentSummary
          locale={locale}
          title={copy('Proposed correction', 'التصحيح المقترح')}
          total={String(total)}
          rubric={rubric!.code}
          criteria={criteria}
          values={values}
        />
        <p dir="auto">{reason}</p>
        <Button
          variant="outline"
          disabled={cmd.pending}
          onClick={() => setReview(false)}
        >
          {copy('Keep editing', 'متابعة التحرير')}
        </Button>
        <Button disabled={blocked} onClick={() => void submit()}>
          {copy('Confirm correction', 'تأكيد التصحيح')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
