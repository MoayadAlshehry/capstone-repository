'use client';
import { formatScore } from '@capstone/ui/score-format';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  DecisionConfirmation,
  Badge,
} from '@capstone/ui/workspace-v2';
import { useSemesterMemory } from '../semester/memory';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
import {
  TaskHeader,
  tr,
  friendlyDate,
  type Locale,
} from '../onboarding/common';
import { resolutionChoices } from '../auth/return-policy/shared';
import { ResultAlert } from '../account-entry/fields';
import { useGovernedCommand } from './command';
import type { GovernanceView, GovAssessment, GovIssue } from './types';
import { auditActionMessage } from '@capstone/domain/notification-types';

const labels: Record<string, [string, string]> = {
  supervisor: ['Supervisor assessment', 'تقييم المشرف'],
  committee: ['Committee assessment', 'تقييم اللجنة'],
  external: ['Independent assessment', 'التقييم المستقل'],
  transcription_error: ['Transcription error', 'خطأ في نقل البيانات'],
  missing_evidence: ['Missing assessment evidence', 'أدلة تقييم مفقودة'],
  identity_integrity: ['Identity integrity', 'سلامة الهوية'],
  undeclared_conflict: ['Undeclared conflict', 'تعارض غير معلن'],
  internal_disagreement: [
    'Internal assessment discrepancy',
    'اختلاف التقييم الداخلي',
  ],
  access_integrity: ['Access integrity', 'سلامة الوصول'],
  open: ['Open', 'مفتوحة'],
  amendment_authorized: ['Amendment authorized', 'التعديل مصرح به'],
  corrected: ['Assessment corrected', 'صُحح التقييم'],
  invalidated: ['Assessment invalidated', 'أُلغي اعتماد التقييم'],
  explained: ['Explanation recorded', 'سُجل التفسير'],
  resolved_retained: ['Original assessment retained', 'احتُفظ بالتقييم الأصلي'],
  resolved: ['Resolved', 'حُلّت'],
  authorize: [
    'Authorize original-evaluator amendment',
    'التصريح بتعديل المقيّم الأصلي',
  ],
  invalidate: ['Confirm assessment invalidation', 'تأكيد إلغاء اعتماد التقييم'],
  explain: ['Record institutional explanation', 'تسجيل التفسير المؤسسي'],
  hold: ['Open scoped hold', 'فتح تعليق محدد'],
  resolve: ['Resolve with provenance', 'الحل مع توثيق المصدر'],
  retain: ['Retain original assessment', 'الاحتفاظ بالتقييم الأصلي'],
  refresh: ['Refresh academic status', 'تحديث الحالة الأكاديمية'],
  issue: ['Record assessment matter', 'تسجيل مسألة التقييم'],
  original_evaluator_amendment: [
    'Original-evaluator amendment',
    'تعديل المقيّم الأصلي',
  ],
  confirmed_invalidation: ['Confirmed invalidation', 'إلغاء اعتماد مؤكد'],
  institutional_explanation: ['Institutional explanation', 'تفسير مؤسسي'],
  verified_evidence_restoration: [
    'Verified evidence restoration',
    'استعادة أدلة متحقق منها',
  ],
  verified_access_restoration: [
    'Verified access restoration',
    'استعادة وصول متحقق منها',
  ],
};
const label = (locale: Locale, key: string) =>
  labels[key]?.[locale === 'ar' ? 1 : 0] ??
  tr(locale, 'State unavailable', 'الحالة غير متاحة');
const reasonValid = (reason: string) =>
  [...reason.trim()].length >= 20 &&
  [...reason].length <= 2000 &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(
    reason,
  );
export function AdminMatters({
  locale,
  actorId,
  actorRole,
  initial,
  caseId,
  issueId,
}: {
  locale: Locale;
  actorId: string;
  actorRole: string;
  initial: GovernanceView;
  caseId?: string;
  issueId?: string;
}) {
  const t = (en: string, ar: string) => tr(locale, en, ar),
    scope = issueId ?? caseId ?? 'collection',
    memory = useSemesterMemory(actorId, 'governance.admin.' + scope),
    command = useGovernedCommand(actorId, 'admin.' + scope),
    [view, setView] = useState(initial),
    [reason, setReason] = useState(memory['reason'] ?? ''),
    [reference, setReference] = useState(memory['reference'] ?? ''),
    [selectedAssessment, setSelectedAssessment] = useState(
      memory['assessment'] ?? '',
    ),
    [issueType, setIssueType] = useState(memory['type'] ?? ''),
    [resolution, setResolution] = useState(memory['resolution'] ?? ''),
    [attested, setAttested] = useState(memory['attested'] === 'true'),
    [newMatterOpen, setNewMatterOpen] = useState(
      memory['newMatterOpen'] === 'true',
    ),
    [review, setReview] = useState<{
      operation: string;
      body: Record<string, unknown>;
      title: string;
    } | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [recorded, setRecorded] = useState(false);
  const readEpoch = useRef(0);
  const locked = command.pending || command.unknown || command.denied,
    permitted = (a: GovAssessment) =>
      actorRole === 'platform_admin'
        ? a.layer === 'external'
        : actorRole === 'university_admin' && a.layer !== 'external',
    targets = view.assessments.filter(permitted),
    target = targets.find((a) => a.logical === selectedAssessment),
    exitGuard = useAssessmentExit(
      !!reason ||
        !!reference ||
        !!selectedAssessment ||
        !!issueType ||
        !!resolution ||
        attested ||
        command.pending ||
        command.unknown,
      locale,
      () => {
        delete memory['reason'];
        delete memory['reference'];
        delete memory['assessment'];
        delete memory['type'];
        delete memory['resolution'];
        delete memory['attested'];
        delete memory['newMatterOpen'];
        setReason('');
        setReference('');
        setSelectedAssessment('');
        setIssueType('');
        setResolution('');
        setAttested(false);
        setNewMatterOpen(false);
      },
      {
        preserveLocaleSwitch: true,
        canDiscard: !command.pending && !command.unknown,
        ...(!command.pending && !command.unknown
          ? {
              stayLabel: t('Keep editing', 'متابعة التحرير'),
              description: t(
                'Keep editing this reasoned decision, or discard the unsent input before continuing. The academic record changes only after server confirmation.',
                'تابع تحرير هذا القرار المسبب، أو تجاهل المدخلات غير المرسلة قبل المتابعة. لا يتغير السجل الأكاديمي إلا بعد تأكيد الخادم.',
              ),
            }
          : {}),
      },
    );
  const assessmentCaption = (assessment: GovAssessment) => {
    const records = view.assessments.filter(
      (a) => a.case === assessment.case && a.layer === assessment.layer,
    );
    return (
      label(locale, assessment.layer) +
      (records.length > 1
        ? ' · ' +
          t('Record ', 'السجل ') +
          (records.findIndex((a) => a.logical === assessment.logical) + 1)
        : '') +
      ' · ' +
      formatScore(assessment.score, locale) +
      '/100'
    );
  };
  useEffect(() => {
    if (!command.denied) return;
    setView({ cases: [], assessments: [], issues: [] });
    setReason('');
    setReference('');
    setSelectedAssessment('');
    setIssueType('');
    setResolution('');
    setAttested(false);
    setNewMatterOpen(false);
    delete memory['reason'];
    delete memory['reference'];
    delete memory['assessment'];
    delete memory['type'];
    delete memory['resolution'];
    delete memory['attested'];
    delete memory['newMatterOpen'];
  }, [command.denied, memory]);
  useEffect(() => {
    const clear = () => {
      readEpoch.current++;
      setView({ cases: [], assessments: [], issues: [] });
      setReason('');
      setReference('');
      setSelectedAssessment('');
      setIssueType('');
      setResolution('');
      setAttested(false);
      setNewMatterOpen(false);
      setReview(null);
      for (const key of [
        'reason',
        'reference',
        'assessment',
        'type',
        'resolution',
        'attested',
        'newMatterOpen',
      ])
        delete memory[key];
      setLoading(false);
      setError('denied');
    };
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      readEpoch.current++;
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [memory]);
  async function reload() {
    if (loading || command.denied) return;
    setLoading(true);
    setError('');
    const generation = readEpoch.current;
    try {
      const response = await fetch(
        '/api/evaluation-governance' +
          (issueId ? '?issue=' + issueId : caseId ? '?case=' + caseId : ''),
        { cache: 'no-store', headers: { 'X-Workspace-Actor': actorId } },
      );
      if (generation !== readEpoch.current) return;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) {
          setView({ cases: [], assessments: [], issues: [] });
          setReason('');
          setReference('');
          setSelectedAssessment('');
          setIssueType('');
          setResolution('');
          setAttested(false);
          setNewMatterOpen(false);
          setReview(null);
          for (const key of [
            'reason',
            'reference',
            'assessment',
            'type',
            'resolution',
            'attested',
            'newMatterOpen',
          ])
            delete memory[key];
          setError('denied');
          return;
        }
        throw Error();
      }
      const data = (await response.json()) as GovernanceView;
      if (generation !== readEpoch.current) return;
      setView(data);
    } catch {
      if (generation === readEpoch.current) setError('read');
    } finally {
      if (generation === readEpoch.current) setLoading(false);
    }
  }
  function prepare(operation: string, issue?: GovIssue) {
    setError('');
    setRecorded(false);
    if (!reasonValid(reason)) {
      setError('reason');
      document.getElementById('gov-reason')?.focus();
      return;
    }
    const assessment = issue
      ? view.assessments.find((a) => a.logical === issue.logical)
      : target;
    if (!assessment || !permitted(assessment)) {
      setError('selection');
      return;
    }
    const body: Record<string, unknown> = issue
      ? {
          issue: issue.id,
          expectedRevision: issue.revision,
          expectedHead: assessment.head,
          reason: reason.trim(),
        }
      : {
          assessment: assessment.logical,
          expectedHead: assessment.head,
          expectedRevision: assessment.revision,
          type: issueType,
          reason: reason.trim(),
          evidence: reference.trim() ? { reference: reference.trim() } : [],
        };
    if (
      operation === 'issue' &&
      (!issueType ||
        (issueType === 'access_integrity' && assessment.layer !== 'external') ||
        (issueType === 'internal_disagreement' &&
          assessment.layer === 'external'))
    ) {
      setError('selection');
      return;
    }
    if (operation === 'invalidate') {
      if (!attested || !reasonValid(reference)) {
        setError('evidence');
        document.getElementById('gov-reference')?.focus();
        return;
      }
      body['evidence'] = {
        confirmation:
          issue?.type === 'identity_integrity'
            ? 'distinct_identity_confirmation'
            : 'disqualifying_conflict_confirmation',
        reference: reference.trim(),
        namesOnly: false,
      };
    }
    if (operation === 'resolve') {
      if (
        !issue?.hold ||
        !resolutionChoices(
          issue.hold.type,
          issue.hold.state,
          issue.state,
        ).includes(resolution)
      ) {
        setError('selection');
        return;
      }
      body['resolutionKind'] = resolution;
    }
    setReview({
      operation,
      body,
      title:
        (assessment.context?.title ??
          view.cases.find((c) => c.case === assessment.case)?.title ??
          t('Selected assessment', 'التقييم المحدد')) +
        ' · ' +
        assessmentCaption(assessment),
    });
  }
  function clearConfirmedDraft() {
    setReason('');
    setReference('');
    setSelectedAssessment('');
    setIssueType('');
    setResolution('');
    setAttested(false);
    setNewMatterOpen(false);
    for (const key of [
      'reason',
      'reference',
      'assessment',
      'type',
      'resolution',
      'attested',
      'newMatterOpen',
    ])
      delete memory[key];
  }
  async function commit() {
    if (!review) return;
    const result = await command.send(review.operation, review.body);
    setReview(null);
    if (result) {
      setRecorded(true);
      clearConfirmedDraft();
      await reload();
    }
  }
  async function retry() {
    const result = await command.retry();
    if (result) {
      setRecorded(true);
      clearConfirmedDraft();
      await reload();
    }
  }
  function actions(issue: GovIssue, assessment: GovAssessment) {
    if (!permitted(assessment)) return [];
    const active = ['open', 'amendment_authorized'].includes(issue.state),
      result: string[] = [];
    if (
      issue.state === 'open' &&
      ['transcription_error', 'missing_evidence'].includes(issue.type) &&
      !assessment.invalidated &&
      issue.expectedHead === assessment.head
    )
      result.push('authorize');
    if (
      active &&
      ['identity_integrity', 'undeclared_conflict'].includes(issue.type) &&
      !assessment.invalidated
    )
      result.push('invalidate');
    if (issue.state === 'open' && issue.type === 'internal_disagreement')
      result.push('explain');
    if (active && !issue.hold) result.push('hold');
    if (
      issue.hold?.state === 'open' &&
      resolutionChoices(issue.hold.type, issue.hold.state, issue.state).length
    )
      result.push('resolve');
    if (active) result.push('retain');
    result.push('refresh');
    return result;
  }
  return (
    <section
      className="on-page"
      data-locale={locale}
      data-template="evaluation-matters"
      data-selected-issue={issueId}
    >
      <TaskHeader
        locale={locale}
        title={t('Evaluation matters', 'مسائل التقييم')}
        description={t(
          'Reasoned corrections and scoped holds for the selected academic record.',
          'تصحيحات مسببة وتعليقات محددة للسجل الأكاديمي المختار.',
        )}
        back={{
          href:
            '/' +
            locale +
            (actorRole === 'platform_admin'
              ? '/admin/platform'
              : actorRole === 'university_admin'
                ? '/admin/university'
                : '/workspace'),
          label:
            actorRole === 'platform_admin'
              ? t('Back to Universities', 'العودة إلى الجامعات')
              : actorRole === 'university_admin'
                ? t('Back to Projects', 'العودة إلى المشاريع')
                : t('Back to your workspace', 'العودة إلى مساحة عملك'),
        }}
      />
      <Button
        variant="outline"
        disabled={loading || command.pending || command.denied}
        onClick={() => void reload()}
      >
        {t('Refresh current records', 'تحديث السجلات الحالية')}
      </Button>
      {recorded && (
        <ResultAlert
          title={t('Change recorded', 'سُجل التغيير')}
          kind="success"
        >
          {t(
            'The server confirmed the original command. Refresh the record to check its current state.',
            'أكد الخادم الطلب الأصلي. حدّث السجل للتحقق من حالته الحالية.',
          )}
        </ResultAlert>
      )}
      {(error === 'read' ||
        error === 'denied' ||
        command.error ||
        command.unknown) && (
        <ResultAlert
          title={
            command.unknown
              ? t('Check the original request', 'التحقق من الطلب الأصلي')
              : t(
                  'Current record needs checking',
                  'يلزم التحقق من السجل الحالي',
                )
          }
          kind="error"
        >
          {command.unknown
            ? t(
                'The result is uncertain. Retry only the preserved original command before another decision.',
                'النتيجة غير مؤكدة. أعد محاولة الطلب الأصلي المحفوظ فقط قبل قرار آخر.',
              )
            : error === 'denied' || command.denied
              ? t(
                  'Your current access has changed. Open your current workspace to continue.',
                  'تغير وصولك الحالي. افتح مساحة عملك الحالية للمتابعة.',
                )
              : t(
                  'The read or decision could not finish. Your input is retained. Recheck the current record and reason before trying again.',
                  'تعذرت القراءة أو القرار. احتُفظ بمدخلاتك. أعد التحقق من السجل الحالي والسبب قبل المحاولة مجددًا.',
                )}
          {command.unknown && (
            <Button disabled={command.pending} onClick={() => void retry()}>
              {t('Check original request', 'التحقق من الطلب الأصلي')}
            </Button>
          )}
        </ResultAlert>
      )}
      {!caseId && view.cases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 dir="auto">{t('Academic records', 'السجلات الأكاديمية')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="on-person-cards">
              {view.cases.map((c) => (
                <article key={c.case}>
                  <strong>
                    <bdi dir="auto">{c.title}</bdi>
                  </strong>
                  <Button asChild variant="outline">
                    <Link href={`/${locale}/evaluation/issues?case=${c.case}`}>
                      {t('Open evaluation matters', 'فتح مسائل التقييم')}
                    </Link>
                  </Button>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {caseId && view.cases.find((c) => c.case === caseId) && (
        <h2 dir="auto">{view.cases.find((c) => c.case === caseId)!.title}</h2>
      )}
      {targets.length > 0 && (
        <Card className="on-narrow">
          <CardHeader>
            <CardTitle>
              <h2 dir="auto">{t('Decision context', 'سياق القرار')}</h2>
            </CardTitle>
            <CardDescription>
              {t(
                'Administrators authorize or document the process. Only the original evaluator supplies an amended score.',
                'يصرح المديرون بالإجراء أو يوثقونه. يقدم المقيّم الأصلي وحده الدرجة المعدلة.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="on-mutation-form">
              <Field data-invalid={error === 'reason'}>
                <FieldLabel htmlFor="gov-reason">
                  {t('Reason / explanation', 'السبب / التفسير')}
                </FieldLabel>
                <Textarea
                  id="gov-reason"
                  dir="auto"
                  value={reason}
                  maxLength={4000}
                  disabled={locked}
                  onChange={(e) => {
                    setReason(e.target.value);
                    memory['reason'] = e.target.value;
                  }}
                  aria-invalid={error === 'reason'}
                  aria-describedby={
                    error === 'reason'
                      ? 'gov-reason-help gov-reason-error'
                      : 'gov-reason-help'
                  }
                />
                <FieldDescription id="gov-reason-help">
                  {t(
                    '20–2,000 characters. State the institutional reason and relevant record.',
                    'من 20 إلى 2000 حرف. اذكر السبب المؤسسي والسجل المعني.',
                  )}
                </FieldDescription>
                {error === 'reason' && (
                  <FieldError id="gov-reason-error">
                    {t(
                      'Enter a valid reason in the permitted range.',
                      'أدخل سببًا صالحًا ضمن الطول المسموح.',
                    )}
                  </FieldError>
                )}
              </Field>
              <Field data-invalid={error === 'evidence'}>
                <FieldLabel htmlFor="gov-reference">
                  {t('Evidence reference', 'مرجع الأدلة')}
                </FieldLabel>
                <Textarea
                  id="gov-reference"
                  dir="auto"
                  value={reference}
                  maxLength={4000}
                  disabled={locked}
                  onChange={(e) => {
                    setReference(e.target.value);
                    memory['reference'] = e.target.value;
                  }}
                  aria-invalid={error === 'evidence'}
                  aria-describedby={
                    error === 'evidence'
                      ? 'gov-reference-help gov-reference-error'
                      : 'gov-reference-help'
                  }
                />
                <FieldDescription id="gov-reference-help">
                  {t(
                    'Optional context for a new matter. Confirmed invalidation requires 20–2,000 characters of distinct evidence beyond matching names.',
                    'سياق اختياري لمسألة جديدة. يتطلب إلغاء الاعتماد المؤكد دليلًا محددًا من 20 إلى 2000 حرف يتجاوز تشابه الأسماء.',
                  )}
                </FieldDescription>
                {error === 'evidence' && (
                  <FieldError id="gov-reference-error">
                    {t(
                      'Provide the confirmed evidence and acknowledgement before invalidating.',
                      'قدم الأدلة المؤكدة والإقرار قبل إلغاء الاعتماد.',
                    )}
                  </FieldError>
                )}
              </Field>
              <label
                dir="auto"
                className="on-help"
                style={{
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <input
                  type="checkbox"
                  style={{
                    minHeight: 0,
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                    accentColor: 'var(--wv-primary)',
                  }}
                  checked={attested}
                  disabled={locked}
                  onChange={(e) => {
                    setAttested(e.target.checked);
                    memory['attested'] = String(e.target.checked);
                  }}
                />{' '}
                {t(
                  'Identity or conflict evidence is confirmed; matching names alone is insufficient.',
                  'أُكدت أدلة الهوية أو التعارض؛ ولا يكفي تشابه الأسماء وحده.',
                )}
              </label>
              <details
                open={newMatterOpen}
                onToggle={(event) => {
                  setNewMatterOpen(event.currentTarget.open);
                  memory['newMatterOpen'] = String(event.currentTarget.open);
                }}
              >
                <summary>
                  {t(
                    'Record a new assessment matter',
                    'تسجيل مسألة تقييم جديدة',
                  )}
                </summary>
                <div className="on-mutation-form">
                  <Field>
                    <FieldLabel htmlFor="gov-assessment">
                      {t('Recorded assessment', 'التقييم المسجل')}
                    </FieldLabel>
                    <Select
                      value={selectedAssessment}
                      disabled={locked}
                      onValueChange={(value) => {
                        setSelectedAssessment(value);
                        memory['assessment'] = value;
                        setIssueType('');
                        delete memory['type'];
                      }}
                    >
                      <SelectTrigger id="gov-assessment">
                        <SelectValue
                          placeholder={t(
                            'Choose an assessment',
                            'اختر تقييمًا',
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent className="wsv2">
                        {targets.map((a) => (
                          <SelectItem key={a.logical} value={a.logical}>
                            {assessmentCaption(a)} ·{' '}
                            <bdi dir="auto">
                              {a.context?.title ??
                                view.cases.find((c) => c.case === a.case)
                                  ?.title}
                            </bdi>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="gov-type">
                      {t('Matter type', 'نوع المسألة')}
                    </FieldLabel>
                    <Select
                      value={issueType}
                      disabled={locked || !target}
                      onValueChange={(value) => {
                        setIssueType(value);
                        memory['type'] = value;
                      }}
                    >
                      <SelectTrigger id="gov-type">
                        <SelectValue
                          placeholder={t(
                            'Choose the matter type',
                            'اختر نوع المسألة',
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent className="wsv2">
                        {[
                          'transcription_error',
                          'missing_evidence',
                          'identity_integrity',
                          'undeclared_conflict',
                          target?.layer === 'external'
                            ? 'access_integrity'
                            : 'internal_disagreement',
                        ].map((value) => (
                          <SelectItem key={value} value={value}>
                            {label(locale, value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button
                    disabled={locked || !target || !issueType}
                    onClick={() => prepare('issue')}
                  >
                    {label(locale, 'issue')}
                  </Button>
                </div>
              </details>
              {error === 'selection' && (
                <p dir="auto" role="alert">
                  {t(
                    'Choose a current permitted assessment, matter type or resolution process.',
                    'اختر تقييمًا حاليًا مسموحًا ونوع المسألة أو إجراء الحل.',
                  )}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {view.issues
        .filter((issue) => !issueId || issue.id === issueId)
        .map((issue) => {
          const assessment = view.assessments.find(
            (a) => a.logical === issue.logical,
          );
          if (!assessment) return null;
          const available = actions(issue, assessment),
            choices = issue.hold
              ? resolutionChoices(
                  issue.hold.type,
                  issue.hold.state,
                  issue.state,
                )
              : [];
          return (
            <Card key={issue.id}>
              <CardHeader>
                <CardTitle>
                  <h2 dir="auto">
                    {label(locale, issue.type)} ·{' '}
                    {assessmentCaption(assessment)}
                  </h2>
                </CardTitle>
                <CardDescription>
                  <Badge variant="outline">{label(locale, issue.state)}</Badge>{' '}
                  ·{' '}
                  <time dateTime={issue.createdAt}>
                    {friendlyDate(locale, issue.createdAt)}
                  </time>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                  {issue.reason}
                </p>
                {issue.resolution && <p dir="auto">{issue.resolution}</p>}
                {issue.hold && (
                  <p dir="auto">
                    {t('Scoped hold', 'التعليق المحدد')}:{' '}
                    {label(locale, issue.hold.state)}
                  </p>
                )}
                {actorId === assessment.evaluator &&
                  issue.state === 'amendment_authorized' && (
                    <Button asChild variant="outline">
                      <Link
                        href={`/${locale}/evaluation/corrections/${issue.id}`}
                      >
                        {t(
                          'Open authorized amendment',
                          'فتح التعديل المصرح به',
                        )}
                      </Link>
                    </Button>
                  )}
                {available.includes('resolve') && (
                  <Field>
                    <FieldLabel htmlFor={'gov-resolution-' + issue.id}>
                      {t('Resolution process', 'إجراء الحل')}
                    </FieldLabel>
                    <Select
                      value={resolution}
                      disabled={locked}
                      onValueChange={(value) => {
                        setResolution(value);
                        memory['resolution'] = value;
                      }}
                    >
                      <SelectTrigger id={'gov-resolution-' + issue.id}>
                        <SelectValue
                          placeholder={t(
                            'Choose the supported process',
                            'اختر الإجراء المدعوم',
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent className="wsv2">
                        {choices.map((choice) => (
                          <SelectItem key={choice} value={choice}>
                            {label(locale, choice)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <div className="on-actions">
                  {available.map((operation) => (
                    <Button
                      key={operation}
                      variant="outline"
                      disabled={
                        locked ||
                        (operation === 'resolve' &&
                          !choices.includes(resolution))
                      }
                      onClick={() => prepare(operation, issue)}
                    >
                      {label(locale, operation)}
                    </Button>
                  ))}
                </div>
                <details>
                  <summary>
                    {t(
                      'Retained history and exact references',
                      'السجل المحفوظ والمراجع المحددة',
                    )}
                  </summary>
                  <p dir="ltr">
                    {issue.id} · {assessment.head} · {issue.revision}
                  </p>
                  <ol className="on-history">
                    {(issue.history ?? []).map((entry) => (
                      <li key={entry.id}>
                        <strong>
                          {auditActionMessage(
                            'evaluation.governance.' + entry.operation,
                            locale,
                          )}
                        </strong>
                        <p dir="auto">{entry.reason}</p>
                        <time dateTime={entry.occurred_at}>
                          {friendlyDate(locale, entry.occurred_at)}
                        </time>
                      </li>
                    ))}
                  </ol>
                </details>
              </CardContent>
            </Card>
          );
        })}
      {!view.issues.length && (
        <p dir="auto" className="on-help">
          {t(
            'No assessment matters are recorded in this scope.',
            'لا توجد مسائل تقييم مسجلة في هذا النطاق.',
          )}
        </p>
      )}
      <DecisionConfirmation
        open={review !== null}
        onOpenChange={(open) => {
          if (!command.pending && !open) setReview(null);
        }}
        title={label(locale, review?.operation ?? 'issue')}
        description={
          <>
            <p dir="auto">
              <bdi dir="auto">{review?.title}</bdi>
            </p>
            <p dir="auto">{reason}</p>
            <p dir="auto">
              {t(
                'This reasoned action is recorded against the current assessment. Original records remain retained.',
                'يسجل هذا الإجراء المسبب مقابل التقييم الحالي. تبقى السجلات الأصلية محفوظة.',
              )}
            </p>
          </>
        }
      >
        <Button
          variant="outline"
          disabled={command.pending}
          onClick={() => setReview(null)}
        >
          {t('Cancel', 'إلغاء')}
        </Button>
        <Button disabled={command.pending} onClick={() => void commit()}>
          {command.pending
            ? t('Recording…', 'جارٍ التسجيل…')
            : label(locale, review?.operation ?? 'issue')}
        </Button>
      </DecisionConfirmation>
      {exitGuard}
    </section>
  );
}
