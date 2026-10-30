'use client';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { Field as ShadcnField, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePublicLocale } from '../public-ui/scope';
const useR3 = () => ({ locale: usePublicLocale() });
function useCopy() {
  const locale = usePublicLocale();
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  return { t, raw: t };
}
import { Eye, EyeOff } from 'lucide-react';
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
  const { t } = useCopy(),
    { locale } = useR3(),
    [show, setShow] = useState(false);
  useEffect(() => setShow(false), [locale]);
  return (
    <ShadcnField>
      <FieldLabel htmlFor={id}>{t(...label)}</FieldLabel>
      <InputGroup dir="ltr">
        <InputGroupInput
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={256}
          required
          disabled={disabled}
          data-secret="true"
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-sm"
            type="button"
            disabled={disabled}
            aria-controls={id}
            aria-pressed={show}
            aria-label={t(
              show ? 'Hide password' : 'Show password',
              show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور',
            )}
            onClick={() => setShow((v) => !v)}
          >
            {show ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </ShadcnField>
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
    <ShadcnField>
      <FieldLabel htmlFor={id}>{t(...label)}</FieldLabel>
      <Input
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
    </ShadcnField>
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
    <Alert variant={error ? 'destructive' : 'default'}>
      <AlertDescription>
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
      </AlertDescription>
    </Alert>
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
          <Button asChild>
            <Link href={signInHref}>
              {t('Sign in to continue', 'سجّل الدخول للمتابعة')}
            </Link>
          </Button>
        </>
      ) : (
        <form
          className="pu-partner-form"
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
