'use client';
import { formatScore } from '@capstone/ui/score-format';
import './committee.css';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SubmittedMemberForm } from './submitted-form';
import type {
  CommitteeStatus,
  CommitteeManagementOutcome,
} from '@capstone/domain/committee-types';
import {
  Button,
  Input,
  Textarea,
  Field,
  FieldLabel,
  DecisionConfirmation,
} from '@capstone/ui/workspace-v2';
export function SupervisorCommittee({
  locale,
  actor,
  submission,
  title,
  initial,
  canManage,
}: {
  locale: 'en' | 'ar';
  actor: string;
  submission: string;
  title: string;
  initial: CommitteeStatus;
  canManage: boolean;
}) {
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en),
    router = useRouter();
  const [state, setState] = useState(initial),
    [email, setEmail] = useState(''),
    [name, setName] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState<{
      operation: 'invite' | 'resend' | 'revoke';
      id?: string;
    } | null>(null);
  type RequestBody = {
    submission: string;
    revision: number;
    operation: 'invite' | 'resend' | 'revoke';
    invitation?: string;
    email: string;
    name: string;
    locale: 'en' | 'ar';
    reason: string;
    command: string;
  };
  const inFlight = useRef(false),
    pending = useRef<RequestBody | null>(null),
    scope = useRef(actor + ':' + submission);
  scope.current = actor + ':' + submission;
  const [phase, setPhase] = useState<'idle' | 'checking' | 'unknown' | 'retry'>(
      'idle',
    ),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (!inFlight.current && !pending.current) setState(initial);
  }, [initial]);
  const minimumReason = state.minimumReasonLength ?? 10;
  const allowed = canManage && state.canManage;
  function openAction(operation: 'invite' | 'resend' | 'revoke', id?: string) {
    if (pending.current || inFlight.current) return;
    setReason('');
    setError('');
    setNotice('');
    setConfirm({ operation, ...(id ? { id } : {}) });
  }
  const rejectedMessage = (code: string) =>
    code === 'SUPERVISOR_COMMITTEE_CONFLICT'
      ? t(
          'Choose another recipient. The supervisor assessment must remain separate.',
          'اختر عضوًا آخر. يجب أن يبقى تقييم المشرف مستقلًا.',
        )
      : code === 'CONFLICT'
        ? t(
            'The roster changed or this action is no longer available. Review its current status before another action.',
            'تغيّرت القائمة أو لم يعد الإجراء متاحًا. راجع حالتها الحالية قبل إجراء آخر.',
          )
        : t(
            'The request was not accepted. Check the recipient, change reason and resend availability.',
            'لم يُقبل الطلب. تحقق من العضو وسبب التغيير وموعد إتاحة إعادة الإرسال.',
          );
  async function recorded(command: RequestBody) {
    setPhase('checking');
    const r = await fetch(
      '/api/committee?submission=' + submission + '&command=' + command.command,
      {
        cache: 'no-store',
        headers: { 'X-Workspace-Actor': actor },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!r.ok) throw Error('STATUS_UNAVAILABLE');
    const value = (await r.json()) as CommitteeManagementOutcome;
    if (scope.current !== actor + ':' + submission) return 'unknown';
    const latest = value.status;
    if (
      !latest ||
      latest.submission !== submission ||
      latest.case !== state.case
    )
      throw Error('STATUS_UNAVAILABLE');
    setState(latest);
    if (
      value.receipt &&
      value.receipt.command === command.command &&
      value.receipt.submission === submission &&
      value.receipt.operation === command.operation
    ) {
      pending.current = null;
      setPhase('idle');
      setConfirm(null);
      setEmail('');
      setName('');
      setReason('');
      setError('');
      setNotice(
        command.operation === 'revoke'
          ? t(
              'The invitation is revoked. Completed member assessments are unchanged.',
              'أُلغيت الدعوة. لم تتغير تقييمات الأعضاء المكتملة.',
            )
          : t(
              'The roster request is recorded. Delivery and member progress are shown separately below.',
              'سُجل طلب القائمة. تظهر حالة التسليم وتقدم العضو بصورة مستقلة أدناه.',
            ),
      );
      router.refresh();
      return 'completed';
    }
    if (latest.revision !== command.revision || !latest.canManage) {
      pending.current = null;
      setPhase('idle');
      setConfirm(null);
      setError(rejectedMessage('CONFLICT'));
      return 'changed';
    }
    setPhase('retry');
    setNotice(
      t(
        'No recorded operation was found. Retry the preserved request to continue safely.',
        'لم يُعثر على إجراء مسجل. أعد الطلب المحفوظ للمتابعة بأمان.',
      ),
    );
    return 'retry';
  }
  async function send() {
    if (inFlight.current || (!confirm && !pending.current)) return;
    if (!pending.current) {
      if (state.sealedAt && Array.from(reason.trim()).length < minimumReason) {
        setError(
          t(
            'Enter a clear change reason of at least ' +
              minimumReason +
              ' characters.',
            'أدخل سببًا واضحًا للتغيير لا يقل عن ' + minimumReason + ' أحرف.',
          ),
        );
        return;
      }
      pending.current = {
        submission,
        revision: state.revision,
        operation: confirm!.operation,
        ...(confirm!.id ? { invitation: confirm!.id } : {}),
        email,
        name,
        locale,
        reason,
        command: crypto.randomUUID(),
      };
    }
    const command = pending.current;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/committee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actor,
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(15000),
      });
      const value = await r.json().catch(() => ({}));
      const outcome = await recorded(command);
      if (!r.ok && value.knownRejected && outcome === 'retry') {
        pending.current = null;
        setPhase('idle');
        setError(rejectedMessage(value.code ?? 'INVALID_INPUT'));
      }
    } catch {
      try {
        await recorded(command);
      } catch {
        if (scope.current === actor + ':' + submission) {
          setPhase('unknown');
          setNotice(
            t(
              'The action status is unavailable. Its original request is retained; check before sending another action.',
              'حالة الإجراء غير متاحة. يُحتفظ بالطلب الأصلي؛ تحقق منه قبل إرسال إجراء آخر.',
            ),
          );
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (pending.current) await recorded(pending.current);
      else {
        const r = await fetch('/api/committee?submission=' + submission, {
          cache: 'no-store',
          headers: { 'X-Workspace-Actor': actor },
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw Error('STATUS_UNAVAILABLE');
        const latest = (await r.json()) as CommitteeStatus;
        if (latest.submission !== submission || latest.case !== state.case)
          throw Error('STATUS_UNAVAILABLE');
        if (scope.current === actor + ':' + submission) {
          setState(latest);
          router.refresh();
        }
      }
    } catch {
      setNotice(
        t(
          'Current status is unavailable. Your input is retained; check again when connected.',
          'الحالة الحالية غير متاحة. يبقى إدخالك محفوظًا؛ تحقق مجددًا عند عودة الاتصال.',
        ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="ss-page ac-page committee-roster"
      dir="ltr"
      data-locale={locale}
      data-template="committee-invitations"
    >
      <header className="ss-heading">
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <p dir="auto" className="ac-eyebrow">
            {t('Verified individual assessments', 'تقييمات فردية موثقة')}
          </p>
          <h1 dir="auto">{t('Committee invitations', 'دعوات اللجنة')}</h1>
          <p dir="auto">{title}</p>
        </div>
        <Button
          pending={busy}
          variant="outline"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {t('Refresh status', 'تحديث الحالة')}
        </Button>
      </header>
      <p dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        {t(
          'Invite at least two distinct email recipients. Each member verifies their address and submits their own seven-criterion form. You cannot enter or change their scores. All required members must finish before the system computes the committee aggregate.',
          'ادعُ عضوين على الأقل بعناوين بريد مختلفة. يتحقق كل عضو من عنوانه ويرسل نموذجه الخاص للمعايير السبعة. لا يمكنك إدخال درجاتهم أو تغييرها. يجب أن يكمل جميع الأعضاء المطلوبين قبل احتساب نتيجة اللجنة.',
        )}{' '}
      </p>
      <div className="committee-summary" role="status">
        <strong>
          <bdi dir="ltr">
            {state.completedCount} / {state.requiredCount}
          </bdi>
        </strong>
        <span>
          {t('required assessments complete', 'تقييمات مطلوبة مكتملة')}
        </span>
        <span>
          {state.completedAt
            ? t('Roster finalized · immutable', 'القائمة مكتملة وثابتة')
            : state.sealedAt
              ? t(
                  'Required roster sealed; reason needed for changes',
                  'القائمة المطلوبة محددة؛ يتطلب تغييرها سببًا',
                )
              : t(
                  'At least two invitations required',
                  'يلزم إرسال دعوتين على الأقل',
                )}
        </span>
      </div>
      {state.result && (
        <section className="ac-score-summary">
          <h2 dir="auto">
            {t(
              'System-computed committee aggregate',
              'النتيجة الإجمالية المحتسبة آليًا للجنة',
            )}
          </h2>
          <strong>{formatScore(state.result.total, locale)} / 100</strong>
          <p dir="auto">
            {t(
              'Arithmetic mean of all required finalized individual forms. This does not assert unanimous agreement.',
              'المتوسط الحسابي لجميع النماذج الفردية المطلوبة المكتملة. لا يعني ذلك الإجماع.',
            )}
          </p>
          <Button asChild>
            <Link href={`/${locale}/supervision/finals/${submission}/decision`}>
              {t('Review publication decision', 'مراجعة قرار النشر')}
            </Link>
          </Button>
        </section>
      )}
      {!state.completedAt && !allowed && (
        <p dir="auto" role="status">
          {t(
            state.members.length
              ? 'This frozen round is closed to roster changes. Existing member assessments remain read only.'
              : 'Finalize your supervisor assessment before issuing or changing committee invitations.',
            state.members.length
              ? 'هذا الإرسال المحفوظ مغلق أمام تغيير القائمة. تبقى تقييمات الأعضاء للقراءة فقط.'
              : 'أكمل تقييم المشرف قبل إصدار دعوات اللجنة أو تغييرها.',
          )}{' '}
          <Link href={`/${locale}/supervision/finals/${submission}/assessment`}>
            {t('Open supervisor assessment', 'فتح تقييم المشرف')}
          </Link>
        </p>
      )}
      {!state.completedAt && allowed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            openAction('invite');
          }}
          className="committee-invite-form"
        >
          <Field>
            <FieldLabel htmlFor="committee-email">
              {t('Member email', 'بريد العضو')}
            </FieldLabel>
            <Input
              id="committee-email"
              type="email"
              dir="ltr"
              autoComplete="off"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="committee-name">
              {t('Display name (optional)', 'الاسم المعروض (اختياري)')}
            </FieldLabel>
            <Input
              id="committee-name"
              dir="auto"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Button
            type="submit"
            disabled={
              busy ||
              !!pending.current ||
              state.members.filter((m) => !m.revokedAt).length >= 20
            }
          >
            {t('Preview invitation', 'معاينة الدعوة')}
          </Button>
        </form>
      )}
      <h2 dir="auto">{t('Members and delivery', 'الأعضاء والتسليم')}</h2>
      {!state.members.length && (
        <p dir="auto">
          {t(
            'No invitations have been issued for this frozen round.',
            'لم تُصدر دعوات لهذا الإرسال المحفوظ.',
          )}
        </p>
      )}
      <ul className="committee-members">
        {state.members.map((m) => (
          <li key={m.id}>
            <div>
              <strong dir="auto">
                {m.name || t('Committee member', 'عضو اللجنة')}
              </strong>
              <p dir="auto">
                <bdi dir="ltr">{m.email}</bdi>
              </p>
              <p dir="auto">
                {m.revokedAt
                  ? t('Revoked', 'ملغاة')
                  : m.submittedAt
                    ? t('Assessment submitted', 'أرسل التقييم')
                    : m.state === 'expired'
                      ? t('Invitation expired', 'انتهت صلاحية الدعوة')
                      : m.verifiedAt
                        ? t(
                            'Email verified · awaiting assessment',
                            'البريد موثق · بانتظار التقييم',
                          )
                        : t(
                            'Awaiting email verification',
                            'بانتظار توثيق البريد',
                          )}
              </p>
              <small>
                {t('Email delivery', 'تسليم البريد')}:{' '}
                {(
                  {
                    queued: t('Queued', 'في قائمة الانتظار'),
                    sending: t('Sending', 'جارٍ الإرسال'),
                    mailpit_accepted: t(
                      'Captured for testing · no inbox delivery claimed',
                      'حُفظت نسخة للاختبار؛ لا يعني ذلك وصولها للبريد',
                    ),
                    provider_accepted: t(
                      'Email accepted for delivery · receipt unverified',
                      'قُبل البريد للإرسال · الوصول غير مؤكد',
                    ),
                    failed: t(
                      'Delivery failed; retry pending',
                      'فشل التسليم؛ إعادة المحاولة منتظرة',
                    ),
                    unknown: t(
                      'Delivery unconfirmed; inspect or explicitly resend',
                      'التسليم غير مؤكد؛ تحقق أو أعد الإرسال صراحةً',
                    ),
                    expired: t('Expired', 'منتهية'),
                  } as Record<string, string>
                )[m.delivery?.state ?? 'queued'] ??
                  t('Status unavailable', 'الحالة غير متاحة')}{' '}
                · {t('Attempts', 'المحاولات')}: {m.delivery?.attempts ?? 0}
              </small>
            </div>
            {m.finalAssessment && (
              <SubmittedMemberForm
                locale={locale}
                submission={submission}
                from={`/${locale}/supervision/finals/${submission}/committee`}
                payload={m.finalAssessment.payload}
                total={m.finalAssessment.total}
              />
            )}
            {!state.completedAt &&
              allowed &&
              !m.revokedAt &&
              !m.submittedAt && (
                <div className="committee-member-actions">
                  <Button
                    pending={busy}
                    variant="outline"
                    disabled={busy || !!pending.current || !m.canResend}
                    onClick={() => openAction('resend', m.id)}
                  >
                    {t('Resend invitation', 'إعادة إرسال الدعوة')}
                  </Button>
                  <Button
                    pending={busy}
                    variant="outline"
                    disabled={busy || !!pending.current || !m.canRevoke}
                    onClick={() => openAction('revoke', m.id)}
                  >
                    {t('Revoke', 'إلغاء')}
                  </Button>
                </div>
              )}
          </li>
        ))}
      </ul>
      {state.replacementSlots > 0 && allowed && (
        <p role="status" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          {t(
            'Add a distinct replacement recipient to restore the required committee. Completed forms stay attributed and unchanged.',
            'أضف عضوًا بديلًا بعنوان مختلف لاستكمال العدد المطلوب. تبقى النماذج المكتملة منسوبة إلى أصحابها دون تغيير.',
          )}
        </p>
      )}
      {notice && (
        <p
          role="status"
          aria-live="polite"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          {notice}
        </p>
      )}
      {error && !confirm && (
        <p dir="auto" role="alert">
          {error}
        </p>
      )}
      {!confirm && pending.current && (
        <Button
          pending={busy}
          disabled={busy}
          onClick={() => void (phase === 'retry' ? send() : refresh())}
        >
          {phase === 'retry'
            ? t('Retry recorded action', 'إعادة الإجراء المحفوظ')
            : t('Check recorded action', 'التحقق من الإجراء المسجل')}
        </Button>
      )}
      <DecisionConfirmation
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v && !busy) setConfirm(null);
        }}
        title={
          confirm?.operation === 'revoke'
            ? t(
                'Revoke this incomplete invitation?',
                'إلغاء دعوة هذا العضو غير المكتمل؟',
              )
            : t('Confirm committee invitation', 'تأكيد دعوة اللجنة')
        }
        description={
          confirm?.operation === 'revoke'
            ? t(
                'Revocation ends this invitation and its private sessions. Completed assessments remain unchanged. Invite any replacement separately.',
                'يلغي هذا الإجراء الدعوة وجلساتها الخاصة. تبقى التقييمات المكتملة دون تغيير، ويُدعى البديل بإجراء مستقل.',
              )
            : t(
                'This request concerns this frozen submission only. A new link ends earlier invitation sessions and requires fresh email verification.',
                'يخص هذا الطلب الإرسال المحفوظ المحدد فقط. ينهي الرابط الجديد جلسات الدعوة السابقة ويتطلب توثيق البريد مجددًا.',
              )
        }
      >
        <p dir="auto">{title}</p>
        <p dir="auto">
          <bdi dir="ltr">
            {confirm?.id
              ? state.members.find((m) => m.id === confirm.id)?.email
              : email}
          </bdi>
        </p>
        {state.sealedAt && (
          <Field dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <FieldLabel htmlFor="committee-action-reason">
              {t('Reason for this roster change', 'سبب هذا التغيير في القائمة')}
            </FieldLabel>
            <Textarea
              id="committee-action-reason"
              dir="auto"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy || !!pending.current}
              minLength={minimumReason}
              maxLength={1000}
              required
              aria-describedby="committee-action-reason-help"
            />
            <p dir="auto" id="committee-action-reason-help">
              {t(
                'At least ' +
                  minimumReason +
                  ' characters. Completed member assessments cannot be removed.',
                'لا يقل عن ' +
                  minimumReason +
                  ' أحرف. لا يمكن حذف تقييمات الأعضاء المكتملة.',
              )}
            </p>
          </Field>
        )}
        {confirm?.operation === 'resend' && (
          <p dir="auto">
            {t(
              'A fresh link requires email verification again and ends earlier invitation sessions.',
              'يتطلب الرابط الجديد توثيق البريد مجددًا وينهي جلسات الدعوة السابقة.',
            )}
          </p>
        )}
        {error && (
          <p dir="auto" role="alert">
            {error}
          </p>
        )}
        <Button
          pending={busy}
          variant="outline"
          onClick={() => setConfirm(null)}
          disabled={busy}
        >
          {t('Cancel', 'إلغاء')}
        </Button>
        <Button
          pending={busy}
          onClick={() => void (phase === 'unknown' ? refresh() : send())}
          disabled={
            busy ||
            (!pending.current &&
              !!state.sealedAt &&
              Array.from(reason.trim()).length < minimumReason) ||
            (!pending.current &&
              !!confirm?.id &&
              !(confirm.operation === 'revoke'
                ? state.members.find((m) => m.id === confirm.id)?.canRevoke
                : state.members.find((m) => m.id === confirm.id)?.canResend))
          }
        >
          {phase === 'unknown'
            ? t('Check recorded action', 'التحقق من الإجراء المسجل')
            : phase === 'retry'
              ? t('Retry recorded action', 'إعادة الإجراء المحفوظ')
              : confirm?.operation === 'revoke'
                ? t('Revoke invitation', 'إلغاء الدعوة')
                : t('Confirm invitation', 'تأكيد الدعوة')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
