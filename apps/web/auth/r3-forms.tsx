'use client';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Button, useCopy, useR3 } from '@capstone/ui/r3';
import { Eye, EyeOff } from '@capstone/ui/r3';
import { clearPrivateInputs } from './client-privacy';
import Link from 'next/link';
import { submitPartnerRegistration } from './partner-registration';
type Pair = readonly [string, string];
function PasswordField({
  id,
  name,
  label,
  minLength,
  disabled = false,
  autoComplete = 'current-password',
  invalid = false,
  describedBy,
}: {
  id: string;
  name: string;
  label: Pair;
  minLength?: number;
  disabled?: boolean;
  autoComplete?: string;
  invalid?: boolean;
  describedBy?: string | undefined;
}) {
  const { t, raw } = useCopy();
  const { locale } = useR3();
  const [show, setShow] = useState(false);
  useEffect(() => setShow(false), [locale]);
  return (
    <div className="identity-field">
      <label dir="auto" htmlFor={id}>
        {t(...label)}
      </label>
      <div className="password-control">
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          data-secret="true"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete={autoComplete}
          dir="ltr"
          required
          minLength={minLength}
          maxLength={128}
          disabled={disabled}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShow((v) => !v)}
          aria-label={raw(
            show ? 'Hide password' : 'Show password',
            show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور',
          )}
          aria-controls={id}
          aria-pressed={show}
        >
          {show ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
    </div>
  );
}
function useSecretLifetime() {
  const { locale } = useR3();
  const [preparedLocale, setPreparedLocale] = useState<string | null>(null);
  useEffect(() => {
    clearPrivateInputs();
    setPreparedLocale(locale);
  }, [locale]);
  useEffect(() => {
    window.addEventListener('pagehide', clearPrivateInputs);
    return () => window.removeEventListener('pagehide', clearPrivateInputs);
  }, []);
  return preparedLocale === locale;
}
function Field({
  id,
  name,
  label,
  type = 'text',
  autoComplete,
  maxLength = 200,
  defaultValue,
  readOnly = false,
  disabled = false,
}: {
  id: string;
  name: string;
  label: Pair;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  defaultValue?: string;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const { t } = useCopy();
  return (
    <div className="identity-field">
      <label dir="auto" htmlFor={id}>
        {t(...label)}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        dir={type === 'email' ? 'ltr' : 'auto'}
        autoComplete={autoComplete}
        required
        maxLength={maxLength}
        defaultValue={defaultValue}
        readOnly={readOnly}
        disabled={disabled}
      />
    </div>
  );
}
function Feedback({
  children,
  error = true,
  id,
  focus = true,
}: {
  children: ReactNode;
  error?: boolean;
  id?: string;
  focus?: boolean;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [error, focus]);
  return (
    <p
      dir="auto"
      id={id}
      className="identity-feedback"
      role={error ? 'alert' : 'status'}
      ref={ref}
      tabIndex={-1}
    >
      {children}
    </p>
  );
}
export function PartnerRegistrationForm({
  returnTo,
}: { returnTo?: string } = {}) {
  const ready = useSecretLifetime();
  const { locale } = useR3();
  const signInHref =
    '/' +
    locale +
    '/login?returnTo=' +
    encodeURIComponent(returnTo ?? '/' + locale + '/partner');
  const { t } = useCopy();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<
      'rejected' | 'unconfirmed' | 'mismatch' | null
    >(null),
    [done, setDone] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !ready) return;
    const form = e.currentTarget,
      d = new FormData(form);
    if (d.get('password') !== d.get('confirmation')) {
      setError('mismatch');
      requestAnimationFrame(() =>
        document.getElementById('partner-confirmation')?.focus(),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await submitPartnerRegistration({
        name: d.get('name'),
        email: d.get('email'),
        organization: d.get('organization'),
        password: d.get('password'),
        confirmation: d.get('confirmation'),
        locale,
      });
      if (outcome !== 'confirmed') {
        setError(outcome);
        return;
      }
      form.reset();
      clearPrivateInputs();
      setDone(true);
    } catch {
      setError('unconfirmed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p dir="auto" className="identity-intro">
        {t(
          'Create an individual partner account. Organization eligibility is reviewed before requests; approval alone is not a file grant.',
          'أنشئ حساب شريك فرديًا. تُراجع أهلية المنظمة قبل الطلبات؛ الموافقة وحدها ليست إذنًا للملفات.',
        )}
      </p>
      {done ? (
        <>
          <Feedback error={false}>
            {t(
              'Your partner account was created with pending eligibility. Sign in to follow its status.',
              'أُنشئ حسابك كشريك بأهلية قيد المراجعة. سجّل الدخول لمتابعة حالته.',
            )}
          </Feedback>
          <Button asChild className="ui-button identity-primary">
            <Link href={signInHref}>
              {t('Sign in to continue', 'سجّل الدخول للمتابعة')}
            </Link>
          </Button>
        </>
      ) : (
        <form
          className="identity-form"
          onSubmit={(e) => {
            void submit(e);
          }}
          aria-busy={busy}
        >
          <Field
            id="partner-name"
            name="name"
            label={['Your name', 'اسمك']}
            autoComplete="name"
            disabled={!ready || busy}
          />
          <Field
            id="partner-email"
            name="email"
            label={['Account email', 'البريد الإلكتروني للحساب']}
            type="email"
            autoComplete="username"
            maxLength={254}
            disabled={!ready || busy}
          />
          <Field
            id="partner-organization"
            name="organization"
            label={['Organization', 'المنظمة']}
            autoComplete="organization"
            disabled={!ready || busy}
          />
          <PasswordField
            id="partner-password"
            name="password"
            label={['Password', 'كلمة المرور']}
            autoComplete="new-password"
            minLength={12}
            disabled={!ready || busy}
          />
          <PasswordField
            id="partner-confirmation"
            name="confirmation"
            label={['Confirm password', 'تأكيد كلمة المرور']}
            invalid={error === 'mismatch'}
            describedBy={error ? 'partner-registration-feedback' : undefined}
            autoComplete="new-password"
            minLength={12}
            disabled={!ready || busy}
          />
          {error && (
            <Feedback
              id="partner-registration-feedback"
              focus={error !== 'mismatch'}
            >
              {error === 'mismatch'
                ? t(
                    'Passwords do not match. Confirm the password again.',
                    'كلمتا المرور غير متطابقتين. أكّد كلمة المرور مرة أخرى.',
                  )
                : error === 'unconfirmed'
                  ? t(
                      'The registration outcome could not be confirmed. Your account may already exist. Try signing in with the details you entered before registering again.',
                      'تعذر تأكيد نتيجة التسجيل. قد يكون حسابك موجودًا بالفعل. حاول تسجيل الدخول بالبيانات التي أدخلتها قبل إعادة التسجيل.',
                    )
                  : t(
                      'Registration was not completed. Check the fields and try again.',
                      'لم يكتمل التسجيل. راجع الحقول وحاول مجددًا.',
                    )}
            </Feedback>
          )}
          {error === 'unconfirmed' && (
            <Button
              asChild
              variant="outline"
              className="ui-button"
              style={{ whiteSpace: 'normal', height: 'auto', minHeight: 44 }}
            >
              <Link href={signInHref}>
                {t(
                  'Sign in to check your account',
                  'سجّل الدخول للتحقق من حسابك',
                )}
              </Link>
            </Button>
          )}
          <Button
            type="submit"
            className="ui-button identity-primary"
            disabled={!ready || busy}
          >
            {t(
              busy ? 'Creating account…' : 'Create partner account',
              busy ? 'جارٍ إنشاء الحساب…' : 'إنشاء حساب شريك',
            )}
          </Button>
        </form>
      )}
    </>
  );
}
