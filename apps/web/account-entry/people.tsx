'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFact, BidiFacts } from '@capstone/ui/bidi';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { currentAccountRequest, mailStatusLabel } from './mail-status';
import type { AccountAccessPerson } from './access-types';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Mail,
  UsersRound,
  ArrowLeft,
  ShieldCheck,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Separator,
} from '@capstone/ui/workspace-v2';
import { ResultAlert, copy, type Locale } from './fields';
import { useMemoryDraft } from './drafts';
import { date } from '../semester/common';
const role = (code: string, locale: Locale) =>
  code === 'university_admin'
    ? copy(locale, 'University administrator', 'مدير الجامعة')
    : copy(
        locale,
        code === 'student' ? 'Student' : 'Faculty / supervisor',
        code === 'student' ? 'طالب' : 'عضو هيئة تدريس / مشرف',
      );
const status = (code: string, locale: Locale) =>
  ({
    active: copy(locale, 'Active', 'نشط'),
    inactive: copy(locale, 'Setup pending', 'الإعداد معلق'),
    suspended: copy(locale, 'Suspended', 'موقوف'),
  })[code] ?? code;
export function PersonAccountAccess({
  locale,
  initial,
  endpointBase = '/api/account-access',
  back,
}: {
  locale: Locale;
  initial: AccountAccessPerson;
  endpointBase?: string;
  back?: string;
}) {
  const t = (e: string, a: string) => copy(locale, e, a),
    draft = useMemoryDraft(
      initial.id +
        (back
          ? `/admin/platform/${back}/administrators/${initial.id}/account-access`
          : `/admin/university/people/${initial.id}/account-access`),
    ),
    [personState, setPerson] = useState(initial),
    [busy, setBusy] = useState(false),
    [pollPaused, setPollPaused] = useState(false),
    [notice, setNotice] = useState(draft.status === 'unknown' ? 'unknown' : ''),
    [dialog, setDialog] = useState(false);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const readVersion = useRef(0);
  const person = personState.id === initial.id ? personState : initial;
  const endpoint = `${endpointBase}?person=${initial.id}`;
  useEffect(() => {
    setPerson(initial);
  }, [initial]);
  async function read(command?: string) {
    const version = ++readVersion.current;
    const r = await fetch(endpoint + (command ? '&command=' + command : ''), {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error('Unavailable');
    const v: AccountAccessPerson = await r.json();
    if (v.id !== initial.id) throw Error('Wrong recipient');
    if (version === readVersion.current) setPerson(v);
    return v;
  }
  async function issue() {
    if (busy) return;
    setBusy(true);
    const command = draft.values['command'] ?? crypto.randomUUID();
    draft.values['command'] = command;
    const purpose =
      draft.values['purpose'] ??
      (person.status === 'inactive' ? 'ACCOUNT_SETUP' : 'PASSWORD_RESET');
    draft.values['purpose'] = purpose;
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'issue', command, purpose }),
      });
      if (!r.ok) {
        const current = await read(command);
        draft.values = {};
        draft.status = current.receipt ? 'recorded' : 'ready';
        setNotice(current.receipt ? 'recorded' : 'failed');
        return;
      }
      await read(command);
      draft.values = {};
      draft.status = 'recorded';
      setNotice('recorded');
      setDialog(false);
    } catch {
      draft.status = 'unknown';
      setNotice('unknown');
      setDialog(false);
      try {
        const v = await read(command);
        if (v.receipt) {
          draft.values = {};
          draft.status = 'recorded';
          setNotice('recorded');
          setDialog(false);
        }
      } catch {
        /* Retain the same command. Do not issue a fresh credential on an unknown outcome. */
      }
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      const command = draft.values['command'],
        v = await read(command);
      if (command && v.receipt) {
        draft.values = {};
        draft.status = 'recorded';
        setNotice('recorded');
      } else if (notice !== 'unknown') setNotice('');
    } catch {
      setNotice('unavailable');
    } finally {
      setBusy(false);
    }
  }
  async function retry(id: string) {
    setBusy(true);
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'retry', message: id }),
      });
      if (!r.ok) throw Error('Retry');
      await read();
      setNotice('retried');
    } catch {
      setNotice('unknown-retry');
      await read().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const latest = currentAccountRequest(person),
    pending = latest && ['queued', 'sending'].includes(latest.state),
    cooldown =
      person.resendAt &&
      Date.parse(person.resendAt) > Date.parse(person.serverNow),
    canIssue =
      person.status !== 'suspended' &&
      !pending &&
      !cooldown &&
      notice !== 'unknown';
  const delivery = (state: string) => mailStatusLabel(state, locale);
  useEffect(() => {
    // Poll only a real in-flight request. No automatic send, resend or mutation.
    if (!pending) return;
    const controller = new AbortController();
    let polls = 0;
    setPollPaused(false);
    const interval = setInterval(() => {
      if (++polls > 30) {
        clearInterval(interval);
        controller.abort();
        setPollPaused(true);
        return;
      }
      const version = ++readVersion.current;
      void fetch(endpoint, {
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      })
        .then(async (r) => {
          if (!r.ok) throw Error();
          const value = (await r.json()) as AccountAccessPerson;
          if (value.id === initial.id && version === readVersion.current)
            setPerson(value);
        })
        .catch(() => {
          if (!controller.signal.aborted) setNotice('unavailable');
        });
    }, 2000);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [pending, endpoint]);
  useEffect(() => {
    const update = () => {
      void read().catch(() => setNotice('unavailable'));
    };
    update();
    addEventListener('focus', update);
    addEventListener('pageshow', update);
    return () => {
      removeEventListener('focus', update);
      removeEventListener('pageshow', update);
    };
  }, [endpoint]);
  const action =
    person.status === 'inactive'
      ? person.invitation
        ? t('Resend setup invitation', 'إعادة إرسال دعوة الإعداد')
        : t('Send setup invitation', 'إرسال دعوة الإعداد')
      : t('Send recovery link', 'إرسال رابط الاستعادة');
  return (
    <div className="as-workspace-page" data-dialog-open={dialog}>
      <Link
        className="as-back"
        href={
          back
            ? `/${locale}/admin/platform/${back}`
            : `/${locale}/admin/university/people`
        }
      >
        <ArrowLeft />
        {back
          ? t('Back to university', 'العودة إلى الجامعة')
          : t('Back to People', 'العودة إلى الأشخاص')}
      </Link>
      <header className="as-page-header" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <span className="as-eyebrow">
          {back
            ? t('UNIVERSITY / ADMINISTRATOR ACCESS', 'الجامعة / وصول المدير')
            : t('PEOPLE / ACCOUNT ACCESS', 'الأشخاص / وصول الحساب')}
        </span>
        <h1 dir="auto">{t('Account access', 'وصول الحساب')}</h1>
        <p dir="auto">
          {t(
            'Review access for this selected person only.',
            'مراجعة الوصول للشخص المحدد فقط.',
          )}
        </p>
      </header>
      <div className="as-person-access-grid">
        <Card
          className="as-person-context"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <CardHeader>
            <div className="as-task-icon">
              <UsersRound />
            </div>
            <CardTitle>
              <h2 dir="auto">{person.name}</h2>
            </CardTitle>
            <CardDescription>
              <span dir="ltr">{person.email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BidiFacts className="as-identity-list">
              <BidiFact>
                <BidiLabel dir="auto">{t('University', 'الجامعة')}</BidiLabel>
                <BidiData dir="auto">
                  {locale === 'ar' ? person.universityAr : person.university}
                </BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">
                  {back
                    ? t('Account role', 'دور الحساب')
                    : t('Academic role', 'الدور الأكاديمي')}
                </BidiLabel>
                <BidiData dir="auto">{role(person.role, locale)}</BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">
                  {t('Account status', 'حالة الحساب')}
                </BidiLabel>
                <BidiData dir="auto">
                  <Badge variant="outline">
                    {status(person.status, locale)}
                  </Badge>
                </BidiData>
              </BidiFact>
              {person.invitation && (
                <BidiFact>
                  <BidiLabel dir="auto">
                    {t('Setup invitation', 'دعوة الإعداد')}
                  </BidiLabel>
                  <BidiData dir="auto">
                    {
                      {
                        valid: t('Pending setup', 'في انتظار الإعداد'),
                        expired: t('Expired', 'منتهية'),
                        used: t('Setup completed', 'اكتمل الإعداد'),
                        revoked: t('Replaced', 'استُبدلت'),
                      }[person.invitation.state]
                    }
                  </BidiData>
                </BidiFact>
              )}
            </BidiFacts>
          </CardContent>
        </Card>
        <Card
          className="as-person-action"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <CardHeader>
            <div className="as-task-icon">
              <Mail />
            </div>
            <CardTitle>
              <h2 dir="auto">{t('Account email', 'بريد الحساب')}</h2>
            </CardTitle>
            <CardDescription>
              {person.status === 'inactive'
                ? t(
                    'The recipient will choose their own password and sign in. A new invitation replaces the previous setup link.',
                    'سيختار المستلم كلمة مروره ويسجّل الدخول. تستبدل الدعوة الجديدة رابط الإعداد السابق.',
                  )
                : person.status === 'active'
                  ? t(
                      'Send a personal recovery link. The password changes only after the recipient completes recovery; their existing sessions then end.',
                      'أرسل رابط استعادة شخصيًا. لا تتغير كلمة المرور إلا بعد إكمال المستلم الاستعادة، وعندها تنتهي جلساته السابقة.',
                    )
                  : t(
                      'This account is suspended. Setup and recovery cannot restore access. Use the authorized university process to review its status.',
                      'الحساب موقوف. لا يمكن للإعداد أو الاستعادة إعادة الوصول. استخدم إجراء الجامعة المصرح به لمراجعة حالته.',
                    )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {latest ? (
              <ResultAlert
                title={delivery(latest.state)}
                kind={
                  pending && !pollPaused
                    ? 'pending'
                    : latest.state === 'failed'
                      ? 'error'
                      : latest.state === 'unknown'
                        ? 'info'
                        : 'info'
                }
              >
                {latest.state === 'captured'
                  ? t(
                      'An account email request is recorded. Inbox delivery has not been verified.',
                      'سُجل طلب بريد الحساب، ولم يُتحقق من وصوله إلى البريد الوارد.',
                    )
                  : latest.state === 'provider_accepted'
                    ? t(
                        'The email was accepted for delivery. Inbox receipt has not been confirmed.',
                        'قُبل البريد للإرسال. لم يُتحقق من وصول الرسالة إلى البريد الوارد.',
                      )
                    : latest.state === 'failed'
                      ? t(
                          'The request failed. Use the available retry for this same email request.',
                          'فشل الطلب. استخدم إعادة المحاولة المتاحة للطلب نفسه.',
                        )
                      : latest.state === 'unknown'
                        ? t(
                            'The send outcome is uncertain. Check status or retry the same recorded request; do not issue a fresh link yet.',
                            'نتيجة الإرسال غير مؤكدة. تحقق من الحالة أو أعد محاولة الطلب المسجل نفسه، ولا تصدر رابطًا جديدًا الآن.',
                          )
                        : t(
                            'The current request state is shown above; inbox delivery is not confirmed.',
                            'تظهر حالة الطلب الحالية أعلاه. لم يُؤكد وصول الرسالة إلى البريد الوارد.',
                          )}
              </ResultAlert>
            ) : notice === 'unknown' ? null : (
              <p dir="auto" className="as-muted">
                {t(
                  'No active email request. Earlier requests remain in history.',
                  'لا يوجد طلب بريد نشط. تبقى الطلبات السابقة في السجل.',
                )}
              </p>
            )}
            {pollPaused && pending && (
              <p dir="auto" role="status" className="as-muted">
                {t(
                  'This request is still processing. Refresh status to check again; no new email has been sent.',
                  'لا يزال الطلب قيد المعالجة. حدّث الحالة للتحقق مجددًا؛ لم يُرسل بريد جديد.',
                )}
              </p>
            )}
            {notice && (
              <ResultAlert
                title={
                  notice === 'recorded'
                    ? t('Request recorded', 'سُجل الطلب')
                    : notice === 'retried'
                      ? t('Retry queued', 'أُضيفت إعادة المحاولة إلى القائمة')
                      : notice === 'unknown' || notice === 'unknown-retry'
                        ? t('Confirmation needed', 'يلزم تأكيد النتيجة')
                        : t(
                            'Could not complete the request',
                            'تعذر إكمال الطلب',
                          )
                }
                kind={
                  notice === 'recorded' || notice === 'retried'
                    ? 'success'
                    : 'error'
                }
              >
                {notice === 'recorded'
                  ? t(
                      'The server confirmed the account email request. Review its delivery state here.',
                      'أكد الخادم طلب بريد الحساب. راجع حالة الإرسال هنا.',
                    )
                  : notice === 'retried'
                    ? t(
                        'The same recorded email request was queued again.',
                        'أُضيف طلب البريد المسجل نفسه إلى قائمة الإرسال مجددًا.',
                      )
                    : notice === 'unknown' || notice === 'unknown-retry'
                      ? t(
                          'Refresh status before another action. Your original request is preserved for safe reconciliation.',
                          'حدّث الحالة قبل إجراء آخر. احتُفظ بالطلب الأصلي للتحقق الآمن.',
                        )
                      : t(
                          'Check eligibility and the current request state. If you recently sent a link, wait before resending.',
                          'تحقق من الأهلية وحالة الطلب الحالية. انتظر قبل إعادة الإرسال إذا أرسلت رابطًا مؤخرًا.',
                        )}
              </ResultAlert>
            )}
            <div className="as-access-actions" aria-busy={busy}>
              {notice === 'unknown' && draft.values['command'] && (
                <Button
                  disabled={busy}
                  pending={busy}
                  onClick={() => void issue()}
                >
                  {t('Retry original request', 'إعادة محاولة الطلب الأصلي')}
                </Button>
              )}
              {person.status !== 'suspended' &&
                (latest?.canRetry ? (
                  <Button
                    disabled={busy}
                    pending={busy}
                    onClick={() => void retry(latest.id)}
                    className="as-primary"
                  >
                    {t('Retry recorded email', 'إعادة محاولة البريد المسجل')}
                  </Button>
                ) : person.status === 'active' ? (
                  <Dialog open={dialog} onOpenChange={setDialog}>
                    <DialogTrigger asChild>
                      <Button
                        className="as-primary"
                        disabled={busy || !canIssue}
                      >
                        {action}
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      className="wsv2 as-confirm"
                      closeLabel={t('Close confirmation', 'إغلاق التأكيد')}
                      dir={locale === 'ar' ? 'rtl' : 'ltr'}
                      onCloseAutoFocus={(event) => {
                        if (!canIssue && refreshButton.current) {
                          event.preventDefault();
                          refreshButton.current.focus();
                        }
                      }}
                    >
                      <DialogHeader>
                        <DialogTitle>
                          {t('Send a recovery link?', 'إرسال رابط استعادة؟')}
                        </DialogTitle>
                        <DialogDescription>
                          {t(
                            'Confirm the selected recipient before sending account email.',
                            'تحقق من المستلم المحدد قبل إرسال بريد الحساب.',
                          )}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="as-confirm-recipient">
                        <strong dir="auto">{person.name}</strong>
                        <span dir="ltr">{person.email}</span>
                        <span>
                          {locale === 'ar'
                            ? person.universityAr
                            : person.university}
                        </span>
                      </div>
                      <p dir="auto">
                        {t(
                          'The recipient chooses the new password. Their current password is unchanged until completion.',
                          'يختار المستلم كلمة المرور الجديدة. لا تتغير كلمة مروره الحالية حتى اكتمال العملية.',
                        )}
                      </p>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setDialog(false)}
                          disabled={busy}
                          pending={busy}
                        >
                          {t('Cancel', 'إلغاء')}
                        </Button>
                        <Button
                          onClick={() => void issue()}
                          disabled={busy}
                          pending={busy}
                        >
                          {busy
                            ? t('Recording…', 'جارٍ التسجيل…')
                            : t(
                                'Confirm recovery email',
                                'تأكيد بريد الاستعادة',
                              )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button
                    className="as-primary"
                    disabled={busy || !canIssue}
                    onClick={() => void issue()}
                  >
                    {busy ? t('Recording…', 'جارٍ التسجيل…') : action}
                  </Button>
                ))}
              <Button
                variant="outline"
                disabled={busy}
                pending={busy}
                ref={refreshButton}
                onClick={() => void refresh()}
              >
                {t('Refresh status', 'تحديث الحالة')}
              </Button>
            </div>
            {cooldown && person.status !== 'suspended' && (
              <p dir="auto" className="as-muted">
                {t(
                  'A recent request is recorded. Wait at least a minute before resending.',
                  'سُجل طلب حديث. انتظر دقيقة على الأقل قبل إعادة الإرسال.',
                )}
              </p>
            )}
            <Separator />
            <div className="as-context-note">
              <ShieldCheck />
              <p dir="auto">
                {back
                  ? t(
                      'You can manage eligible university administrators from this institutional record. Each person chooses their own password.',
                      'يمكنك إدارة مديري الجامعة المؤهلين من سجل المؤسسة. يختار كل شخص كلمة مروره.',
                    )
                  : t(
                      'You can act only on eligible academic accounts in your own university. You never choose another person’s password.',
                      'يمكنك إدارة الحسابات الأكاديمية المؤهلة في جامعتك فقط، ولا تختار كلمة مرور شخص آخر.',
                    )}
              </p>
            </div>
            {person.messages.length > 0 && (
              <details className="as-access-history">
                <summary>
                  {t(
                    'Recent account email requests',
                    'طلبات بريد الحساب الأخيرة',
                  )}
                </summary>
                <ul>
                  {person.messages.map((m) => (
                    <li key={m.id}>
                      <div>
                        <strong>
                          {m.purpose === 'ACCOUNT_SETUP'
                            ? t('Setup invitation', 'دعوة إعداد')
                            : m.purpose === 'PASSWORD_RESET'
                              ? t('Recovery link', 'رابط استعادة')
                              : t('Reset confirmation', 'تأكيد الاستعادة')}
                        </strong>
                        <span>{delivery(m.state)}</span>
                        <time dateTime={m.createdAt}>
                          {date(locale, m.createdAt)}
                        </time>
                      </div>
                      {m.canRetry && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          pending={busy}
                          onClick={() => void retry(m.id)}
                        >
                          {t('Retry this request', 'إعادة محاولة هذا الطلب')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
