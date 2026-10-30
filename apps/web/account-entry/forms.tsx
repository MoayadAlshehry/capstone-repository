'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import {
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Mail,
  CircleCheck,
} from 'lucide-react';
import {
  PasswordControl,
  PasswordGuidance,
  ResultAlert,
  copy,
  emailValid,
  passwordValid,
  type PasswordPolicy,
  type Locale,
} from './public-fields';
import { useMemoryDraft } from './drafts';
import { loginFailure } from './login-outcome';
import { firstInvalidEntryField } from './field-focus';
export type EntryMode =
  | 'login'
  | 'forgot-password'
  | 'request-setup'
  | 'setup-account'
  | 'reset-password'
  | 'activate';
export async function accountPost(body: unknown, path = '/api/account-email') {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  let value;
  try {
    value = await r.json();
  } catch {
    throw new TypeError('Response not confirmed');
  }
  if (!r.ok) throw Error(value.code ?? 'REQUEST_FAILED');
  return value;
}
export function AccountEntry({
  locale,
  mode,
  returnTo,
  policy,
}: {
  locale: Locale;
  mode: EntryMode;
  returnTo?: string;
  policy: PasswordPolicy;
}) {
  const t = (en: string, ar: string) => copy(locale, en, ar),
    dir = locale === 'ar' ? 'rtl' : 'ltr',
    draft = useMemoryDraft('/' + mode),
    credential = mode === 'setup-account' || mode === 'reset-password',
    setup = ['setup-account', 'request-setup', 'activate'].includes(mode),
    purpose = setup ? 'ACCOUNT_SETUP' : 'PASSWORD_RESET';
  const [values, setValues] = useState({ ...draft.values }),
    [status, setStatus] = useState(
      draft.status === 'ready' && credential ? 'loading' : draft.status,
    ),
    [context, setContext] = useState(draft.context),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [result, setResult] = useState(''),
    [busy, setBusy] = useState(false),
    [hydrated, setHydrated] = useState(false),
    generation = useRef(0);
  const destination = draft.returnTo || returnTo || `/${locale}/workspace`;
  const setStatusMemory = (v: string) => {
    draft.status = v;
    setStatus(v);
  };
  const value = (k: string, v: string) => {
    draft.values[k] = v;
    setValues({ ...draft.values });
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  useEffect(() => {
    document.documentElement.lang = locale;
    setHydrated(true);
  }, [locale]);
  useEffect(() => {
    const clear = () => {
      generation.current++;
      setValues({});
      setContext({});
      setStatus(credential ? 'unavailable' : 'ready');
    };
    window.addEventListener('account-draft-cleared', clear);
    return () => window.removeEventListener('account-draft-cleared', clear);
  }, [credential]);
  useEffect(() => {
    if (!credential) return;
    let disposed = false;
    const inspect = () => {
      const fragment = new URLSearchParams(location.hash.slice(1)).get('token');
      if (fragment) {
        draft.token = fragment;
        draft.values = {};
        setValues({});
        draft.context = {};
        setContext({});
        draft.status = 'loading';
        history.replaceState(null, '', location.pathname + location.search);
      }
      if (draft.status === 'complete') return;
      if (!draft.token) {
        setStatusMemory('unavailable');
        return;
      }
      setStatusMemory('loading');
      const token = draft.token,
        version = ++generation.current;
      void accountPost({ operation: 'inspect', token, purpose })
        .then((v) => {
          if (disposed || generation.current !== version) return;
          draft.context = {
            ...(v.name ? { name: v.name } : {}),
            ...(v.email ? { email: v.email } : {}),
            ...(v.expiresAt ? { expiresAt: v.expiresAt } : {}),
          };
          setContext({ ...draft.context });
          setStatusMemory(v.status);
        })
        .catch(() => {
          if (!disposed && generation.current === version)
            setStatusMemory('unavailable');
        });
    };
    inspect();
    window.addEventListener('hashchange', inspect);
    return () => {
      disposed = true;
      window.removeEventListener('hashchange', inspect);
    };
  }, [credential, purpose, locale]);
  function errorText(code: string) {
    return (
      {
        required: t('Enter a value for this field.', 'أدخل قيمة لهذا الحقل.'),
        email: t(
          'Enter a valid email address.',
          'أدخل بريدًا إلكترونيًا صالحًا.',
        ),
        policy: t(
          `Use ${policy.minimum}–${policy.maximum} characters.`,
          `استخدم ${policy.minimum}–${policy.maximum} حرفًا.`,
        ),
        match: t('Passwords do not match.', 'كلمتا المرور غير متطابقتين.'),
      }[code] ?? ''
    );
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!hydrated || busy) return;
    setResult('');
    const invalid: Record<string, string> = {};
    if (
      ['login', 'forgot-password', 'request-setup'].includes(mode) &&
      !emailValid(values['email'] ?? '')
    )
      invalid['email'] = 'email';
    if (!['forgot-password', 'request-setup'].includes(mode)) {
      if (!values['password']) invalid['password'] = 'required';
      else if (mode !== 'login' && !passwordValid(values['password'], policy))
        invalid['password'] = 'policy';
      if (mode !== 'login' && (values['confirm'] ?? '') !== values['password'])
        invalid['confirm'] = 'match';
    }
    if (mode === 'activate' && !values['token']) invalid['token'] = 'required';
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      const field = firstInvalidEntryField(form.elements, invalid);
      requestAnimationFrame(() =>
        field ? document.getElementById(field)?.focus() : undefined,
      );
      return;
    }
    setBusy(true);
    let authenticationConfirmed = false;
    try {
      if (mode === 'login') {
        await accountPost(
          { email: values['email'], password: values['password'] },
          '/api/auth/sign-in/email',
        );
        authenticationConfirmed = true;
        await accountPost({ locale }, '/api/auth/locale');
        draft.values = {};
        setValues({});
        location.assign(
          `/${locale}/workspace?returnTo=${encodeURIComponent(destination)}`,
        );
      } else if (mode === 'forgot-password' || mode === 'request-setup') {
        await accountPost({
          operation: 'request',
          email: values['email'],
          purpose,
          returnTo,
        });
        draft.values = {};
        setValues({});
        setStatusMemory('acknowledged');
      } else {
        const token = mode === 'activate' ? values['token'] : draft.token;
        const response = await accountPost({
          operation: 'complete',
          token,
          purpose,
          password: values['password'],
        });
        if (!response.completed) {
          setStatusMemory(response.status);
          return;
        }
        draft.values = {};
        draft.token = '';
        draft.returnTo = response.returnTo ?? `/${locale}/workspace`;
        setValues({});
        setStatusMemory('complete');
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setResult(
        mode === 'login'
          ? loginFailure(code, authenticationConfirmed)
          : code === 'TRY_LATER'
            ? 'limit'
            : code === 'PASSWORD_LENGTH'
              ? 'policy'
              : e instanceof TypeError
                ? 'unknown'
                : 'request',
      );
    } finally {
      setBusy(false);
    }
  }
  const outcome =
      (credential || mode === 'activate') &&
      !['valid', 'loading', 'complete', 'ready'].includes(status),
    title = outcome
      ? t('This link cannot be used', 'لا يمكن استخدام هذا الرابط')
      : status === 'complete'
        ? setup
          ? t('Your account is ready', 'حسابك جاهز')
          : t('Password reset complete', 'اكتملت إعادة تعيين كلمة المرور')
        : status === 'acknowledged'
          ? t('Check your email', 'تحقق من بريدك الإلكتروني')
          : mode === 'login'
            ? t('Sign in', 'تسجيل الدخول')
            : mode === 'forgot-password'
              ? t('Recover your account', 'استعادة حسابك')
              : mode === 'request-setup'
                ? t('Request a setup link', 'طلب رابط إعداد الحساب')
                : mode === 'activate'
                  ? t(
                      'Use an existing setup credential',
                      'استخدام رمز إعداد سابق',
                    )
                  : setup
                    ? t('Set up your account', 'إعداد حسابك')
                    : t('Reset your password', 'إعادة تعيين كلمة المرور');
  const detail = outcome
    ? ({
        expired: t(
          'This link has expired. Request a fresh link to continue.',
          'انتهت صلاحية الرابط. اطلب رابطًا جديدًا للمتابعة.',
        ),
        used: t(
          'This link has already been used. Sign in with the password you chose.',
          'استُخدم هذا الرابط. سجّل الدخول بكلمة المرور التي اخترتها.',
        ),
        revoked: t(
          'A newer link replaced this one. Use the most recent email or request another link.',
          'استُبدل هذا الرابط. استخدم أحدث رسالة أو اطلب رابطًا جديدًا.',
        ),
      }[status] ??
      t(
        'The link is missing or unavailable. Request a new link or ask your university administrator for help.',
        'الرابط غير متاح أو مفقود. اطلب رابطًا جديدًا أو تواصل مع إدارة جامعتك.',
      ))
    : status === 'complete'
      ? setup
        ? t(
            'Sign in with your new password to continue to your assigned workspace.',
            'سجّل الدخول بكلمة المرور الجديدة لمتابعة مساحة عملك.',
          )
        : t(
            'Your new password is saved. Previous sessions have ended.',
            'حُفظت كلمة المرور الجديدة وأُغلقت الجلسات السابقة.',
          )
      : status === 'acknowledged'
        ? t(
            'Your request was received. If this is an eligible account, check your inbox for the next step.',
            'تم استلام طلبك. إذا كان الحساب مؤهلًا، فتحقق من بريدك للخطوة التالية.',
          )
        : mode === 'login'
          ? t(
              'Use your individual account to open your workspace.',
              'استخدم حسابك الفردي لفتح مساحة عملك.',
            )
          : mode === 'forgot-password'
            ? t(
                'Enter your account email to request a secure recovery link.',
                'أدخل بريد حسابك لطلب رابط استعادة آمن.',
              )
            : mode === 'request-setup'
              ? t(
                  'Use the email your university invited. We will send the next step if the account is eligible.',
                  'استخدم البريد الذي دعتك الجامعة عبره. ستصلك الخطوة التالية إذا كان الحساب مؤهلًا.',
                )
              : t(
                  'Choose a personal password. Your university administrator cannot choose it for you.',
                  'اختر كلمة مرور شخصية. لا تستطيع إدارة الجامعة اختيارها نيابة عنك.',
                );
  return (
    <div className="pu-account-entry" dir="ltr">
      <main id="main" tabIndex={-1} className="as-auth-main">
        <Card className="as-auth-card" dir={dir}>
          <CardHeader>
            <div className="as-task-icon">
              {outcome ? (
                <KeyRound />
              ) : mode === 'login' ? (
                <ShieldCheck />
              ) : (
                <Mail />
              )}
            </div>
            <CardTitle>
              <h1 dir="auto">{title}</h1>
            </CardTitle>
            <CardDescription>{detail}</CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'loading' ? (
              <ResultAlert
                title={t('Checking your link', 'جارٍ التحقق من الرابط')}
                kind="pending"
              >
                {t(
                  'This does not activate your account.',
                  'لن يؤدي هذا إلى تفعيل حسابك.',
                )}
              </ResultAlert>
            ) : outcome ? (
              <div className="as-outcome">
                <Button asChild className="as-primary">
                  <Link
                    href={
                      status === 'used'
                        ? `/${locale}/login?returnTo=${encodeURIComponent(destination)}`
                        : `/${locale}/${setup ? 'request-setup' : 'forgot-password'}`
                    }
                  >
                    {status === 'used'
                      ? t('Continue to sign in', 'متابعة تسجيل الدخول')
                      : t('Request a new link', 'طلب رابط جديد')}
                    <ArrowRight />
                  </Link>
                </Button>
                {setup && (
                  <p dir="auto">
                    {t(
                      'If you still cannot continue, ask your university administrator to check your account access.',
                      'إذا تعذر المتابعة، اطلب من إدارة الجامعة التحقق من وصول حسابك.',
                    )}
                  </p>
                )}
                <Link className="as-text-link" href={`/${locale}/login`}>
                  {t('Back to sign in', 'العودة لتسجيل الدخول')}
                </Link>
              </div>
            ) : status === 'complete' ? (
              <div className="as-outcome">
                <div className="as-success-mark">
                  <CircleCheck />
                </div>
                <Button asChild className="as-primary">
                  <Link
                    href={`/${locale}/login?returnTo=${encodeURIComponent(destination)}`}
                  >
                    {t('Continue to sign in', 'متابعة تسجيل الدخول')}
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            ) : status === 'acknowledged' ? (
              <div className="as-outcome">
                <ResultAlert
                  title={t('Next step', 'الخطوة التالية')}
                  kind="success"
                >
                  {t(
                    'Check your inbox and spam folder. Email delivery is not yet confirmed. If nothing arrives, wait a minute before requesting again or contact your university administrator.',
                    'تحقق من البريد الوارد ومجلد الرسائل غير المرغوبة. لم يُؤكد وصول الرسالة بعد. إذا لم تصل، انتظر دقيقة قبل الطلب مجددًا أو تواصل مع إدارة الجامعة.',
                  )}
                </ResultAlert>
                <Button asChild className="as-primary">
                  <Link href={`/${locale}/login`}>
                    {t('Back to sign in', 'العودة لتسجيل الدخول')}
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setStatusMemory('ready')}
                >
                  {t('Use a different email', 'استخدام بريد آخر')}
                </Button>
              </div>
            ) : (
              <>
                {credential && context.name && (
                  <div className="as-invitation-context">
                    <strong>{context.name}</strong>
                    <span dir="ltr">{context.email}</span>
                    {context.expiresAt && (
                      <p dir="auto">
                        {t('Link expires', 'تنتهي صلاحية الرابط')}:{' '}
                        <time dateTime={context.expiresAt}>
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(context.expiresAt))}
                        </time>
                      </p>
                    )}
                  </div>
                )}
                <form
                  noValidate
                  onSubmit={submit}
                  aria-label={title}
                  aria-busy={!hydrated}
                >
                  <FieldGroup>
                    {['login', 'forgot-password', 'request-setup'].includes(
                      mode,
                    ) && (
                      <Field
                        data-invalid={!!errors['email']}
                        className="as-field"
                      >
                        <FieldLabel htmlFor="email">
                          {t('Email address', 'البريد الإلكتروني')}
                        </FieldLabel>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          dir="ltr"
                          autoComplete={mode === 'login' ? 'username' : 'email'}
                          value={values['email'] ?? ''}
                          onChange={(e) => value('email', e.target.value)}
                          aria-invalid={!!errors['email']}
                          aria-describedby={
                            errors['email'] ? 'email-error' : undefined
                          }
                          maxLength={254}
                          disabled={!hydrated || busy}
                        />
                        {errors['email'] && (
                          <FieldError id="email-error">
                            {errorText(errors['email'])}
                          </FieldError>
                        )}
                      </Field>
                    )}
                    {mode === 'activate' && (
                      <Field
                        className="as-field"
                        data-invalid={!!errors['token']}
                      >
                        <FieldLabel htmlFor="token">
                          {t('Existing setup credential', 'رمز الإعداد السابق')}
                        </FieldLabel>
                        <Input
                          id="token"
                          name="token"
                          type="password"
                          dir="ltr"
                          data-secret="true"
                          autoComplete="off"
                          disabled={!hydrated || busy}
                          value={values['token'] ?? ''}
                          onChange={(e) => value('token', e.target.value)}
                          aria-invalid={!!errors['token']}
                          aria-describedby={
                            errors['token']
                              ? 'token-hint token-error'
                              : 'token-hint'
                          }
                        />
                        <p dir="auto" id="token-hint" className="as-muted">
                          {t(
                            'For a credential you already received through authorized support. New invitations arrive by account email.',
                            'للرمز الذي تلقيته سابقًا عبر الدعم المصرح به. تصل الدعوات الجديدة بالبريد.',
                          )}
                        </p>
                        {errors['token'] && (
                          <FieldError id="token-error">
                            {errorText(errors['token'])}
                          </FieldError>
                        )}
                      </Field>
                    )}
                    {!['forgot-password', 'request-setup'].includes(mode) && (
                      <PasswordControl
                        id="password"
                        label={
                          mode === 'login'
                            ? t('Password', 'كلمة المرور')
                            : t('New password', 'كلمة المرور الجديدة')
                        }
                        value={values['password'] ?? ''}
                        onChange={(v) => value('password', v)}
                        locale={locale}
                        disabled={!hydrated || busy}
                        newPassword={mode !== 'login'}
                        {...(errors['password']
                          ? { error: errorText(errors['password']) }
                          : {})}
                      />
                    )}
                    {!['login', 'forgot-password', 'request-setup'].includes(
                      mode,
                    ) && (
                      <>
                        <PasswordGuidance
                          locale={locale}
                          policy={policy}
                          value={values['password'] ?? ''}
                        />
                        <PasswordControl
                          id="confirm"
                          label={t(
                            'Confirm new password',
                            'تأكيد كلمة المرور الجديدة',
                          )}
                          value={values['confirm'] ?? ''}
                          onChange={(v) => value('confirm', v)}
                          locale={locale}
                          disabled={!hydrated || busy}
                          newPassword
                          {...(errors['confirm']
                            ? { error: errorText(errors['confirm']) }
                            : {})}
                        />
                      </>
                    )}
                    {result && (
                      <ResultAlert
                        title={
                          result === 'signin-preferences'
                            ? t(
                                'Language preference needs checking',
                                'يلزم التحقق من تفضيل اللغة',
                              )
                            : result === 'signin-unconfirmed'
                              ? t(
                                  'Sign-in response needs checking',
                                  'يلزم التحقق من نتيجة تسجيل الدخول',
                                )
                              : result === 'unknown'
                                ? t(
                                    'Request could not be confirmed',
                                    'تعذر تأكيد الطلب',
                                  )
                                : t('Please try again', 'يرجى المحاولة مجددًا')
                        }
                        kind={
                          result === 'signin-preferences' ? 'info' : 'error'
                        }
                      >
                        {result === 'signin'
                          ? t(
                              'Email or password is incorrect. Check both and try again.',
                              'البريد أو كلمة المرور غير صحيحة. تحقق منهما وحاول مجددًا.',
                            )
                          : result === 'signin-preferences'
                            ? t(
                                'Sign-in was confirmed, but your language preference could not be confirmed. Open your workspace to continue; you can check Preferences there.',
                                'تأكد تسجيل الدخول، لكن لم يُؤكد حفظ تفضيل اللغة. افتح مساحة عملك للمتابعة، ويمكنك التحقق من التفضيلات هناك.',
                              )
                            : result === 'signin-unconfirmed'
                              ? t(
                                  'The sign-in response could not be confirmed. Your details are kept. Check your signed-in workspace or try again.',
                                  'تعذر تأكيد نتيجة تسجيل الدخول. احتُفظ ببياناتك. تحقق من مساحة العمل للحساب المسجل دخوله أو حاول مجددًا.',
                                )
                              : result === 'limit'
                                ? t(
                                    'Please wait before trying again.',
                                    'يرجى الانتظار قبل المحاولة مجددًا.',
                                  )
                                : result === 'policy'
                                  ? t(
                                      `Choose a password with at least ${policy.minimum} characters.`,
                                      `اختر كلمة مرور من ${policy.minimum} حرفًا على الأقل.`,
                                    )
                                  : result === 'unknown'
                                    ? t(
                                        'A connection problem interrupted the response. Check your email before requesting another link.',
                                        'انقطع الاتصال قبل تأكيد النتيجة. تحقق من بريدك قبل طلب رابط آخر.',
                                      )
                                    : t(
                                        'We could not complete the request. Your input is kept so you can try again.',
                                        'تعذر إكمال الطلب. احتُفظ بمدخلاتك للمحاولة مجددًا.',
                                      )}
                        {['signin-unconfirmed', 'signin-preferences'].includes(
                          result,
                        ) && (
                          <Button asChild variant="outline">
                            <Link
                              href={`/${locale}/workspace?returnTo=${encodeURIComponent(destination)}`}
                            >
                              {t(
                                'Check your workspace',
                                'التحقق من مساحة عملك',
                              )}
                            </Link>
                          </Button>
                        )}
                      </ResultAlert>
                    )}
                    <Button
                      type="submit"
                      disabled={!hydrated || busy}
                      className="as-primary"
                      aria-busy={busy}
                    >
                      {busy && <Spinner />}
                      {busy
                        ? t('Working…', 'جارٍ التنفيذ…')
                        : mode === 'login'
                          ? t('Sign in', 'تسجيل الدخول')
                          : mode === 'forgot-password'
                            ? t('Send recovery link', 'إرسال رابط الاستعادة')
                            : mode === 'request-setup'
                              ? t('Request setup link', 'طلب رابط الإعداد')
                              : setup
                                ? t('Set up account', 'إعداد الحساب')
                                : t(
                                    'Save new password',
                                    'حفظ كلمة المرور الجديدة',
                                  )}
                      <ArrowRight />
                    </Button>
                  </FieldGroup>
                </form>
              </>
            )}
          </CardContent>
          <CardFooter className="as-auth-card-footer">
            {mode === 'login' ? (
              <>
                <Link href={`/${locale}/forgot-password`}>
                  {t('Forgot password?', 'نسيت كلمة المرور؟')}
                </Link>
                <Separator />
                <Link href={`/${locale}/request-setup`}>
                  {t(
                    'Invitation expired? Request a new link',
                    'انتهت الدعوة؟ اطلب رابطًا جديدًا',
                  )}
                </Link>
              </>
            ) : !outcome && !['complete', 'acknowledged'].includes(status) ? (
              <Link href={`/${locale}/login`}>
                <ArrowLeft />
                {t('Back to sign in', 'العودة لتسجيل الدخول')}
              </Link>
            ) : null}
          </CardFooter>
        </Card>
        <aside className="as-auth-context" dir={dir}>
          <span className="as-eyebrow">
            {t('PERSONAL ACCOUNT ACCESS', 'وصول الحساب الفردي')}
          </span>
          <h2 dir="auto">
            {mode === 'login'
              ? t('Ready for your next task.', 'جاهز لمهمتك التالية.')
              : setup
                ? t('Set up your individual account', 'إعداد حسابك الفردي')
                : t('Recover account access', 'استعادة الوصول إلى الحساب')}
          </h2>
          <ol>
            {(mode === 'login'
              ? [
                  t(
                    'Use your personal email and password',
                    'استخدم بريدك وكلمة مرورك',
                  ),
                  t('Open your assigned workspace', 'افتح مساحة عملك المخصصة'),
                  t('Continue your academic work', 'تابع عملك الأكاديمي'),
                ]
              : setup
                ? [
                    t('Open your latest invitation', 'افتح أحدث دعوة'),
                    t('Choose your own password', 'اختر كلمة مرورك'),
                    t('Sign in to your workspace', 'سجّل الدخول لمساحة عملك'),
                  ]
                : [
                    t('Request a recovery link', 'اطلب رابط استعادة'),
                    t('Choose a new password', 'اختر كلمة مرور جديدة'),
                    t(
                      'Sign in again; old sessions end',
                      'سجّل الدخول مجددًا؛ تنتهي الجلسات السابقة',
                    ),
                  ]
            ).map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="as-context-note">
            <ShieldCheck />
            <p dir="auto">
              {t(
                'Account setup and recovery use secure email links. Published projects remain available to everyone.',
                'يستخدم إعداد الحساب واستعادته روابط آمنة عبر البريد الإلكتروني. تبقى المشاريع المنشورة متاحة للجميع.',
              )}
            </p>
          </div>
          <Link className="as-text-link" href={`/${locale}/catalogue`}>
            {t('Explore published projects', 'استعراض المشاريع المنشورة')}
            <ArrowRight />
          </Link>
        </aside>
      </main>
    </div>
  );
}
