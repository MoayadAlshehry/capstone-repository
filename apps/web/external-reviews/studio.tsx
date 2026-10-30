'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFacts } from '@capstone/ui/bidi';
import { deniedRead } from '../semester/read-status';
import { RequestAssessmentReview } from '../shared-experience/correction';
import { reviewReasonValid } from './reason';
import { reviewHistoryReturn } from './history';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  completeExternalDraft,
  declarationKeys,
  emptyExternalForm,
  externalRubric,
  type ExternalForm,
  type ReviewTask,
} from '@capstone/domain/external-reviews';
import type { SemesterFile } from '@capstone/domain';
import {
  ArrowLeft,
  Button,
  DecisionConfirmation,
  Input,
  Item,
  ItemGroup,
  BookOpen,
  CircleCheck,
  Clock3,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@capstone/ui/workspace-v2';
import { assessmentSaveLabel } from '../assessment-studio/view';
import { AcademicEvidence } from '../academic/evidence';
import {
  AcademicAssessmentWorkspace,
  AssessmentCriterionPanel,
  AssessmentSummary,
  type RubricCriterionView,
  type AssessmentLevel,
} from '@capstone/ui/workspace-v2';
import {
  AcademicCommandProtection,
  useAcademicCommand,
} from '../academic/command';
import { useSemesterMemory } from '../semester/memory';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
import { Notice, t, type Locale } from '../semester/common';
type Props = {
  locale: Locale;
  actor: string;
  task: ReviewTask;
  parent: string;
};
const states: Record<string, [string, string]> = {
  offered: ['Offer', 'عرض'],
  accepted: ['In progress', 'قيد العمل'],
  completed: ['Completed', 'مكتمل'],
  declined: ['Declined', 'مرفوض'],
  withdrawn: ['Closed', 'مغلق'],
  expired: ['Expired', 'منتهي'],
  cancelled: ['Cancelled', 'ملغى'],
};
const signature = (form: ExternalForm) =>
  JSON.stringify([
    form.overall,
    form.calibration,
    form.criteria.map((c) => [
      c.code,
      c.level,
      c.comment,
      c.locators.map((l) => [l.file, l.kind, l.reference]),
    ]),
  ]);
const short = [
    'Not demonstrated',
    'Limited',
    'Supported',
    'Strong',
    'Exemplary',
  ],
  shortAr = ['دون دليل', 'محدود', 'مدعوم', 'قوي', 'متميز'];
function externalCriteria(locale: Locale): RubricCriterionView[] {
  return externalRubric.criteria.map((c) => ({
    key: c.code,
    title: c.label[locale],
    weight: c.weight,
    intent:
      c.description[locale].split('. ')[0]!.split(/[;؛]/)[0]! +
      (locale === 'en' ? '.' : ''),
    guidance: c.description[locale],
    anchors: c.anchors.map((a) => ({
      level: a.level as AssessmentLevel,
      label: (locale === 'ar' ? shortAr : short)[a.level]!,
      detail: a[locale],
    })),
  }));
}
function reviewDate(locale: Locale, value: string) {
  return (
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Riyadh',
    }).format(new Date(value)) + ' · UTC+3'
  );
}
function Back({ locale, parent }: { locale: Locale; parent: string }) {
  return (
    <Link className="ss-back" href={parent}>
      <ArrowLeft aria-hidden="true" size={16} />
      {t(locale, 'Back to review tasks', 'العودة لمهام التحكيم')}
    </Link>
  );
}
function TaskHeading({ locale, task }: { locale: Locale; task: ReviewTask }) {
  return (
    <header className="ss-heading">
      <div>
        <p dir="auto" className="ac-eyebrow">
          {t(locale, 'Independent academic review', 'تحكيم أكاديمي مستقل')}
        </p>
        <h1 dir="auto">
          {task.project?.title ?? t(locale, 'Academic review', 'تحكيم أكاديمي')}
        </h1>
        <p dir="auto">
          {task.status === 'completed'
            ? t(
                locale,
                'Your independent assessment is recorded and read only.',
                'سُجل تقييمك المستقل وأصبح للقراءة فقط.',
              )
            : ['declined', 'expired', 'cancelled', 'withdrawn'].includes(
                  task.status,
                )
              ? t(locale, 'Your personal task record.', 'سجل مهمتك الشخصي.')
              : t(
                  locale,
                  'Read the original work. Make your own private assessment.',
                  'اقرأ العمل الأصلي، ثم قدم تقييمك المستقل والخاص.',
                )}
        </p>
      </div>
    </header>
  );
}
export function IndependentTasks({
  locale,
  model,
  actor,
  tab,
  search,
  calibrationRequired,
}: {
  locale: Locale;
  model: { items: ReviewTask[]; serverTime: string };
  actor: string;
  tab: string;
  search: string;
  calibrationRequired: boolean;
}) {
  const active = ['offers', 'progress', 'history'].includes(tab)
      ? tab
      : 'offers',
    copy = (en: string, ar: string) => t(locale, en, ar),
    router = useRouter(),
    [q, setQ] = useState(search),
    [searchReady, setSearchReady] = useState(false),
    memory = useSemesterMemory(actor, 'independent-collection');
  useEffect(() => {
    setQ(search);
    setSearchReady(true);
  }, [search]);
  useEffect(() => {
    const key = 'scroll.' + active + '.' + search;
    requestAnimationFrame(() => window.scrollTo(0, Number(memory[key] ?? 0)));
    const remember = () => {
      memory[key] = String(window.scrollY);
    };
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [active, search, memory]);
  const shown = model.items.filter(
      (x) =>
        (active === 'offers'
          ? x.status === 'offered'
          : active === 'progress'
            ? x.status === 'accepted'
            : !['offered', 'accepted'].includes(x.status)) &&
        (!search ||
          x.project?.title
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())),
    ),
    back =
      '/' +
      locale +
      '/reviewer?' +
      new URLSearchParams({ tab: active, q: search });
  return (
    <section
      className="ss-page ir-tasks"
      data-template="independent-tasks"
      data-locale={locale}
    >
      <header className="ss-heading">
        <div>
          <h1 dir="auto">{copy('Independent review', 'التحكيم المستقل')}</h1>
          <p dir="auto">
            {copy(
              'Your offers, active reviews and personal results.',
              'عروضك وتحكيماتك الحالية ونتائجك الشخصية.',
            )}
          </p>
        </div>
      </header>
      {calibrationRequired && (
        <Notice
          locale={locale}
          title={copy(
            'Complete rubric acknowledgment',
            'أكمل الإقرار بقراءة المعايير',
          )}
        >
          <p dir="auto">
            {copy(
              'To receive new offers, read and acknowledge the current independent-review rubric in your own profile. Approval alone does not complete this step.',
              'لتلقي عروض جديدة، اقرأ معايير التحكيم المستقل الحالية وأقرّ بقراءتها في ملفك الشخصي. لا يكفي اعتماد الملف لإكمال هذه الخطوة.',
            )}
          </p>
          <Button asChild variant="outline">
            <Link
              href={
                '/' +
                locale +
                '/reviewer/profile?context=independent&returnTo=' +
                encodeURIComponent(back)
              }
            >
              {copy('Review rubric', 'مراجعة المعايير')}
            </Link>
          </Button>
        </Notice>
      )}
      <Tabs
        value={active}
        onValueChange={(v) =>
          router.push(
            '/' +
              locale +
              '/reviewer?' +
              new URLSearchParams({ tab: v, q: search }),
          )
        }
      >
        <TabsList aria-label={copy('Review tasks', 'مهام التحكيم')}>
          {[
            ['offers', 'Offers', 'العروض'],
            ['progress', 'In progress', 'قيد العمل'],
            ['history', 'History', 'السجل'],
          ].map(([v, en, ar]) => (
            <TabsTrigger
              key={v}
              value={v!}
              aria-controls="independent-task-records"
            >
              {copy(en!, ar!)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <form
        className="ir-search"
        aria-busy={!searchReady}
        onSubmit={(e) => {
          e.preventDefault();
          router.push(
            '/' +
              locale +
              '/reviewer?' +
              new URLSearchParams({ tab: active, q }),
          );
        }}
      >
        <Input
          disabled={!searchReady}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={250}
          aria-label={copy('Search your tasks', 'ابحث في مهامك')}
          placeholder={copy('Search project topic', 'ابحث عن موضوع المشروع')}
        />
        <Button variant="outline" type="submit" disabled={!searchReady}>
          {copy('Search', 'بحث')}
        </Button>
      </form>
      <ItemGroup
        className="ir-rows"
        role={shown.length ? 'list' : undefined}
        id="independent-task-records"
      >
        {shown.slice(0, 100).map((x) => {
          const url =
            '/' +
            locale +
            '/reviewer/tasks/' +
            x.id +
            '?from=' +
            encodeURIComponent(back);
          return (
            <Item className="ir-row" key={x.id} role="listitem">
              <div className="ir-task-icon" aria-hidden="true">
                {x.status === 'completed' ? (
                  <CircleCheck />
                ) : x.status === 'offered' ? (
                  <Clock3 />
                ) : (
                  <BookOpen />
                )}
              </div>
              <div>
                <Link className="ir-topic" href={url}>
                  <bdi dir="auto">
                    {x.project?.title ??
                      copy('Academic review', 'تحكيم أكاديمي')}
                  </bdi>
                </Link>
                <p dir="auto" className="ss-muted">
                  {copy('Academic work', 'عمل أكاديمي')} ·{' '}
                  <span>
                    {copy(
                      x.project?.domain === 'software'
                        ? 'Software'
                        : x.project?.domain === 'data'
                          ? 'Data'
                          : 'Computing',
                      x.project?.domain === 'software'
                        ? 'البرمجيات'
                        : x.project?.domain === 'data'
                          ? 'البيانات'
                          : 'الحوسبة',
                    )}
                  </span>{' '}
                  ·{' '}
                  {(x.languages ?? [])
                    .map((l) =>
                      l === 'ar'
                        ? copy('Arabic', 'العربية')
                        : copy('English', 'الإنجليزية'),
                    )
                    .join(' / ')}
                </p>
                <p dir="auto">
                  {x.status === 'offered'
                    ? copy('Respond by', 'الرد قبل')
                    : x.status === 'accepted'
                      ? copy('Due', 'الموعد النهائي')
                      : copy('Closed', 'أُغلق')}{' '}
                  {reviewDate(
                    locale,
                    x.status === 'offered'
                      ? x.expiresAt
                      : x.status === 'accepted'
                        ? (x.dueAt ?? x.expiresAt)
                        : (x.completedAt ??
                          x.closedAt ??
                          x.dueAt ??
                          x.expiresAt),
                  )}
                  {x.status === 'accepted' &&
                    ' · ' +
                      copy(
                        `${x.progress ?? 0} of 4 selected`,
                        `${x.progress ?? 0} من 4 محددة`,
                      )}
                </p>
              </div>
              <div>
                <span className="ir-state">
                  {t(locale, ...(states[x.status] ?? states.cancelled!))}
                </span>
                <Button asChild variant="outline">
                  <Link href={url}>
                    {x.status === 'offered'
                      ? copy('Review offer', 'مراجعة الدعوة')
                      : x.status === 'accepted'
                        ? copy('Continue review', 'متابعة التحكيم')
                        : x.status === 'completed'
                          ? copy('View own result', 'عرض نتيجتي')
                          : copy('View task record', 'عرض سجل المهمة')}
                  </Link>
                </Button>
              </div>
            </Item>
          );
        })}
      </ItemGroup>
      {!shown.length && (
        <div className="ss-empty">
          <h2 dir="auto">
            {search
              ? copy('No matching tasks', 'لا توجد مهام مطابقة')
              : active === 'offers'
                ? copy('No offers waiting', 'لا توجد عروض تنتظر الرد')
                : active === 'progress'
                  ? copy('No review in progress', 'لا يوجد تحكيم قيد العمل')
                  : copy('No closed tasks yet', 'لا توجد مهام مغلقة بعد')}
          </h2>
          <p dir="auto">
            {search
              ? copy(
                  'Try another project topic or clear the search to see every task in this tab.',
                  'جرّب موضوع مشروع آخر أو امسح البحث لعرض جميع المهام في علامة التبويب هذه.',
                )
              : copy(
                  'Tasks appear here when the review service assigns work to your account.',
                  'تظهر المهام هنا عندما تسند خدمة التحكيم عملاً إلى حسابك.',
                )}
          </p>
        </div>
      )}
      {shown.length > 100 && (
        <p dir="auto">
          {copy(
            'Showing the latest 100 matching tasks. Narrow your search.',
            'تظهر أحدث 100 مهمة مطابقة. ضيق نطاق البحث.',
          )}
        </p>
      )}
    </section>
  );
}
const declarations: [string, string][] = [
  ['I have no personal or financial conflict.', 'ليس لدي تعارض شخصي أو مالي.'],
  ['I have not collaborated on this work.', 'لم أتعاون في هذا العمل.'],
  [
    'I did not participate in its assessment committee.',
    'لم أشارك في لجنة تقييمه.',
  ],
  [
    'I have not seen prior scores or assessments.',
    'لم أطلع على درجات أو تقييمات سابقة.',
  ],
  [
    'I will not seek other scores while reviewing.',
    'لن أسعى للاطلاع على درجات الآخرين أثناء التحكيم.',
  ],
];
export function IndependentOffer({ locale, actor, task, parent }: Props) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    memory = useSemesterMemory(actor, task.id),
    cmd = useAcademicCommand(
      memory,
      task.id,
      actor,
      '/api/external-reviews',
      task.id,
    ),
    router = useRouter(),
    [checks, setChecks] = useState<boolean[]>(() => {
      try {
        const value: unknown = JSON.parse(
          memory['offer.declarations'] ?? 'null',
        );
        if (
          Array.isArray(value) &&
          value.length === 5 &&
          value.every((item) => typeof item === 'boolean')
        )
          return value;
      } catch {}
      return declarations.map(() => false);
    }),
    [modal, setModal] = useState<'accept' | 'decline' | null>(null),
    [reason, setReason] = useState(memory['offer.reason'] ?? '');
  const pending = cmd.state === 'saving' || cmd.state === 'unknown';
  const exitGuard = useAssessmentExit(
    !pending && (checks.some(Boolean) || !!reason),
    locale,
    () => {
      setChecks(declarations.map(() => false));
      setReason('');
      delete memory['offer.declarations'];
      delete memory['offer.reason'];
    },
    {
      preserveLocaleSwitch: true,
      stayLabel: copy('Keep editing', 'متابعة التحرير'),
      description: copy(
        'Keep your declarations and unsent explanation here, or discard them before continuing. The offer is unchanged until you confirm your response.',
        'احتفظ بإقراراتك وتوضيحك غير المرسل هنا، أو تجاهلهما قبل المتابعة. لا يتغير العرض حتى تؤكد ردك.',
      ),
    },
  );
  useEffect(() => {
    memory['offer.declarations'] = JSON.stringify(checks);
    memory['offer.reason'] = reason;
    const unload = (event: BeforeUnloadEvent) => {
      if (checks.some(Boolean) || reason) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const clear = () => {
      setChecks(declarations.map(() => false));
      setReason('');
      delete memory['offer.declarations'];
      delete memory['offer.reason'];
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [checks, reason, memory]);
  async function decide() {
    const value = await cmd.send({
      assignment: task.id,
      revision: task.revision,
      operation: modal,
      body:
        modal === 'accept'
          ? Object.fromEntries(declarationKeys.map((k, i) => [k, checks[i]]))
          : { reason },
    });
    if (value) completeOffer();
  }
  function completeOffer() {
    delete memory['offer.declarations'];
    delete memory['offer.reason'];
    setModal(null);
    router.refresh();
  }
  return (
    <section
      className="ss-page as-page ir-offer"
      data-template="independent-offer"
      data-locale={locale}
    >
      {exitGuard}
      <AcademicCommandProtection locale={locale} command={cmd} />
      <Back locale={locale} parent={parent} />
      <header className="ss-heading">
        <div>
          <p dir="auto" className="as-kicker">
            {copy(
              'Independent assessment · Review offer',
              'التقييم المستقل · دعوة للتحكيم',
            )}
          </p>
          <h1 dir="auto">
            {task.project?.title ?? copy('Your review offer', 'دعوة تحكيمك')}
          </h1>
        </div>
      </header>
      <div className="ir-offer-grid">
        <section className="ir-summary">
          <h2 dir="auto">{copy('Review scope', 'نطاق التحكيم')}</h2>
          <p dir="auto">
            {task.policy === 'FULL_FINAL_ARTIFACTS_V2'
              ? copy(
                  'Read all Public and Restricted originals in this one frozen final after acceptance. Your four-criterion assessment stays private.',
                  'اقرأ جميع الأصول العامة والمقيدة في هذا العمل النهائي المحفوظ بعد القبول. يبقى تقييمك بأربعة معايير خاصًا.',
                )
              : copy(
                  'This existing offer authorizes its original selected final evidence. Acceptance preserves that selection, and your assessment stays private.',
                  'يتيح هذا العرض القائم الأدلة النهائية المختارة أصلًا. يحافظ القبول على هذا النطاق ويبقى تقييمك خاصًا.',
                )}
          </p>
          <BidiFacts className="ac-metadata">
            <BidiLabel dir="auto">{copy('Reply before', 'الرد قبل')}</BidiLabel>
            <BidiData dir="auto">{reviewDate(locale, task.expiresAt)}</BidiData>
            <BidiLabel dir="auto">
              {copy('Review window', 'مدة التحكيم')}
            </BidiLabel>
            <BidiData dir="auto">
              {copy('14 days from acceptance', '14 يومًا من القبول')}
            </BidiData>
          </BidiFacts>
        </section>
        <section
          className="ir-declarations"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <h2 dir="auto">{copy('Before accepting', 'قبل القبول')}</h2>
          <p dir="auto">
            {copy(
              'Confirm each statement. If any is untrue, decline and explain the conflict.',
              'أكد كل عبارة. إذا لم تصح إحداها، ارفض الدعوة مع توضيح التعارض.',
            )}
          </p>
          {[
            {
              start: 0,
              end: 3,
              title: copy('Conflict of interest', 'تعارض المصالح'),
            },
            {
              start: 3,
              end: 5,
              title: copy('Independent judgment', 'حكم مستقل'),
            },
          ].map((group) => (
            <fieldset className="as-offer-declarations" key={group.start}>
              <legend dir="auto">{group.title}</legend>
              {declarations.slice(group.start, group.end).map(([en, ar], n) => {
                const i = group.start + n;
                return (
                  <label dir="auto" className="ir-check" key={i}>
                    <input
                      type="checkbox"
                      checked={checks[i]}
                      onChange={(e) =>
                        setChecks(
                          checks.map((x, j) =>
                            j === i ? e.target.checked : x,
                          ),
                        )
                      }
                      disabled={pending}
                    />
                    <span>{copy(en, ar)}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
          <p dir="auto" className="as-readiness">
            {copy(
              'Confirm all five statements before accepting.',
              'أكد العبارات الخمس قبل القبول.',
            )}
          </p>
          <div className="ac-form-actions">
            <Button
              disabled={!checks.every(Boolean) || pending}
              onClick={() => setModal('accept')}
            >
              {copy('Accept review', 'قبول التحكيم')}
            </Button>
            <Button
              pending={pending}
              variant="outline"
              disabled={pending}
              onClick={() => setModal('decline')}
            >
              {copy('Decline', 'رفض')}
            </Button>
          </div>
          {modal === null && (
            <CommandStatus
              locale={locale}
              cmd={cmd}
              onReceipt={completeOffer}
            />
          )}
        </section>
      </div>
      <DecisionConfirmation
        open={modal !== null}
        onOpenChange={(v) => {
          if (!v && !pending) setModal(null);
        }}
        title={
          modal === 'accept'
            ? copy('Accept this review?', 'قبول هذا التحكيم؟')
            : copy('Decline this offer?', 'رفض هذا العرض؟')
        }
        description={
          modal === 'accept'
            ? copy(
                'Your fourteen-day review window starts now. Access is limited to this exact final submission.',
                'تبدأ الآن مدة التحكيم البالغة أربعة عشر يومًا. يقتصر الوصول على هذا الإرسال النهائي الدقيق.',
              )
            : copy(
                'A brief reason is required so the service can close this offer honestly.',
                'يلزم سبب موجز لتغلق الخدمة هذا العرض بصورة واضحة.',
              )
        }
      >
        <CommandStatus locale={locale} cmd={cmd} onReceipt={completeOffer} />
        <Button
          pending={pending}
          variant="outline"
          disabled={pending}
          onClick={() => setModal(null)}
        >
          {copy('Cancel', 'إلغاء')}
        </Button>
        {modal === 'decline' && (
          <>
            <Label htmlFor="ir-decline">{copy('Reason', 'السبب')}</Label>
            <Textarea
              id="ir-decline"
              value={reason}
              disabled={pending}
              maxLength={800}
              dir="auto"
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        )}
        <Button
          disabled={
            pending || (modal === 'decline' && !reviewReasonValid(reason))
          }
          onClick={() => void decide()}
        >
          {modal === 'accept'
            ? copy('Confirm acceptance', 'تأكيد القبول')
            : copy('Confirm decline', 'تأكيد الرفض')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
function CommandStatus({
  locale,
  cmd,
  onReceipt,
}: {
  locale: Locale;
  cmd: ReturnType<typeof useAcademicCommand>;
  onReceipt: (value: Record<string, unknown>) => void;
}) {
  return (
    <div className="ir-command" role="status">
      {cmd.state === 'unknown' ? (
        <>
          <p dir="auto">
            {t(
              locale,
              'Outcome unknown. Reconcile the original command before continuing.',
              'النتيجة غير معروفة. تحقق من الأمر الأصلي قبل المتابعة.',
            )}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              void cmd.recheck().then((v) => {
                if (v) onReceipt(v);
              })
            }
          >
            {t(locale, 'Check saved outcome', 'التحقق من النتيجة المحفوظة')}
          </Button>
        </>
      ) : cmd.state === 'conflict' ? (
        <p dir="auto">
          {t(
            locale,
            'Conflict: another tab changed this draft. Compare the saved draft below.',
            'تعارض: غيرت نافذة أخرى هذه المسودة. قارن المسودة المحفوظة أدناه.',
          )}
        </p>
      ) : cmd.state === 'saving' ? (
        t(locale, 'Saving…', 'جارٍ الحفظ…')
      ) : cmd.error ? (
        <p dir="auto" role="alert">
          {t(
            locale,
            'This action could not be completed. Reload to check current eligibility and deadlines.',
            'تعذر إكمال الإجراء. أعد التحميل للتحقق من الأهلية والمواعيد الحالية.',
          )}
        </p>
      ) : null}
    </div>
  );
}
export function IndependentDesk({ locale, actor, task, parent }: Props) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    router = useRouter(),
    memory = useSemesterMemory(actor, task.id),
    key = 'independent.form.' + task.id;
  const initial = () => {
    try {
      const local = JSON.parse(memory[key] ?? 'null') as ExternalForm | null;
      if (local && Array.isArray(local.criteria) && local.criteria.length === 4)
        return completeExternalDraft(local);
    } catch {}
    return completeExternalDraft(task.draft);
  };
  const [form, setForm] = useState<ExternalForm>(initial),
    [saved, setSaved] = useState(completeExternalDraft(task.draft)),
    [revision, setRevision] = useState(task.revision),
    [index, setIndex] = useState(
      Math.min(3, Math.max(0, Number(memory[key + '.criterion'] ?? 0))),
    ),
    [tab, setTab] = useState(memory[key + '.tab'] ?? 'evidence'),
    [review, setReview] = useState(false),
    [total, setTotal] = useState<number | null>(null),
    [confirm, setConfirm] = useState(false),
    [withdrawOpen, setWithdrawOpen] = useState(false),
    [withdrawReason, setWithdrawReason] = useState(
      memory[key + '.withdraw'] ?? '',
    ),
    [withdrawError, setWithdrawError] = useState(false),
    [denied, setDenied] = useState(!task.usable),
    [compare, setCompare] = useState<ReviewTask | null>(null),
    [checking, setChecking] = useState(false),
    [checkError, setCheckError] = useState(false);
  const cmd = useAcademicCommand(
      memory,
      task.id,
      actor,
      '/api/external-reviews',
      task.id,
    ),
    pending = useRef<ExternalForm | null>(null),
    dirty = signature(form) !== signature(saved),
    blocked =
      denied ||
      ['saving', 'unknown', 'conflict', 'unavailable'].includes(cmd.state),
    selected = form.criteria.filter((c) => c.level !== null).length;
  const exitGuard = useAssessmentExit(
    (dirty || !!withdrawReason) && !['saving', 'unknown'].includes(cmd.state),
    locale,
    () => {
      setForm(saved);
      memory[key] = JSON.stringify(saved);
      setWithdrawReason('');
      setWithdrawError(false);
      delete memory[key + '.withdraw'];
    },
  );
  const invalidate = useCallback(() => {
    setDenied(true);
    setReview(false);
    setConfirm(false);
    setWithdrawOpen(false);
  }, []);
  useEffect(() => {
    memory[key] = JSON.stringify(form);
    setReview(false);
    setTotal(null);
  }, [form, memory, key]);
  useEffect(() => {
    memory[key + '.criterion'] = String(index);
    memory[key + '.tab'] = tab;
  }, [index, tab, memory, key]);
  useEffect(() => {
    memory[key + '.withdraw'] = withdrawReason;
  }, [withdrawReason, memory, key]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
        if (dirty || withdrawReason) {
          e.preventDefault();
          e.returnValue = '';
        }
      },
      clear = () => {
        setForm(emptyExternalForm());
        setSaved(emptyExternalForm());
        pending.current = null;
        setWithdrawReason('');
        delete memory[key + '.withdraw'];
        invalidate();
      };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [dirty, withdrawReason, invalidate, memory, key]);
  const receipt = (value: Record<string, unknown>) => {
    if (value.status === 'completed' || value.status === 'withdrawn') {
      delete memory[key];
      delete memory[key + '.pending'];
      delete memory[key + '.withdraw'];
      setWithdrawReason('');
      invalidate();
      router.refresh();
    } else if (typeof value.revision === 'number') {
      setRevision(value.revision);
      let payload = pending.current;
      if (!payload) {
        try {
          payload = JSON.parse(
            memory[key + '.pending'] ?? 'null',
          ) as ExternalForm | null;
        } catch {}
      }
      if (payload) {
        setSaved(payload);
        setForm(payload);
      }
      pending.current = null;
      delete memory[key + '.pending'];
    }
  };
  async function save() {
    pending.current = {
      ...structuredClone(form),
      overall: form.overall.trim().normalize('NFC'),
      criteria: form.criteria.map((c) => ({
        ...c,
        comment: c.comment.trim().normalize('NFC'),
      })),
    };
    memory[key + '.pending'] = JSON.stringify(pending.current);
    const value = await cmd.send({
      assignment: task.id,
      operation: 'save',
      revision,
      body: pending.current,
    });
    if (value) receipt(value);
  }
  async function withdraw() {
    if (!reviewReasonValid(withdrawReason)) {
      setWithdrawError(true);
      document.getElementById('ir-withdraw-reason')?.focus();
      return;
    }
    setWithdrawError(false);
    const value = await cmd.send({
      assignment: task.id,
      operation: 'withdraw',
      revision,
      body: { reason: withdrawReason.trim() },
    });
    if (value) receipt(value);
  }
  async function check() {
    setChecking(true);
    setCheckError(false);
    try {
      const r = await fetch('/api/external-reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actor,
        },
        body: JSON.stringify({
          assignment: task.id,
          operation: 'check',
          revision,
          body: form,
          command: crypto.randomUUID(),
        }),
      });
      const value = await r.json();
      if (r.ok) {
        setTotal(value.total);
        setReview(true);
      } else if (r.status === 409) {
        await loadCompare();
      } else if (deniedRead(r.status)) invalidate();
      else setCheckError(true);
    } catch {
      setCheckError(true);
      setTotal(null);
    } finally {
      setChecking(false);
    }
  }
  async function loadCompare() {
    try {
      const r = await fetch('/api/external-reviews?assignment=' + task.id, {
        cache: 'no-store',
        headers: { 'X-Workspace-Actor': actor },
      });
      if (r.ok) setCompare(await r.json());
      else if (deniedRead(r.status)) invalidate();
      else setCheckError(true);
    } catch {
      setCheckError(true);
    }
  }
  const update = (fields: Partial<ExternalForm['criteria'][number]>) =>
    setForm({
      ...form,
      criteria: form.criteria.map((c, i) =>
        i === index ? { ...c, ...fields } : c,
      ),
    });
  const files: SemesterFile[] = (task.files ?? []).map((f) => ({
    ...f,
    project: task.context?.project,
    version: task.context?.version,
    name: f.path.split('/').at(-1)!,
    extension: f.path.split('.').at(-1)!,
    visibility: f.visibility,
    status: 'ready',
  }));
  const draftStatus = assessmentSaveLabel(
    locale,
    cmd.state,
    dirty,
    revision > 0,
  );
  const viewCriteria = externalCriteria(locale),
    viewValues = form.criteria.map((c) => ({
      level: c.level,
      note: c.comment,
    }));
  const panel = (
    <AssessmentCriterionPanel
      locale={locale}
      criteria={viewCriteria}
      values={viewValues}
      index={index}
      onCriterionChange={setIndex}
      onChoose={(level) => update({ level })}
      onNote={(comment) => update({ comment })}
      disabled={blocked}
      onSave={() => void save()}
      saveDisabled={blocked || !dirty}
      onReview={() => void check()}
      reviewDisabled={blocked || selected !== 4 || checking}
      readiness={
        selected !== 4
          ? copy(
              'Choose all four levels before review.',
              'اختر المستويات الأربعة قبل المراجعة.',
            )
          : copy(
              'Review all four selections before irreversible finalization.',
              'راجع الاختيارات الأربعة قبل التثبيت النهائي.',
            )
      }
      feedback={
        <>
          {checkError && (
            <p dir="auto" role="alert">
              {copy(
                'The assessment could not be checked. Please try again.',
                'تعذر التحقق من التقييم. حاول مرة أخرى.',
              )}
            </p>
          )}
          <CommandStatus locale={locale} cmd={cmd} onReceipt={receipt} />
          {cmd.state === 'conflict' && (
            <Button variant="outline" onClick={() => void loadCompare()}>
              {copy('Compare saved draft', 'مقارنة المسودة المحفوظة')}
            </Button>
          )}
          {compare && (
            <section className="ir-conflict">
              <h3 dir="auto">
                {copy('Saved in the other tab', 'المحفوظ في النافذة الأخرى')}
              </h3>
              {externalRubric.criteria.map((c) => (
                <p dir="auto" key={c.code}>
                  {c.label[locale]}:{' '}
                  {compare.draft?.criteria.find((v) => v.code === c.code)
                    ?.level ?? copy('Not selected', 'غير محدد')}
                  <br />
                  {
                    compare.draft?.criteria.find((v) => v.code === c.code)
                      ?.comment
                  }
                </p>
              ))}
              <Button
                variant="outline"
                onClick={() => {
                  const next = completeExternalDraft(compare.draft);
                  setForm(next);
                  setSaved(next);
                  setRevision(compare.revision);
                  cmd.reset();
                  setCompare(null);
                }}
              >
                {copy('Use saved draft', 'استخدام المسودة المحفوظة')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSaved(completeExternalDraft(compare.draft));
                  setRevision(compare.revision);
                  cmd.reset();
                  setCompare(null);
                }}
              >
                {copy(
                  'Keep my changes to save explicitly',
                  'الاحتفاظ بتغييراتي لحفظها صراحة',
                )}
              </Button>
            </section>
          )}
        </>
      }
    />
  );
  return (
    <section
      className="ss-page as-page"
      data-template="independent-desk"
      data-locale={locale}
    >
      {exitGuard}
      <AcademicCommandProtection locale={locale} command={cmd} />
      <AcademicAssessmentWorkspace
        locale={locale}
        variant="independent"
        title={task.project?.title ?? copy('Your review', 'تحكيمك')}
        back={
          <Link href={parent}>
            {copy('Back to task queue', 'العودة إلى قائمة المهام')}
          </Link>
        }
        scope={
          task.policy === 'FULL_FINAL_ARTIFACTS_V2'
            ? copy(
                'Read-only originals · assigned frozen final',
                'الأصول للقراءة فقط · العمل النهائي المحفوظ المسند',
              )
            : copy(
                'Read-only originals · authorized final selection',
                'الأصول للقراءة فقط · الاختيار النهائي المصرح به',
              )
        }
        status={
          denied ? copy('Access unavailable', 'الوصول غير متاح') : draftStatus
        }
        due={reviewDate(locale, task.dueAt ?? task.expiresAt)}
        tab={tab}
        onTabChange={setTab}
        evidence={
          !denied && task.context ? (
            <AcademicEvidence
              locale={locale}
              actor={actor}
              project={task.context.project}
              version={task.context.version}
              submission={task.context.submission}
              files={files}
              publicLabel={copy('Public', 'عام')}
              scopeKey={task.id}
              authorityUrl={'/api/external-reviews?assignment=' + task.id}
              queryUrl={(mode, file) =>
                '/api/review-files?' +
                new URLSearchParams({
                  assignment: task.id,
                  ...task.context,
                  mode,
                  ...(file ? { file } : {}),
                  ...(mode === 'preview' ? { syntax: 'studio' } : {}),
                })
              }
              onDenied={invalidate}
            />
          ) : (
            <p dir="auto" role="alert">
              {copy(
                'Evidence access is unavailable. Do not infer a score.',
                'الوصول إلى الأدلة غير متاح. لا تستنتج درجة.',
              )}
            </p>
          )
        }
        assessment={panel}
      />
      {!denied && (
        <div className="ac-form-actions">
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() => setWithdrawOpen(true)}
          >
            {copy('Withdraw review', 'الانسحاب من التحكيم')}
          </Button>
        </div>
      )}
      <DecisionConfirmation
        open={withdrawOpen}
        onOpenChange={(open) => {
          if (!['saving', 'unknown'].includes(cmd.state)) setWithdrawOpen(open);
        }}
        title={copy('Withdraw from this review?', 'الانسحاب من هذا التحكيم؟')}
        description={copy(
          'This closes your task and its evidence access immediately. No score is submitted. Your unsent assessment will be discarded; the saved draft will no longer be editable.',
          'يغلق هذا الإجراء مهمتك والوصول إلى أدلتها فورًا. لا تُرسل أي درجة. يُتجاهل تقييمك غير المرسل، ولن تعود المسودة المحفوظة قابلة للتحرير.',
        )}
      >
        <Label htmlFor="ir-withdraw-reason">
          {copy('Reason for withdrawal', 'سبب الانسحاب')}
        </Label>
        <Textarea
          id="ir-withdraw-reason"
          value={withdrawReason}
          disabled={blocked}
          maxLength={800}
          dir="auto"
          aria-invalid={withdrawError || undefined}
          aria-describedby="ir-withdraw-help"
          onChange={(event) => {
            setWithdrawReason(event.target.value);
            setWithdrawError(false);
          }}
        />
        <p
          dir="auto"
          id="ir-withdraw-help"
          role={withdrawError ? 'alert' : undefined}
        >
          {copy(
            'Enter a brief explanation of 3–400 characters without line breaks.',
            'اكتب توضيحًا موجزًا من 3 إلى 400 حرف دون فواصل أسطر.',
          )}
        </p>
        <Button
          variant="outline"
          disabled={['saving', 'unknown'].includes(cmd.state)}
          onClick={() => setWithdrawOpen(false)}
        >
          {copy('Cancel', 'إلغاء')}
        </Button>
        <Button disabled={blocked} onClick={() => void withdraw()}>
          {copy('Confirm withdrawal', 'تأكيد الانسحاب')}
        </Button>
        <CommandStatus locale={locale} cmd={cmd} onReceipt={receipt} />
      </DecisionConfirmation>
      <Sheet open={review} onOpenChange={setReview}>
        <SheetContent
          className="wsv2 as-sheet"
          closeLabel={copy('Close assessment review', 'إغلاق مراجعة التقييم')}
        >
          <SheetHeader>
            <SheetTitle>
              {copy('Review assessment', 'مراجعة التقييم')}
            </SheetTitle>
            <SheetDescription>
              <bdi dir="auto">{task.project?.title}</bdi>
            </SheetDescription>
          </SheetHeader>
          <AssessmentSummary
            locale={locale}
            title={copy('Assessment summary', 'ملخص التقييم')}
            total={total === null ? null : String(total)}
            rubric="EXTERNAL_V1"
            criteria={viewCriteria}
            values={viewValues}
            onEdit={(i) => {
              setIndex(i);
              setTab('assessment');
              setReview(false);
            }}
          >
            <p dir="auto">
              {copy(
                'Finalization locks your private assessment and ends Restricted evidence access. This is not a course grade.',
                'يقفل التثبيت تقييمك الخاص وينهي الوصول إلى الأدلة المقيدة. هذا ليس درجة مقرر.',
              )}
            </p>
            <Button
              disabled={blocked || total === null}
              onClick={() => setConfirm(true)}
            >
              {copy('Finalize my assessment', 'إنهاء تقييمي')}
            </Button>
          </AssessmentSummary>
        </SheetContent>
      </Sheet>
      <DecisionConfirmation
        open={confirm}
        onOpenChange={setConfirm}
        title={copy('Finalize your assessment?', 'إنهاء تقييمك؟')}
        description={copy(
          'This is irreversible. Your saved result becomes read only and Restricted evidence access closes immediately.',
          'هذا الإجراء نهائي. تصبح نتيجتك المحفوظة للقراءة فقط ويغلق الوصول إلى الأدلة المقيدة فورًا.',
        )}
      >
        <Button variant="outline" onClick={() => setConfirm(false)}>
          {copy('Cancel', 'إلغاء')}
        </Button>
        <Button
          disabled={blocked}
          onClick={() => {
            void cmd
              .send({
                assignment: task.id,
                operation: 'finalize',
                revision,
                body: form,
              })
              .then((value) => {
                if (value) receipt(value);
              });
          }}
        >
          {copy('Confirm finalization', 'تأكيد الإنهاء')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
export function IndependentResult({
  locale,
  actor,
  task,
  name,
  parent,
}: Props & { name: string }) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    a = task.assessment,
    router = useRouter(),
    memory = useSemesterMemory(actor, task.id),
    cmd = useAcademicCommand(
      memory,
      task.id,
      actor,
      '/api/external-reviews',
      task.id,
    );
  return (
    <section
      className="ss-page as-page as-result-page"
      data-template="independent-result"
      data-locale={locale}
    >
      <AcademicCommandProtection locale={locale} command={cmd} />
      <CommandStatus
        locale={locale}
        cmd={cmd}
        onReceipt={() => router.refresh()}
      />
      <Link className="ss-back" href={reviewHistoryReturn(locale, parent)}>
        <ArrowLeft size={16} />
        {copy('Back to review history', 'العودة لسجل التحكيم')}
      </Link>
      <TaskHeading locale={locale} task={task} />
      <p dir="auto" className="ir-state">
        {t(locale, ...(states[task.status] ?? states.cancelled!))}
      </p>
      {a ? (
        <>
          <AssessmentSummary
            locale={locale}
            title={copy('Assessment summary', 'ملخص التقييم')}
            total={String(a.total)}
            rubric="EXTERNAL_V1"
            criteria={externalCriteria(locale)}
            values={externalRubric.criteria.map((c) => {
              const value = a.criteria.find((x) => x.code === c.code);
              return {
                level: value?.level ?? null,
                note: value?.comment ?? '',
              };
            })}
            attribution={
              <>
                <bdi dir="auto">{name}</bdi> ·{' '}
                {reviewDate(locale, a.finalizedAt)}
              </>
            }
          />
          <RequestAssessmentReview
            key={a.id}
            locale={locale}
            actorId={actor}
            assessment={a.id}
            logical={a.logical}
            headRevision={a.headRevision}
            layer="external"
            caseId={task.case}
          />
        </>
      ) : (
        <>
          <h2 dir="auto">{copy('This task is closed', 'هذه المهمة مغلقة')}</h2>
          <p dir="auto">
            {task.status === 'expired'
              ? copy(
                  'The response or review deadline has passed. No assessment was inferred or submitted.',
                  'انقضى موعد الرد أو التحكيم. لم تستنتج أي درجة أو ترسل أي تقييم.',
                )
              : copy(
                  'This task no longer permits review. Your history remains available.',
                  'لم تعد هذه المهمة تسمح بالتحكيم. يبقى سجلك متاحًا.',
                )}
          </p>
        </>
      )}
      <p dir="auto" className="ss-muted">
        {copy(
          'This independent repository assessment is not a course grade. Restricted evidence access has ended.',
          'هذا تقييم مستقل للمستودع وليس درجة مقرر. انتهى الوصول إلى الأدلة المقيدة.',
        )}
      </p>
    </section>
  );
}
