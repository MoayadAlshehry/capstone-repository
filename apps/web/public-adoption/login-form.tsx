'use client';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Eye, EyeOff } from 'lucide-react';
import { accountPost } from '../account-entry/forms';
import { emailValid } from '../account-entry/fields';
import { loginFailure } from '../account-entry/login-outcome';
import { useMemoryDraft } from '../account-entry/drafts';
export function RealLoginForm({
  locale,
  returnTo,
}: {
  locale: 'en' | 'ar';
  returnTo: string;
}) {
  const submitting = useRef(false);
  const draft = useMemoryDraft('/login'),
    [values, setValues] = useState({ ...draft.values }),
    [shown, show] = useState(false),
    [busy, setBusy] = useState(false),
    [hydrated, setHydrated] = useState(false),
    [error, setError] = useState(''),
    [invalid, setInvalid] = useState<Record<string, string>>({});
  const l = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  useEffect(() => show(false), [locale]);
  useEffect(() => {
    setHydrated(true);
    const clear = () => {
      setValues({});
      setError('');
      setInvalid({});
      show(false);
    };
    addEventListener('account-draft-cleared', clear);
    return () => removeEventListener('account-draft-cleared', clear);
  }, []);
  const change = (k: string, v: string) => {
    draft.values[k] = v;
    setValues({ ...draft.values });
    setInvalid({ ...invalid, [k]: '' });
  };
  return (
    <form
      className="login-form"
      data-ui="sign-in-form"
      noValidate
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current || !hydrated) return;
        setError('');
        const problems: Record<string, string> = {};
        if (!emailValid(values.email ?? ''))
          problems.email = l(
            'Enter a valid email address.',
            'أدخل بريدًا إلكترونيًا صالحًا.',
          );
        if (!values.password)
          problems.password = l('Enter a password.', 'أدخل كلمة المرور.');
        setInvalid(problems);
        if (Object.keys(problems).length) {
          document.getElementById(Object.keys(problems)[0]!)?.focus();
          return;
        }
        submitting.current = true;
        setBusy(true);
        let authenticationConfirmed = false;
        try {
          await accountPost(
            { email: values.email, password: values.password },
            '/api/auth/sign-in/email',
          );
          authenticationConfirmed = true;
          await accountPost({ locale }, '/api/auth/locale');
          draft.values = {};
          setValues({});
          location.assign(
            `/${locale}/workspace?returnTo=${encodeURIComponent(draft.returnTo || returnTo)}`,
          );
        } catch (e) {
          const reason = loginFailure(
            e instanceof Error ? e.message : '',
            authenticationConfirmed,
          );
          setError(
            reason === 'signin'
              ? l(
                  'Email or password is incorrect.',
                  'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
                )
              : reason === 'limit'
                ? l(
                    'Too many attempts. Try again later.',
                    'محاولات كثيرة. حاول لاحقًا.',
                  )
                : reason === 'signin-preferences'
                  ? l(
                      'Sign-in was confirmed, but language preferences could not be saved. Retry to continue.',
                      'تأكد تسجيل الدخول، لكن تعذر حفظ اللغة. حاول مجددًا للمتابعة.',
                    )
                  : l(
                      'Sign-in could not be confirmed. Check your connection and retry.',
                      'تعذر تأكيد تسجيل الدخول. تحقق من الاتصال وحاول مجددًا.',
                    ),
          );
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      <Field data-invalid={!!invalid.email}>
        <FieldLabel dir="auto" htmlFor="email">
          {l('Email address', 'البريد الإلكتروني')}
        </FieldLabel>
        <Input
          id="email"
          name="email"
          dir="ltr"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          value={values.email ?? ''}
          onChange={(e) => change('email', e.target.value)}
          aria-invalid={!!invalid.email}
          aria-describedby={invalid.email ? 'email-error' : undefined}
        />
        {invalid.email && (
          <FieldError dir="auto" id="email-error">
            {invalid.email}
          </FieldError>
        )}
      </Field>
      <Field data-invalid={!!invalid.password}>
        <FieldLabel dir="auto" htmlFor="password">
          {l('Password', 'كلمة المرور')}
        </FieldLabel>
        <InputGroup dir="ltr">
          <InputGroupInput
            id="password"
            name="password"
            data-secret="true"
            dir="ltr"
            autoComplete="current-password"
            maxLength={256}
            required
            value={values.password ?? ''}
            onChange={(e) => change('password', e.target.value)}
            type={shown ? 'text' : 'password'}
            aria-invalid={!!invalid.password}
            aria-describedby={invalid.password ? 'password-error' : undefined}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-sm"
              type="button"
              onClick={() => show(!shown)}
              aria-label={
                shown
                  ? l('Hide password', 'إخفاء كلمة المرور')
                  : l('Show password', 'إظهار كلمة المرور')
              }
              aria-controls="password"
            >
              {shown ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {invalid.password && (
          <FieldError dir="auto" id="password-error">
            {invalid.password}
          </FieldError>
        )}
      </Field>
      <a
        className="text-sm underline underline-offset-4 justify-self-end"
        href={`/${locale}/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
      >
        {l('Forgot password?', 'نسيت كلمة المرور؟')}
      </a>
      <Button
        className="w-full submit-login"
        size="lg"
        aria-busy={busy}
        disabled={busy || !hydrated}
      >
        {busy && <Spinner />}
        {busy
          ? l('Signing in…', 'جارٍ تسجيل الدخول…')
          : l('Sign in', 'تسجيل الدخول')}{' '}
        ↗
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription dir="auto">{error}</AlertDescription>
        </Alert>
      )}
      <Button asChild variant="link" className="justify-start px-0">
        <a href={`/${locale}/catalogue`}>
          {l('Return to discovery', 'العودة إلى الاستكشاف')} ↗
        </a>
      </Button>
    </form>
  );
}
