'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Field,
  FieldLabel,
  FieldError,
  Textarea,
  Dialog,
  DialogContent,
  DialogClose,
  X,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@capstone/ui/workspace-v2';
import {
  institutionStatusSchema,
  type OnboardingResult,
} from '@capstone/domain';
import { ResultAlert } from '../account-entry/fields';
import { useMemoryDraft } from '../account-entry/drafts';
import { tr, type Locale } from './common';
export function MutationPanel({
  locale,
  title,
  description,
  subject,
  university,
  id,
  revision,
  kind,
  actions,
}: {
  locale: Locale;
  title: string;
  description: string;
  subject: string;
  university: string;
  id: string;
  revision: string | number;
  kind: 'university' | 'person' | 'partners' | 'reviewers';
  actions: {
    operation: string;
    label: string;
    required?: boolean;
    description?: string;
  }[];
}) {
  const router = useRouter(),
    path = usePathname(),
    d = useMemoryDraft('mutation' + path.replace(/^\/(en|ar)/, '')),
    [reason, setReason] = useState(d.values['reason'] ?? ''),
    [selected, setSelected] = useState(''),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [state, setState] = useState(d.status === 'unknown' ? 'unknown' : ''),
    busyRef = useRef(false),
    observedRevision = useRef(revision),
    trigger = useRef<HTMLButtonElement | null>(null),
    checkButton = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    t = (e: string, a: string) => tr(locale, e, a);
  const approval = ['partners', 'reviewers'].includes(kind),
    action = actions.find((a) => a.operation === selected),
    endpoint = approval
      ? `/api/approvals?kind=${kind}&person=${id}`
      : '/api/onboarding';
  useEffect(() => {
    if (observedRevision.current !== revision) {
      observedRevision.current = revision;
      if (state === 'stale') {
        delete d.values['_body'];
        delete d.values['_command'];
        setState('');
      }
    }
  }, [revision, state, d]);
  useEffect(() => {
    const page = panel.current?.closest<HTMLElement>('.on-page');
    if (page) page.dataset.dialogOpen = String(review);
    return () => {
      if (page) delete page.dataset.dialogOpen;
    };
  }, [review]);
  function prepare(operation: string) {
    const a = actions.find((x) => x.operation === operation)!;
    if (
      ((a.required || reason.trim() !== '') && [...reason.trim()].length < 3) ||
      [...reason].length > 400 ||
      /password|token|cookie|postgres(?:ql)?:|[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/i.test(
        reason,
      )
    ) {
      setState('invalid');
      document.getElementById('reason-' + kind)?.focus();
      return;
    }
    const command = crypto.randomUUID(),
      body = approval
        ? { command, operation, revision, reason: reason.trim() }
        : {
            command,
            operation: kind + '.status',
            payload: { id, status: operation, revision, reason: reason.trim() },
          };
    if (
      !approval &&
      !institutionStatusSchema.safeParse((body as { payload: unknown }).payload)
        .success
    ) {
      setState('invalid');
      document.getElementById('reason-' + kind)?.focus();
      return;
    }
    d.values['_body'] = JSON.stringify(body);
    d.values['_command'] = command;
    setSelected(operation);
    setReview(true);
    setState('');
  }
  async function write() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: d.values['_body'] ?? '{}',
      });
      if (r.status >= 500) throw Error('Unknown');
      if (!r.ok) {
        setState(r.status === 409 ? 'stale' : 'failed');
        setReview(false);
        return;
      }
      await r.json();
      d.status = 'ready';
      d.values = {};
      setReason('');
      setReview(false);
      setState('saved');
      router.refresh();
    } catch {
      d.status = 'unknown';
      setState('unknown');
      setReview(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function check() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(
        (approval ? endpoint + '&' : endpoint + '?') +
          'command=' +
          d.values['_command'],
        { cache: 'no-store' },
      );
      if (!r.ok) throw Error('Read');
      const b = (await r.json()) as { receipt: OnboardingResult | null };
      if (b.receipt) {
        d.status = 'ready';
        d.values = {};
        setState('saved');
        router.refresh();
      } else setState('not-recorded');
    } catch {
      setState('unknown');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <Card ref={panel}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="on-mutation-form">
          {state && (
            <ResultAlert
              kind={
                state === 'saved'
                  ? 'success'
                  : ['unknown', 'not-recorded'].includes(state)
                    ? 'pending'
                    : 'error'
              }
              title={
                state === 'saved'
                  ? t('Change recorded', 'تم حفظ التغيير')
                  : state === 'stale'
                    ? t('This record has changed', 'تغيّر هذا السجل')
                    : ['unknown', 'not-recorded'].includes(state)
                      ? t(
                          'Check the original decision',
                          'تحقق من القرار الأصلي',
                        )
                      : state === 'invalid'
                        ? t('Check the decision reason', 'تحقق من سبب القرار')
                        : t(
                            'Unable to apply this decision',
                            'تعذر تطبيق القرار',
                          )
              }
            >
              <p dir="auto">
                {state === 'stale'
                  ? t(
                      'Reload and review its current state before deciding again.',
                      'أعد التحميل وراجع الحالة الحالية قبل اتخاذ قرار آخر.',
                    )
                  : state === 'not-recorded'
                    ? t(
                        'No committed receipt was found. Retry only this original decision.',
                        'لم يُعثر على إيصال محفوظ. أعد محاولة القرار الأصلي فقط.',
                      )
                    : state === 'saved'
                      ? t(
                          'The server confirmed the persisted result.',
                          'أكد الخادم النتيجة المحفوظة.',
                        )
                      : state === 'invalid'
                        ? t(
                            'Use a valid reason before reviewing this decision.',
                            'استخدم سببًا صالحًا قبل مراجعة هذا القرار.',
                          )
                        : state === 'failed'
                          ? t(
                              'Review the reason and current record before trying again.',
                              'راجع السبب والسجل الحالي قبل المحاولة مجددًا.',
                            )
                          : t(
                              'No new decision is sent until this request is reconciled.',
                              'لا يُرسل قرار جديد حتى يتم التحقق من نتيجة هذا الطلب.',
                            )}
              </p>
              {d.status === 'unknown' && (
                <div className="on-actions">
                  <Button
                    pending={busy}
                    disabled={busy}
                    ref={checkButton}
                    onClick={() => void check()}
                  >
                    {t('Check original decision', 'التحقق من القرار الأصلي')}
                  </Button>
                  {state === 'not-recorded' && (
                    <Button
                      pending={busy}
                      disabled={busy}
                      variant="outline"
                      onClick={() => void write()}
                    >
                      {t(
                        'Retry original decision',
                        'إعادة محاولة القرار الأصلي',
                      )}
                    </Button>
                  )}
                </div>
              )}
              {state === 'stale' && (
                <Button onClick={() => router.refresh()}>
                  {t('Recheck record', 'إعادة التحقق من السجل')}
                </Button>
              )}
            </ResultAlert>
          )}
          {actions.length > 0 && (
            <>
              <Field data-invalid={state === 'invalid'}>
                <FieldLabel htmlFor={'reason-' + kind}>
                  {t('Decision reason', 'سبب القرار')}
                </FieldLabel>
                <Textarea
                  id={'reason-' + kind}
                  value={reason}
                  dir="auto"
                  maxLength={400}
                  disabled={busy || d.status === 'unknown'}
                  onChange={(e) => {
                    setReason(e.target.value);
                    d.values['reason'] = e.target.value;
                  }}
                  aria-invalid={state === 'invalid'}
                  aria-describedby={
                    'reason-help-' +
                    kind +
                    (state === 'invalid' ? ' reason-error-' + kind : '')
                  }
                />
                <p dir="auto" id={'reason-help-' + kind} className="on-help">
                  {t(
                    'Use a concise institutional reason; no credentials or private case data.',
                    'استخدم سببًا مؤسسيًا موجزًا دون بيانات اعتماد أو معلومات حالات خاصة.',
                  )}
                </p>
                {state === 'invalid' && (
                  <FieldError id={'reason-error-' + kind}>
                    {t(
                      'Enter a valid reason of 3–400 characters when required.',
                      'أدخل سببًا صالحًا من ٣–٤٠٠ حرف عند الحاجة.',
                    )}
                  </FieldError>
                )}
              </Field>
              <div className="on-actions">
                {actions.map((a, i) => (
                  <Button
                    key={a.operation}
                    variant={i === 0 && approval ? 'default' : 'outline'}
                    disabled={
                      busy || d.status === 'unknown' || state === 'stale'
                    }
                    onClick={(e) => {
                      trigger.current = e.currentTarget;
                      prepare(a.operation);
                    }}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
      <Dialog
        open={review}
        onOpenChange={(o) => {
          if (!busy) setReview(o);
        }}
      >
        <DialogContent
          className="wsv2 on-confirm"
          showCloseButton={false}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (trigger.current?.disabled) checkButton.current?.focus();
            else trigger.current?.focus();
          }}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <DialogHeader>
            <DialogTitle>{action?.label}</DialogTitle>
            <DialogDescription>
              {action?.description ?? description}
            </DialogDescription>
          </DialogHeader>
          <div className="on-confirm-summary">
            <strong dir="auto">{subject}</strong>
            <span dir="auto">{university}</span>
            {reason && <p dir="auto">{reason}</p>}
          </div>
          <DialogFooter>
            <Button pending={busy} disabled={busy} onClick={() => void write()}>
              {busy ? t('Saving…', 'جارٍ الحفظ…') : action?.label}
            </Button>
            <Button
              pending={busy}
              disabled={busy}
              variant="outline"
              onClick={() => setReview(false)}
            >
              {t('Cancel', 'إلغاء')}
            </Button>
          </DialogFooter>
          <DialogClose asChild>
            <Button
              disabled={busy}
              variant="ghost"
              className="on-dialog-close"
              aria-label={t('Close confirmation', 'إغلاق التأكيد')}
              pending={busy}
            >
              <X />
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
