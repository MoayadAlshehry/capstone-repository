'use client';
import type { ReactNode } from 'react';
import { PublicShell } from '../public-adoption/shell';
import { Button as PublicButton } from '@/components/ui/button';
import { Input as PublicInput } from '@/components/ui/input';
import {
  Field as PublicField,
  FieldLabel as PublicFieldLabel,
} from '@/components/ui/field';
import { Card, CardContent } from '@/components/ui/card';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
function GuestEntryShell({
  active,
  locale,
  children,
  onLocaleChange,
}: {
  active: boolean;
  locale: 'en' | 'ar';
  children: ReactNode;
  onLocaleChange: (href: string) => void;
}) {
  return active ? (
    <PublicShell locale={locale} onLocaleChange={onLocaleChange}>
      {children}
    </PublicShell>
  ) : (
    children
  );
}

import { BrandLogo } from '@capstone/ui/brand-logo';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  AcademicAssessmentWorkspace,
  AssessmentCriterionPanel,
  AssessmentSummary,
  DecisionConfirmation,
  type AssessmentLevel,
  type RubricCriterionView,
} from '@capstone/ui/workspace-v2';
import { AcademicEvidence } from '../academic/evidence';
import { SemesterMemory } from '../semester/memory';
import type { GuestView, MemberPayload } from './types';
import {
  canonicalMemberPayload,
  classifyMemberOutcome,
  guestScope,
  isGuestView,
  type PendingMemberWrite,
} from './outcome';
import { AppearanceSelect } from '../shared-appearance';
const fresh = (): MemberPayload => ({
  inputContract: 'SCORES_ONLY_V3',
  criteria: Array.from({ length: 7 }, (_, i) => ({
    code: 'C' + (i + 1),
    level: null,
    comment: '',
    locators: [],
  })),
  overall: '',
  calibration: false,
});
const canonicalPayload = canonicalMemberPayload;
export function CommitteeGuest({
  locale,
  invitation,
}: {
  locale: 'en' | 'ar';
  invitation: string;
}) {
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en),
    secret = useRef('');
  const [view, setView] = useState<GuestView | null>(null),
    [loading, setLoading] = useState(true),
    [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [sent, setSent] = useState(false),
    [hasInvitation, setHasInvitation] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [wait, setWait] = useState(0);
  async function read() {
    const r = await fetch('/api/committee-guest?invitation=' + invitation, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const latest: unknown = await r.json();
      if (!isGuestView(latest)) throw Error('STATUS_UNAVAILABLE');
      setView(latest);
      return latest;
    }
    if (r.status === 404) return null;
    throw Error('STATUS_UNAVAILABLE');
  }
  useEffect(() => {
    const capture = () => {
      const incoming = new URLSearchParams(location.hash.slice(1)).get('token');
      if (incoming && /^[A-Za-z0-9_-]{43}$/.test(incoming))
        secret.current = incoming;
      setHasInvitation(!!secret.current);
      if (location.hash)
        history.replaceState(
          history.state,
          '',
          location.pathname + location.search,
        );
    };
    capture();
    window.addEventListener('hashchange', capture);
    void read()
      .catch(() =>
        setMessage(
          t(
            'The assessment service is temporarily unavailable. Retry your invitation shortly.',
            'خدمة التقييم غير متاحة مؤقتًا. أعد فتح دعوتك بعد قليل.',
          ),
        ),
      )
      .finally(() => setLoading(false));
    return () => window.removeEventListener('hashchange', capture);
  }, [invitation]);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  async function verify(operation: 'challenge' | 'verify') {
    if (operation === 'verify' && !/^[0-9]{6}$/.test(code)) {
      setMessage(
        t(
          'Enter the complete six-digit verification code.',
          'أدخل رمز التحقق كاملًا من ستة أرقام.',
        ),
      );
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/committee-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          invitation,
          token: secret.current,
          email,
          ...(operation === 'verify' ? { code } : {}),
        }),
      });
      if (!r.ok) throw Error('VERIFICATION_UNAVAILABLE');
      if (operation === 'challenge') {
        setSent(true);
        setWait(60);
        setMessage(
          t(
            'If this invitation and address match, a code will arrive shortly. The code expires in ten minutes.',
            'إذا تطابقت الدعوة والعنوان فسيصلك رمز قريبًا. تنتهي صلاحيته خلال عشر دقائق.',
          ),
        );
      } else {
        if (!r.ok || !(await read())) throw Error();
        setCode('');
        secret.current = '';
        setHasInvitation(false);
      }
    } catch {
      setMessage(
        t(
          'Verification is unavailable. Check the latest six-digit code and invited address, or reopen your latest invitation. No assessment access was granted.',
          'التحقق غير متاح. تحقق من أحدث رمز مكون من ستة أرقام والعنوان المدعو، أو افتح أحدث دعوة. لم تُمنح صلاحية التقييم.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const FooterElement = view ? 'footer' : 'p';
  return (
    <SemesterMemory>
      <GuestEntryShell
        active={!view}
        locale={locale}
        onLocaleChange={(href) => {
          location.href =
            href + (secret.current ? '#token=' + secret.current : '');
        }}
      >
        <div
          className={view ? 'wsv2 committee-entry' : 'pu-committee-entry'}
          data-locale={locale}
          dir="ltr"
        >
          {view && (
            <header className="committee-header">
              <a href={'/' + locale} aria-label="Capstone Repository">
                <BrandLogo
                  decorative
                  label="Capstone Repository"
                  className="committee-brand-logo"
                />
              </a>
              <span>
                {t('Private committee assessment', 'تقييم اللجنة الخاص')}
              </span>
              <AppearanceSelect locale={locale} />
              <Button
                variant="ghost"
                onClick={() => {
                  const next = locale === 'en' ? 'ar' : 'en';
                  location.href =
                    '/' +
                    next +
                    '/committee/' +
                    invitation +
                    (secret.current ? '#token=' + secret.current : '');
                }}
              >
                {locale === 'en' ? 'العربية' : 'English'}
              </Button>
            </header>
          )}
          <main
            id={view ? 'main-content' : 'main'}
            className={view ? undefined : 'wrap'}
          >
            {!view && (
              <p className="pu-eyebrow mb-6">
                {t('Private committee assessment', 'تقييم اللجنة الخاص')}
              </p>
            )}
            {loading ? (
              <p dir="auto" role="status">
                {t('Checking your invitation…', 'جارٍ التحقق من دعوتك…')}
              </p>
            ) : view ? (
              <GuestAssessment
                key={view.invitation + ':' + (view.amendment?.id ?? 'original')}
                locale={locale}
                view={view}
                onReload={async () => {
                  const latest = await read();
                  if (!latest) {
                    setView(null);
                    setMessage(
                      t(
                        'Your session ended or this invitation is no longer available. Verify your latest invitation to continue.',
                        'انتهت جلستك أو لم تعد هذه الدعوة متاحة. تحقق من أحدث دعوة للمتابعة.',
                      ),
                    );
                  }
                  return latest;
                }}
                onEnd={() => {
                  secret.current = '';
                  setHasInvitation(false);
                  setView(null);
                  setSent(false);
                  setCode('');
                  window.dispatchEvent(new Event('account-draft-cleared'));
                }}
              />
            ) : (
              <section
                className="pu-guest-verification"
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              >
                <div className="pu-guest-intro">
                  <p dir="auto" className="pu-eyebrow">
                    {t('Your expertise. Your assessment.', 'خبرتك. تقييمك.')}
                  </p>
                  <h1 dir="auto">
                    {t(
                      'Assess one project, independently.',
                      'قيّم مشروعًا واحدًا باستقلالية.',
                    )}
                  </h1>
                  <p dir="auto">
                    {t(
                      'Use the email address that received this invitation. Verification opens a private, time-limited workspace for this exact submission. You do not need a platform account.',
                      'استخدم البريد الذي تلقى هذه الدعوة. يفتح التحقق مساحة خاصة ومؤقتة لهذا الإرسال فقط. لا تحتاج إلى حساب في المنصة.',
                    )}
                  </p>
                  <ul>
                    <li>
                      {t(
                        'Seven transparent rubric criteria',
                        'سبعة معايير تقييم واضحة',
                      )}
                    </li>
                    <li>
                      {t('Original frozen evidence', 'أدلة أصلية محفوظة')}
                    </li>
                    <li>
                      {t(
                        'Only your own draft and submitted result',
                        'مسودتك ونتيجتك المرسلة فقط',
                      )}
                    </li>
                  </ul>
                </div>
                <Card>
                  <CardContent>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void verify(sent ? 'verify' : 'challenge');
                      }}
                      className="pu-guest-form"
                    >
                      <h2 dir="auto">
                        {sent
                          ? t('Check your email', 'تحقق من بريدك')
                          : t('Verify your invited email', 'وثّق بريدك المدعو')}
                      </h2>
                      {!hasInvitation && (
                        <p dir="auto" role="alert">
                          {t(
                            'Reopen the latest link in your invitation email to begin verification.',
                            'افتح أحدث رابط في بريد الدعوة لبدء التحقق.',
                          )}
                        </p>
                      )}
                      <PublicField>
                        <PublicFieldLabel htmlFor="guest-email">
                          {t('Invited email address', 'عنوان البريد المدعو')}
                        </PublicFieldLabel>
                        <PublicInput
                          id="guest-email"
                          type="email"
                          dir="ltr"
                          autoComplete="email"
                          required
                          maxLength={254}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </PublicField>
                      {sent && (
                        <PublicField>
                          <PublicFieldLabel htmlFor="guest-code">
                            {t(
                              'Six-digit verification code',
                              'رمز التحقق من ستة أرقام',
                            )}
                          </PublicFieldLabel>
                          <InputOTP
                            id="guest-code"
                            dir="ltr"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern={REGEXP_ONLY_DIGITS}
                            minLength={6}
                            maxLength={6}
                            required
                            value={code}
                            onChange={(next) =>
                              setCode(next.replace(/[^0-9]/g, ''))
                            }
                          >
                            <InputOTPGroup>
                              {Array.from({ length: 6 }, (_, index) => (
                                <InputOTPSlot key={index} index={index} />
                              ))}
                            </InputOTPGroup>
                          </InputOTP>
                        </PublicField>
                      )}
                      <PublicButton
                        type="submit"
                        disabled={
                          busy || !hasInvitation || (sent && code.length !== 6)
                        }
                      >
                        {busy
                          ? t('Please wait…', 'يرجى الانتظار…')
                          : sent
                            ? t(
                                'Verify and open assessment',
                                'التحقق وفتح التقييم',
                              )
                            : t('Send verification code', 'إرسال رمز التحقق')}
                      </PublicButton>
                      {sent && (
                        <PublicButton
                          type="button"
                          variant="outline"
                          disabled={busy || wait > 0}
                          onClick={() => void verify('challenge')}
                        >
                          {wait > 0
                            ? t(
                                `Resend in ${wait}s`,
                                `إعادة الإرسال خلال ${wait} ثانية`,
                              )
                            : t('Send a new code', 'إرسال رمز جديد')}
                        </PublicButton>
                      )}
                      {message && (
                        <p dir="auto" role="status" aria-live="polite">
                          {message}
                        </p>
                      )}
                      <p dir="auto" className="text-sm text-muted-foreground">
                        {t(
                          'A link alone never grants access. Codes are single-use; resending replaces the previous code.',
                          'الرابط وحده لا يمنح صلاحية. تستخدم الرموز مرة واحدة؛ ويحل الرمز الجديد محل السابق.',
                        )}
                      </p>
                    </form>
                  </CardContent>
                </Card>
              </section>
            )}
          </main>
          <FooterElement
            className={
              view
                ? 'committee-footer'
                : 'wrap text-sm text-muted-foreground pb-8'
            }
          >
            {t(
              'Capstone Repository · Project assessment, separate from course grades.',
              'مستودع مشاريع التخرج · تقييم المشروع منفصل عن درجات المقررات.',
            )}
          </FooterElement>
        </div>
      </GuestEntryShell>
    </SemesterMemory>
  );
}
function GuestAssessment({
  locale,
  view,
  onReload,
  onEnd,
}: {
  locale: 'en' | 'ar';
  view: GuestView;
  onReload: () => Promise<GuestView | null>;
  onEnd: () => void;
}) {
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const [payload, setPayload] = useState<MemberPayload>(
      canonicalPayload(view.receipt?.payload ?? view.draft?.payload ?? fresh()),
    ),
    [revision, setRevision] = useState(view.draft?.revision ?? 0),
    [saved, setSaved] = useState(
      JSON.stringify(
        canonicalPayload(
          view.receipt?.payload ?? view.draft?.payload ?? fresh(),
        ),
      ),
    ),
    [index, setIndex] = useState(0),
    [tab, setTab] = useState('evidence'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [review, setReview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [denied, setDenied] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [retryReady, setRetryReady] = useState(false),
    [conflict, setConflict] = useState(false),
    [reloadConfirm, setReloadConfirm] = useState(false),
    [endConfirm, setEndConfirm] = useState(false),
    [receipt, setReceipt] = useState(view.receipt);
  const pending = useRef<PendingMemberWrite | null>(null),
    inFlight = useRef(false),
    dirty = JSON.stringify(payload) !== saved,
    locked = !!receipt || busy || denied || uncertain || conflict;
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty && !receipt) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, receipt]);
  const criteria: RubricCriterionView[] = view.rubric.criteria.map((c) => ({
    key: c.code,
    title: c.label[locale],
    weight: c.weight,
    intent: c.description[locale],
    anchors: c.anchors.map((a) => ({
      level: a.level as AssessmentLevel,
      label: view.rubric.levels[locale][a.level] ?? String(a.level),
      detail: a[locale],
    })),
  }));
  const values = payload.criteria.map((c) => ({
      level: c.level,
      note: c.comment,
    })),
    total = payload.criteria.every((c) => c.level !== null)
      ? payload.criteria.reduce(
          (s, c, i) => s + [10, 20, 20, 20, 15, 10, 5][i]! * c.level!,
          0,
        ) / 4
      : null;
  const criterionComplete = payload.criteria.map(
    (c) =>
      Number.isInteger(c.level) &&
      c.level !== null &&
      c.level >= 0 &&
      c.level <= 4 &&
      c.comment.length <= 1000,
  );
  const valid = total !== null && criterionComplete.every(Boolean);
  function change(patch: Partial<MemberPayload['criteria'][number]>) {
    setPayload((p) => ({
      ...p,
      criteria: p.criteria.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      ),
    }));
  }
  async function resolveSaved(
    command: PendingMemberWrite | null,
    replaceDraft = false,
    knownRejected = false,
  ) {
    setMessage(
      t('Checking the saved assessment…', 'جارٍ التحقق من التقييم المحفوظ…'),
    );
    const latest = await onReload();
    if (!latest) {
      setDenied(true);
      return;
    }
    const kind = command
      ? classifyMemberOutcome(command, latest)
      : latest.receipt
        ? 'completed'
        : 'saved';
    if (kind === 'completed' || kind === 'saved' || replaceDraft) {
      const current = canonicalPayload(
        latest.receipt?.payload ?? latest.draft?.payload ?? fresh(),
      );
      setPayload(current);
      setRevision(latest.draft?.revision ?? 0);
      setReceipt(latest.receipt);
      setSaved(JSON.stringify(current));
      pending.current = null;
      setUncertain(false);
      setRetryReady(false);
      setConflict(false);
      setDenied(false);
      setReview(false);
      setMessage(
        latest.receipt
          ? t(
              'Your finalized assessment is confirmed and read only.',
              'تم تأكيد تقييمك النهائي وأصبح للقراءة فقط.',
            )
          : t(
              'The current draft is saved on the server.',
              'المسودة الحالية محفوظة على الخادم.',
            ),
      );
    } else if (kind === 'retry' && knownRejected) {
      pending.current = null;
      setUncertain(false);
      setRetryReady(false);
      setConflict(true);
      setMessage(
        t(
          'Finalization was not accepted for the current draft or roster. Load the saved draft before a new review.',
          'لم يُقبل التثبيت للمسودة أو القائمة الحالية. حمّل المسودة المحفوظة قبل مراجعة جديدة.',
        ),
      );
    } else if (kind === 'retry') {
      // Preserve the exact request identity, revision and input; do not manufacture a new operation.
      setUncertain(true);
      setRetryReady(true);
      setConflict(false);
      setMessage(
        command?.operation === 'finalize'
          ? t(
              'No finalized result was found. Your saved form is retained; retry the same finalization.',
              'لم يُعثر على نتيجة نهائية. نموذجك المحفوظ باقٍ؛ يمكنك إعادة محاولة التثبيت نفسه.',
            )
          : t(
              'This draft change is not recorded yet. Your input is retained; retry the same save.',
              'لم يُسجل تعديل المسودة بعد. يبقى إدخالك؛ يمكنك إعادة الحفظ نفسه.',
            ),
      );
    } else {
      pending.current = null;
      setUncertain(false);
      setRetryReady(false);
      setConflict(true);
      setMessage(
        t(
          'The saved draft or frozen context changed. Review the current saved version before continuing.',
          'تغيّرت المسودة المحفوظة أو سياق الإرسال. راجع النسخة المحفوظة الحالية قبل المتابعة.',
        ),
      );
    }
  }
  async function write(finalize = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    setRetryReady(false);
    const operation = finalize ? 'finalize' : 'save';
    const command = pending.current ?? {
      command: crypto.randomUUID(),
      operation,
      payload: structuredClone(payload),
      revision,
      scope: guestScope(view),
    };
    pending.current = command;
    try {
      const r = await fetch('/api/committee-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          operation: command.operation,
          invitation: view.invitation,
          command: command.command,
          payload: command.payload,
          revision: command.revision,
        }),
      });
      const response = await r.json().catch(() => ({}));
      if (r.status === 403 || r.status === 404) {
        pending.current = null;
        setDenied(true);
        setUncertain(false);
        setMessage(
          t(
            'Your session or invitation is no longer available. Reopen the latest invitation and verify again.',
            'لم تعد الجلسة أو الدعوة متاحة. افتح أحدث دعوة وتحقق من بريدك مجددًا.',
          ),
        );
        return;
      }
      if (r.status === 400 || response.code === 'EVIDENCE_UNAVAILABLE') {
        pending.current = null;
        setUncertain(false);
        setConflict(false);
        setMessage(
          response.code === 'EVIDENCE_UNAVAILABLE'
            ? t(
                'The original evidence could not be verified. Your form is retained; contact the supervisor before finalizing.',
                'تعذر التحقق من الأدلة الأصلية. يبقى نموذجك؛ تواصل مع المشرف قبل التثبيت.',
              )
            : t(
                'The assessment was not accepted. Choose a valid level for every criterion and check the note lengths.',
                'لم يُقبل التقييم. اختر مستوى صحيحًا لكل معيار وتحقق من أطوال الملاحظات.',
              ),
        );
        return;
      }
      await resolveSaved(
        command,
        false,
        !r.ok && response.knownRejected === true,
      );
    } catch {
      try {
        await resolveSaved(command);
      } catch {
        setUncertain(true);
        setRetryReady(false);
        setMessage(
          t(
            'The saved status is unavailable. Your exact request is retained; check its status before editing.',
            'الحالة المحفوظة غير متاحة. يُحتفظ بطلبك نفسه؛ تحقق من حالته قبل التعديل.',
          ),
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function checkOutcome(replaceDraft = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await resolveSaved(pending.current, replaceDraft);
    } catch {
      setMessage(
        t(
          'The saved status is still unavailable. Your current form remains protected; check again when connected.',
          'ما زالت الحالة المحفوظة غير متاحة. يبقى نموذجك محميًا؛ تحقق مجددًا عند عودة الاتصال.',
        ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      setReloadConfirm(false);
    }
  }
  async function endSession() {
    setBusy(true);
    try {
      const r = await fetch('/api/committee-guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'end-session',
          invitation: view.invitation,
        }),
      });
      if (!r.ok) throw Error();
      onEnd();
    } catch {
      setMessage(
        t(
          'The session ending was not confirmed. Try again.',
          'لم يُؤكد إنهاء الجلسة. حاول مجددًا.',
        ),
      );
    } finally {
      setBusy(false);
      setEndConfirm(false);
    }
  }
  const extra = null;
  return (
    <section className="committee-workbench">
      <div
        className="committee-project-context"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="committee-session-actions">
          <span>
            {view.sessionExpiresAt && t('Session ends ', 'تنتهي الجلسة ')}
            {view.sessionExpiresAt &&
              new Date(view.sessionExpiresAt).toLocaleTimeString(locale)}
          </span>
          <Button
            pending={busy}
            variant="outline"
            disabled={busy}
            onClick={() =>
              dirty || uncertain ? setEndConfirm(true) : void endSession()
            }
          >
            {t('End this private session', 'إنهاء هذه الجلسة الخاصة')}
          </Button>
        </div>
        {view.amendment && (
          <p dir="auto" role="status">
            <strong>
              {t(
                'Authorized original-member amendment',
                'تعديل مفوّض للعضو الأصلي',
              )}
            </strong>{' '}
            · {view.amendment.reason}
          </p>
        )}
        <p dir="auto">{view.metadata.abstract}</p>
        <p dir="auto">{view.authors.map((a) => a.name).join(' · ')}</p>
        <p dir="auto">
          {locale === 'ar'
            ? view.metadata.university?.nameAr
            : view.metadata.university?.nameEn}{' '}
          · {view.metadata.supervisor?.name}
        </p>
        <p dir="auto">
          <bdi dir="ltr">
            {view.metadata.department?.code} ·{' '}
            {view.metadata.academicYear ?? view.metadata.academic_year} ·{' '}
            {view.metadata.domain}
          </bdi>
        </p>
        <details>
          <summary>{t('Exact assessed scope', 'نطاق التقييم المحدد')}</summary>
          <p dir="auto">
            <bdi dir="ltr">
              {view.version} / {view.submission}
            </bdi>
          </p>
        </details>
      </div>
      <AcademicAssessmentWorkspace
        committeeGuest
        locale={locale}
        variant="committee"
        title={view.metadata.title}
        back={
          <span>{t('Invitation-only workspace', 'مساحة بالدعوة فقط')}</span>
        }
        scope={t(
          `Frozen submission · round ${view.round}`,
          `إرسال محفوظ · الجولة ${view.round}`,
        )}
        due={new Date(view.deadline).toLocaleDateString(locale)}
        status={
          receipt
            ? t('Submitted · read only', 'أُرسل · للقراءة فقط')
            : dirty
              ? t('Unsaved changes', 'تغييرات غير محفوظة')
              : t('Private draft', 'مسودة خاصة')
        }
        tab={tab}
        onTabChange={setTab}
        evidence={
          receipt ? (
            <p dir="auto">
              {t(
                'Evidence access closed after submission. Your attributed receipt remains available in this session.',
                'أُغلق الوصول للأدلة بعد الإرسال. يبقى إيصال تقييمك متاحًا في هذه الجلسة.',
              )}
            </p>
          ) : (
            <AcademicEvidence
              locale={locale}
              actor={view.invitation}
              project={view.project}
              version={view.version}
              submission={view.submission}
              files={view.files}
              scopeKey={view.invitation}
              publicLabel={t('Frozen evidence', 'أدلة محفوظة')}
              authorityUrl={
                '/api/committee-guest?invitation=' + view.invitation
              }
              authorityRequiresUsable={false}
              queryUrl={(mode, file) =>
                '/api/committee-files?' +
                new URLSearchParams({
                  invitation: view.invitation,
                  project: view.project,
                  version: view.version,
                  submission: view.submission,
                  mode,
                  ...(file ? { file } : {}),
                  ...(mode === 'preview' ? { syntax: 'studio' } : {}),
                })
              }
              onDenied={() => setDenied(true)}
            />
          )
        }
        assessment={
          receipt ? (
            <AssessmentSummary
              locale={locale}
              title={t('Your submitted assessment', 'تقييمك المرسل')}
              total={String(receipt.total)}
              rubric="CORE_V1"
              criteria={criteria}
              values={values}
              attribution={
                <span dir="auto">
                  {view.name || view.email} ·{' '}
                  {new Date(receipt.submittedAt).toLocaleString(locale)}
                </span>
              }
            >
              <p dir="auto">
                {t(
                  'Individual result. The full committee aggregate is computed only after every required member finishes. You have not signed for anyone else.',
                  'نتيجة فردية. تُحتسب النتيجة الإجمالية بعد اكتمال جميع الأعضاء المطلوبين. لم توقّع نيابة عن أحد.',
                )}
              </p>
            </AssessmentSummary>
          ) : (
            <AssessmentCriterionPanel
              locale={locale}
              criteria={criteria}
              values={values}
              index={index}
              onCriterionChange={setIndex}
              onChoose={(level) => change({ level })}
              onNote={(comment) => change({ comment })}
              noteLabel={t('Brief note (optional)', 'ملاحظة موجزة (اختيارية)')}
              criterionComplete={criterionComplete}
              noteHelp={t(
                'You may add context for your chosen level. A note is optional at every level.',
                'يمكنك إضافة سياق للمستوى الذي اخترته. الملاحظة اختيارية عند كل مستوى.',
              )}
              disabled={locked}
              onSave={() => void write()}
              saveDisabled={locked || !dirty}
              onReview={() => setReview(true)}
              reviewDisabled={locked || !valid || dirty || !view.canFinalize}
              readiness={
                !view.canFinalize
                  ? t(
                      'The supervisor must confirm at least two required recipients before finalization. Your draft can still be saved.',
                      'يجب أن يحدد المشرف عضوين مطلوبين على الأقل قبل التثبيت. يمكنك حفظ مسودتك الآن.',
                    )
                  : t(
                      'Choose seven integer levels. Notes are optional; save before review.',
                      'اختر سبعة مستويات صحيحة. الملاحظات اختيارية؛ احفظ قبل المراجعة.',
                    )
              }
              extra={extra}
              feedback={
                <>
                  {message && (
                    <p dir="auto" role="status" aria-live="polite">
                      {message}
                    </p>
                  )}
                  {denied && (
                    <p dir="auto" role="alert">
                      {t(
                        'Session or invitation access ended. Reopen your latest invitation.',
                        'انتهت الجلسة أو صلاحية الدعوة. افتح أحدث دعوة.',
                      )}
                    </p>
                  )}
                  <Button
                    pending={busy}
                    variant={uncertain || conflict ? 'default' : 'outline'}
                    disabled={busy || denied}
                    onClick={() => {
                      if (conflict || (dirty && !uncertain))
                        setReloadConfirm(true);
                      else if (retryReady && pending.current)
                        void write(pending.current.operation === 'finalize');
                      else void checkOutcome();
                    }}
                  >
                    {conflict
                      ? t('Review saved draft', 'مراجعة المسودة المحفوظة')
                      : retryReady
                        ? pending.current?.operation === 'finalize'
                          ? t(
                              'Retry saved finalization',
                              'إعادة التثبيت المحفوظ',
                            )
                          : t('Retry saved draft', 'إعادة حفظ المسودة')
                        : t('Check saved status', 'التحقق من الحالة المحفوظة')}
                  </Button>
                </>
              }
            />
          )
        }
      />
      <DecisionConfirmation
        open={reloadConfirm}
        onOpenChange={setReloadConfirm}
        title={t(
          'Replace unsaved edits with the saved draft?',
          'استبدال التعديلات غير المحفوظة بالمسودة المحفوظة؟',
        )}
        description={t(
          'Only the current server-confirmed draft will be loaded. Your unsaved edits will be discarded.',
          'ستُحمّل المسودة المؤكدة من الخادم فقط، وتُلغى التعديلات غير المحفوظة.',
        )}
      >
        <Button variant="outline" onClick={() => setReloadConfirm(false)}>
          {t('Keep editing', 'متابعة التحرير')}
        </Button>
        <Button onClick={() => void checkOutcome(true)}>
          {t('Load saved draft', 'تحميل المسودة المحفوظة')}
        </Button>
      </DecisionConfirmation>
      <DecisionConfirmation
        open={endConfirm}
        onOpenChange={setEndConfirm}
        title={t('End this private session?', 'إنهاء هذه الجلسة الخاصة؟')}
        description={t(
          'Unsaved edits will be discarded. Saved drafts and submitted assessments remain unchanged. Reopen your latest invitation and verify your email to return.',
          'ستُلغى التعديلات غير المحفوظة. تبقى المسودات المحفوظة والتقييمات المرسلة دون تغيير. افتح أحدث دعوة ووثّق بريدك للعودة.',
        )}
      >
        <Button variant="outline" onClick={() => setEndConfirm(false)}>
          {t('Keep working', 'متابعة العمل')}
        </Button>
        <Button
          pending={busy}
          onClick={() => void endSession()}
          disabled={busy}
        >
          {t('End session', 'إنهاء الجلسة')}
        </Button>
      </DecisionConfirmation>
      <DecisionConfirmation
        open={review}
        onOpenChange={setReview}
        title={t('Review your individual assessment', 'راجع تقييمك الفردي')}
        description={t(
          'This submits only your own form against the exact frozen submission. It does not publish the project or sign for other members.',
          'يرسل هذا نموذجك وحدك للإرسال المحفوظ المحدد. لا ينشر المشروع ولا يوقع عن أعضاء آخرين.',
        )}
      >
        <AssessmentSummary
          locale={locale}
          title={view.metadata.title}
          total={total === null ? null : String(total)}
          rubric="CORE_V1"
          criteria={criteria}
          values={values}
        />
        <p dir="auto">{payload.overall}</p>
        <Button variant="outline" onClick={() => setReview(false)}>
          {t('Back to draft', 'العودة للمسودة')}
        </Button>
        <Button
          onClick={() => {
            setReview(false);
            setConfirm(true);
          }}
        >
          {t('Finalize my assessment', 'تثبيت تقييمي')}
        </Button>
      </DecisionConfirmation>
      <DecisionConfirmation
        open={confirm}
        onOpenChange={setConfirm}
        title={t('Submit and lock your assessment?', 'إرسال تقييمك وتثبيته؟')}
        description={t(
          'You can no longer edit this submission. Corrections require a reasoned original-evaluator amendment.',
          'لن تتمكن من تحرير هذا الإرسال. تتطلب التصحيحات تعديلًا مسببًا من المقيّم الأصلي.',
        )}
      >
        <Button variant="outline" onClick={() => setConfirm(false)}>
          {t('Cancel', 'إلغاء')}
        </Button>
        <Button
          disabled={locked || !valid || dirty || !view.canFinalize}
          onClick={() => {
            setConfirm(false);
            void write(true);
          }}
        >
          {t('Confirm my final assessment', 'تأكيد تقييمي النهائي')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
