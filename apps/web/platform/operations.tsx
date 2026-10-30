'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFact, BidiFacts } from '@capstone/ui/bidi';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  Input,
  Textarea,
  DecisionConfirmation,
  Badge,
} from '@capstone/ui/workspace-v2';
import {
  TaskHeader,
  friendlyDate,
  tr,
  type Locale,
} from '../onboarding/common';
import { ResultAlert } from '../account-entry/fields';
import { useSemesterMemory } from '../semester/memory';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
export interface AllocationDiagnostics {
  policy: string;
  cases: {
    case: string;
    project: string;
    title: string;
    version: string;
    state: string;
    eligible: boolean | null;
    coverage: number;
    active: number;
    run: string | null;
    reasons: string[] | null;
    history: unknown[];
    progression: unknown;
  }[];
  run: {
    id: string;
    policy: string;
    hash: string;
    executedAt: string;
    inputs: unknown;
    outputs: unknown;
  } | null;
  cursor: unknown;
}
export function SchedulingRecords({
  locale,
  data,
}: {
  locale: Locale;
  data: AllocationDiagnostics;
}) {
  const t = (en: string, ar: string) => tr(locale, en, ar);
  return (
    <section
      className="on-page"
      data-locale={locale}
      data-template="institution-scheduling"
    >
      <TaskHeader
        locale={locale}
        title={t('Evaluation scheduling', 'جدولة التقييم')}
        description={t(
          'Read-only scheduling records in your current institutional scope.',
          'سجلات جدولة للقراءة فقط ضمن نطاق مؤسستك الحالي.',
        )}
        back={{
          href: `/${locale}/admin/university`,
          label: t('Back to Projects', 'العودة إلى المشاريع'),
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 dir="auto">
              {t('Independent review scheduling', 'جدولة التقييم المستقل')}
            </h2>
          </CardTitle>
          <CardDescription>
            {t(
              'Read the current admission and assignment records. Scheduling remains automatic.',
              'اقرأ سجلات القبول والإسناد الحالية. تبقى الجدولة تلقائية.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            onClick={() => location.reload()}
          >
            {t('Refresh operational records', 'تحديث السجلات التشغيلية')}
          </Button>
          {data.cases.length ? (
            <div className="on-person-cards">
              {data.cases.map((item) => (
                <article key={item.case}>
                  <div>
                    <h3 dir="auto">
                      {item.title || t('Untitled project', 'مشروع دون عنوان')}
                    </h3>
                    <p dir="auto">
                      {t('Completed reviews', 'التقييمات المكتملة')}:{' '}
                      <bdi dir="ltr">{item.coverage}</bdi> ·{' '}
                      {t('Active offers or tasks', 'العروض أو المهام النشطة')}:{' '}
                      <bdi dir="ltr">{item.active}</bdi>
                    </p>
                    <details>
                      <summary>
                        {t('Operational details', 'التفاصيل التشغيلية')}
                      </summary>
                      <pre
                        dir="ltr"
                        style={{
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {JSON.stringify(
                          {
                            case: item.case,
                            version: item.version,
                            state: item.state,
                            eligible: item.eligible,
                            reasons: item.reasons,
                            progression: item.progression,
                            history: item.history,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                  <div className="on-actions">
                    <Button asChild variant="outline">
                      <Link
                        href={`/${locale}/evaluation/issues?case=${item.case}`}
                      >
                        {t('Evaluation matters', 'مسائل التقييم')}
                      </Link>
                    </Button>
                    {item.run && (
                      <Button asChild variant="ghost">
                        <Link
                          href={`/${locale}/evaluation/allocation?run=${item.run}`}
                        >
                          {t('View scheduling run', 'عرض تنفيذ الجدولة')}
                        </Link>
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p dir="auto" className="on-help">
              {t(
                'No academic cases are available in this view.',
                'لا توجد حالات أكاديمية في هذا العرض.',
              )}
            </p>
          )}
          {data.cases.length === 100 && (
            <p dir="auto" className="on-help">
              {t(
                'This authorized view is bounded to the latest 100 academic cases.',
                'يقتصر هذا العرض المصرح به على أحدث 100 حالة أكاديمية.',
              )}
            </p>
          )}
        </CardContent>
      </Card>
      {data.run && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 dir="auto">{t('Scheduling run', 'تنفيذ الجدولة')}</h2>
            </CardTitle>
            <CardDescription>
              <time dateTime={data.run.executedAt}>
                {friendlyDate(locale, data.run.executedAt)}
              </time>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <details>
              <summary>
                {t(
                  'Policy and immutable run details',
                  'السياسة وتفاصيل التنفيذ الثابتة',
                )}
              </summary>
              <pre
                dir="ltr"
                style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {JSON.stringify(data.run, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 dir="auto">
              {t('Activity and provenance', 'النشاط ومصدر السجلات')}
            </h2>
          </CardTitle>
          <CardDescription>
            {t(
              'Read exact actions in your current authorized audit scope.',
              'اقرأ الإجراءات الدقيقة ضمن نطاق التدقيق المصرح به الحالي.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/${locale}/audit`}>
              {t('Open activity records', 'فتح سجلات النشاط')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
interface MetadataRecord {
  id: string;
  version: string;
  metadataRevision: number;
  university: string;
  universityAr: string;
  department: string;
  authors: { id: string; name: string }[];
  supervisor: { name: string };
  metadata: {
    title: string;
    abstract: string;
    keywords: string[];
    academic_year: string;
    domain: string;
  };
}
export function MetadataAccess({
  locale,
  actorId,
  project: initialProject,
}: {
  locale: Locale;
  actorId: string;
  project: string;
}) {
  const t = (en: string, ar: string) => tr(locale, en, ar),
    memory = useSemesterMemory(
      actorId,
      'operations.metadata.' + (initialProject || 'manual'),
    ),
    [project, setProject] = useState(initialProject || memory.project || ''),
    [reason, setReason] = useState(memory.reason ?? ''),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [denied, setDenied] = useState(false),
    [error, setError] = useState(''),
    [record, setRecord] = useState<MetadataRecord | null>(null),
    trigger = useRef<HTMLButtonElement>(null),
    epoch = useRef(0),
    guard = useAssessmentExit(
      !!reason || (!record && project !== initialProject),
      locale,
      () => {
        delete memory.project;
        delete memory.reason;
      },
      {
        preserveLocaleSwitch: true,
        canDiscard: !busy,
        stayLabel: t('Keep editing', 'متابعة التحرير'),
        description: t(
          'Keep editing the project reference and reason, or discard your input before continuing.',
          'تابع تحرير مرجع المشروع والسبب، أو تجاهل مدخلاتك قبل المتابعة.',
        ),
      },
    );
  useEffect(() => {
    memory.project = project;
    memory.reason = reason;
  }, [memory, project, reason]);
  useEffect(() => {
    const clear = () => {
      epoch.current++;
      setRecord(null);
      setReason('');
      setReview(false);
      setBusy(false);
      setDenied(true);
      setError('unavailable');
    };
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      epoch.current++;
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [memory]);
  function prepare(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(project)) {
      setError('project');
      document.getElementById('ops-project')?.focus();
      return;
    }
    if (reason.trim().length < 3 || reason.length > 400) {
      setError('reason');
      document.getElementById('ops-reason')?.focus();
      return;
    }
    setReview(true);
  }
  async function readMetadata() {
    if (busy || denied) return;
    setBusy(true);
    setError('');
    const generation = epoch.current;
    try {
      const response = await fetch('/api/drafts/governance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actorId,
        },
        body: JSON.stringify({ project, reason: reason.trim() }),
        cache: 'no-store',
      });
      if (generation !== epoch.current) return;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) setRecord(null);
        setError(
          [401, 403, 404].includes(response.status) ? 'unavailable' : 'failed',
        );
        return;
      }
      const data = (await response.json()) as MetadataRecord;
      if (generation !== epoch.current) return;
      setRecord(data);
      setReason('');
      delete memory.reason;
    } catch {
      if (generation === epoch.current) setError('unknown');
    } finally {
      if (generation === epoch.current) {
        setBusy(false);
        setReview(false);
      }
    }
  }
  return (
    <section
      className="on-page"
      data-locale={locale}
      data-template="platform-metadata-access"
    >
      <TaskHeader
        locale={locale}
        title={t(
          'Reasoned metadata access',
          'الوصول المسبب إلى البيانات الوصفية',
        )}
        description={t(
          'Read one current project record for a stated institutional purpose.',
          'اقرأ سجل مشروع حالي لغرض مؤسسي محدد.',
        )}
        back={{
          href: `/${locale}/admin/platform`,
          label: t('Back to Universities', 'العودة إلى الجامعات'),
        }}
      />
      {guard}
      <Card className="on-narrow">
        <CardHeader>
          <CardTitle>
            <h2 dir="auto">
              {t('Selected project and reason', 'المشروع المحدد والسبب')}
            </h2>
          </CardTitle>
          <CardDescription>
            {t(
              'Each confirmed read records your identity, exact project and reason. It does not grant access to native files.',
              'تسجل كل قراءة مؤكدة هويتك والمشروع المحدد والسبب. ولا تمنح وصولًا إلى الملفات الأصلية.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={prepare} noValidate className="on-mutation-form">
            <Field data-invalid={error === 'project'}>
              <FieldLabel htmlFor="ops-project">
                {t('Project reference', 'مرجع المشروع')}
              </FieldLabel>
              <Input
                id="ops-project"
                dir="ltr"
                value={project}
                disabled={busy || denied}
                maxLength={36}
                onChange={(e) => {
                  setProject(e.target.value);
                  setRecord(null);
                }}
                aria-invalid={error === 'project'}
                aria-describedby={
                  error === 'project'
                    ? 'ops-project-help ops-project-error'
                    : 'ops-project-help'
                }
              />
              <FieldDescription id="ops-project-help">
                {t(
                  'Use the exact project reference from an authorized operational record.',
                  'استخدم مرجع المشروع المحدد من سجل تشغيلي مصرح به.',
                )}
              </FieldDescription>
              {error === 'project' && (
                <FieldError id="ops-project-error">
                  {t(
                    'Enter a valid project reference.',
                    'أدخل مرجع مشروع صالحًا.',
                  )}
                </FieldError>
              )}
            </Field>
            <Field data-invalid={error === 'reason'}>
              <FieldLabel htmlFor="ops-reason">
                {t('Institutional reason', 'السبب المؤسسي')}
              </FieldLabel>
              <Textarea
                id="ops-reason"
                dir="auto"
                value={reason}
                disabled={busy || denied}
                maxLength={400}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={error === 'reason'}
                aria-describedby={
                  error === 'reason'
                    ? 'ops-reason-help ops-reason-error'
                    : 'ops-reason-help'
                }
              />
              <FieldDescription id="ops-reason-help">
                {t(
                  'A concise reason of 3–400 characters is required.',
                  'يلزم سبب موجز من 3 إلى 400 حرف.',
                )}
              </FieldDescription>
              {error === 'reason' && (
                <FieldError id="ops-reason-error">
                  {t(
                    'Check the reason and its permitted length.',
                    'تحقق من السبب وطوله المسموح.',
                  )}
                </FieldError>
              )}
            </Field>
            <Button type="submit" ref={trigger} disabled={busy || denied}>
              {t(
                'Review metadata access',
                'مراجعة الوصول إلى البيانات الوصفية',
              )}
            </Button>
          </form>
          {['unknown', 'unavailable', 'failed'].includes(error) && (
            <ResultAlert
              title={t('Metadata was not loaded', 'لم تُحمّل البيانات الوصفية')}
              kind="error"
            >
              {error === 'unknown'
                ? t(
                    'The read response was interrupted. Try again to make another logged read; your details are kept.',
                    'انقطع رد القراءة. حاول مجددًا لإجراء قراءة مسجلة أخرى؛ تبقى التفاصيل محفوظة.',
                  )
                : error === 'unavailable'
                  ? t(
                      'This record could not be read under your current access. Check the reference and current account before trying again.',
                      'تعذرت قراءة هذا السجل ضمن وصولك الحالي. تحقق من المرجع والحساب الحالي قبل المحاولة مجددًا.',
                    )
                  : t(
                      'The metadata service could not complete this read. Your details are kept for another attempt.',
                      'تعذر على خدمة البيانات الوصفية إكمال القراءة. تبقى التفاصيل محفوظة للمحاولة مجددًا.',
                    )}
            </ResultAlert>
          )}
        </CardContent>
      </Card>
      {record && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 dir="auto">
                {record.metadata.title ||
                  t('Untitled project', 'مشروع دون عنوان')}
              </h2>
            </CardTitle>
            <CardDescription>
              {t(
                'Current read-only metadata',
                'البيانات الوصفية الحالية للقراءة فقط',
              )}{' '}
              <Badge variant="outline">{t('Logged read', 'قراءة مسجلة')}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BidiFacts className="on-facts">
              <BidiFact>
                <BidiLabel dir="auto">{t('Institution', 'المؤسسة')}</BidiLabel>
                <BidiData dir="auto">
                  <bdi dir="auto">
                    {locale === 'ar' ? record.universityAr : record.university}
                  </bdi>
                </BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">
                  {t('Department / academic year', 'القسم / السنة الأكاديمية')}
                </BidiLabel>
                <BidiData dir="ltr">
                  {record.department} · {record.metadata.academic_year}
                </BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">{t('Abstract', 'الملخص')}</BidiLabel>
                <BidiData dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                  {record.metadata.abstract || t('Not entered', 'لم يُدخل')}
                </BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">
                  {t('Keywords', 'الكلمات المفتاحية')}
                </BidiLabel>
                <BidiData dir="auto">
                  {record.metadata.keywords.map((word) => (
                    <bdi dir="auto" key={word}>
                      {word}{' '}
                    </bdi>
                  ))}
                </BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">{t('Authors', 'المؤلفون')}</BidiLabel>
                <BidiData dir="auto">
                  {record.authors.map((author) => (
                    <p dir="auto" key={author.id}>
                      <bdi dir="auto">{author.name}</bdi>
                    </p>
                  ))}
                </BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">{t('Supervisor', 'المشرف')}</BidiLabel>
                <BidiData dir="auto">
                  <bdi dir="auto">{record.supervisor.name}</bdi>
                </BidiData>
              </BidiFact>
            </BidiFacts>
            <details>
              <summary>
                {t('Exact record references', 'مراجع السجل المحددة')}
              </summary>
              <p dir="ltr">
                {record.id} · {record.version} · {record.metadataRevision}
              </p>
            </details>
          </CardContent>
        </Card>
      )}
      <DecisionConfirmation
        open={review}
        onOpenChange={(open) => {
          if (!busy) setReview(open);
        }}
        title={t('Confirm this reasoned read?', 'تأكيد هذه القراءة المسببة؟')}
        description={
          <>
            <p dir="auto">
              {t(
                'Your identity and reason will be recorded for this exact project. Only current metadata is returned.',
                'ستُسجل هويتك والسبب لهذا المشروع المحدد. تُعرض البيانات الوصفية الحالية فقط.',
              )}
            </p>
            <p dir="ltr">{project}</p>
            <p dir="auto">{reason}</p>
          </>
        }
      >
        <Button
          pending={busy}
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setReview(false);
            trigger.current?.focus();
          }}
        >
          {t('Cancel', 'إلغاء')}
        </Button>
        <Button
          pending={busy}
          type="button"
          disabled={busy}
          onClick={() => void readMetadata()}
        >
          {busy
            ? t('Reading…', 'جارٍ القراءة…')
            : t('Read current metadata', 'قراءة البيانات الوصفية الحالية')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
