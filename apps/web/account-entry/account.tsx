'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFact, BidiFacts } from '@capstone/ui/bidi';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  FieldGroup,
  Button,
  Badge,
  UserRound,
  ShieldCheck,
  KeyRound,
  Globe2,
  ArrowRight,
  ArrowLeft,
  Separator,
} from '@capstone/ui/workspace-v2';
import {
  PasswordControl,
  PasswordGuidance,
  ResultAlert,
  copy,
  passwordValid,
  type PasswordPolicy,
  type Locale,
} from './fields';
import { accountPost } from './forms';
import { PersonAvatar, IdentityEmail } from '@capstone/ui/visual-media';
import { MediaEditor } from '../visual-media/editor';
import { useMemoryDraft } from './drafts';
import { AppearanceSelect, useSharedAppearance } from '../shared-appearance';
import { useValidatedPersonalNavigation } from '../workspace-v2/navigation-context-client';
import {
  personalHref,
  localeDestination,
  type NavigationContext,
} from '../workspace-v2/navigation-context';
export interface PersonalAccount {
  id: string;
  name: string;
  email: string;
  institution: string | null;
  role: string;
  status: string;
  reviewer: boolean;
}
export function AccountOverview({
  locale,
  account,
  intent,
}: {
  locale: Locale;
  account: PersonalAccount;
  intent: NavigationContext;
}) {
  useValidatedPersonalNavigation(account.id, account.reviewer, intent);
  const t = (e: string, a: string) => copy(locale, e, a),
    router = useRouter(),
    dark = useSharedAppearance() === 'dark',
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  return (
    <div className="as-workspace-page">
      {intent.warning && (
        <p dir="auto" role="status">
          {t(
            'That return destination is no longer available. Use your current workspace.',
            'لم تعد وجهة العودة متاحة. استخدم مساحة عملك الحالية.',
          )}
        </p>
      )}
      {intent.context === 'personal' ? (
        <nav aria-label={t('Choose workspace', 'اختر مساحة العمل')}>
          <Link href={'/' + locale + '/supervision'}>
            {t('Supervision', 'الإشراف')}
          </Link>{' '}
          ·{' '}
          <Link href={'/' + locale + '/reviewer'}>
            {t('Independent review', 'التقييم المستقل')}
          </Link>
        </nav>
      ) : (
        <Link className="as-back" href={intent.returnTo}>
          {t('Back to your workspace', 'العودة إلى مساحة عملك')}
        </Link>
      )}
      <header className="as-page-header" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <span className="as-eyebrow">
          {t('PERSONAL ACCOUNT', 'الحساب الفردي')}
        </span>
        <h1 dir="auto">{t('Your account', 'حسابك')}</h1>
        <p dir="auto">
          {t(
            'Your identity, security and preferences in one place.',
            'هويتك وأمان حسابك وتفضيلاتك في مكان واحد.',
          )}
        </p>
      </header>
      <nav
        className="as-account-nav"
        aria-label={t('Account sections', 'أقسام الحساب')}
      >
        <a href="#profile" aria-current="page">
          <UserRound />
          {t('Profile', 'الملف الشخصي')}
        </a>
        <Link href={personalHref(locale, 'security', intent)}>
          <ShieldCheck />
          {t('Security', 'الأمان')}
        </Link>
        <a href="#preferences">
          <Globe2 />
          {t('Preferences', 'التفضيلات')}
        </a>
      </nav>
      <div className="as-account-grid">
        <Card
          id="profile"
          className="as-profile-card"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <CardHeader>
            <div className="as-person-heading">
              <PersonAvatar
                name={account.name}
                userId={account.id}
                size="lg"
                className="as-profile-avatar"
              />
              <div>
                <h2 dir="auto">{account.name}</h2>
                <p dir="ltr">
                  <IdentityEmail email={account.email} />
                </p>
              </div>
              <Badge variant="outline" className="as-profile-status">
                {t('Active account', 'حساب نشط')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <MediaEditor
              locale={locale}
              target={{ kind: 'avatar', user: account.id }}
            />
            <BidiFacts className="as-identity-list">
              <BidiFact>
                <BidiLabel dir="auto">
                  {t('Account role', 'دور الحساب')}
                </BidiLabel>
                <BidiData dir="auto">{account.role}</BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">{t('Institution', 'المؤسسة')}</BidiLabel>
                <BidiData dir="auto">
                  {account.institution ??
                    t('Independent account context', 'سياق حساب مستقل')}
                </BidiData>
              </BidiFact>
              {account.reviewer && (
                <BidiFact>
                  <BidiLabel dir="auto">
                    {t('Faculty capability', 'صلاحية عضو هيئة التدريس')}
                  </BidiLabel>
                  <BidiData dir="auto">
                    {t('Independent reviewer', 'مقيّم مستقل')}
                  </BidiData>
                </BidiFact>
              )}
              <BidiFact>
                <BidiLabel dir="auto">
                  {t('Account status', 'حالة الحساب')}
                </BidiLabel>
                <BidiData dir="auto">{t('Active', 'نشط')}</BidiData>
              </BidiFact>
            </BidiFacts>
            <p dir="auto" className="as-muted">
              {t(
                'Institution and role are assigned through authorized university processes.',
                'تُحدد المؤسسة والدور عبر إجراءات الجامعة المصرح بها.',
              )}
            </p>
            {account.role ===
              t('Faculty / supervisor', 'عضو هيئة تدريس / مشرف') && (
              <Button asChild variant="outline">
                <Link
                  href={
                    '/' +
                    locale +
                    '/reviewer/profile?' +
                    new URLSearchParams({
                      context: intent.context,
                      returnTo: intent.returnTo,
                    })
                  }
                >
                  {t('Independent reviewer profile', 'ملف المقيّم المستقل')}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card
          className="as-security-summary"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <CardHeader>
            <div className="as-task-icon">
              <ShieldCheck />
            </div>
            <CardTitle>
              <h2 dir="auto">{t('Security', 'الأمان')}</h2>
            </CardTitle>
            <CardDescription>
              {t(
                'Keep access to your individual account secure.',
                'حافظ على أمان الوصول إلى حسابك الفردي.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p dir="auto">
              {t(
                'Change your own password. A successful change ends your other sessions while keeping this one open.',
                'غيّر كلمة مرورك الشخصية. تنتهي الجلسات الأخرى بعد التغيير الناجح وتبقى هذه الجلسة مفتوحة.',
              )}
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild className="as-primary">
              <Link href={personalHref(locale, 'security', intent)}>
                {t('Manage account security', 'إدارة أمان الحساب')}
                <ArrowRight />
              </Link>
            </Button>
          </CardFooter>
        </Card>
        <Card
          id="preferences"
          className="as-preferences"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <CardHeader>
            <CardTitle>
              <h2 dir="auto">{t('Preferences', 'التفضيلات')}</h2>
            </CardTitle>
            <CardDescription>
              {t(
                'Choose the language and appearance you use in this workspace.',
                'اختر اللغة والمظهر المستخدمين في مساحة العمل.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="as-preference-row">
              <div>
                <strong>{t('Language', 'اللغة')}</strong>
                <p dir="auto">{locale === 'en' ? 'English' : 'العربية'}</p>
              </div>
              <Button
                pending={busy}
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(false);
                  const next = locale === 'en' ? 'ar' : 'en';
                  try {
                    await accountPost({ locale: next }, '/api/auth/locale');
                    router.push(
                      localeDestination(
                        personalHref(locale, 'account', intent),
                        next,
                      ),
                    );
                  } catch {
                    setError(true);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Globe2 />
                {locale === 'en' ? 'العربية' : 'English'}
              </Button>
            </div>
            <Separator />
            <div className="as-preference-row">
              <div>
                <strong>{t('Appearance', 'المظهر')}</strong>
                <p dir="auto">
                  {dark ? t('Dark', 'داكن') : t('Light', 'فاتح')}
                </p>
              </div>
              <AppearanceSelect locale={locale} />
            </div>
            {error && (
              <ResultAlert
                title={t('Preference not saved', 'لم يُحفظ التفضيل')}
                kind="error"
              >
                {t(
                  'Try again when your connection is available.',
                  'حاول مجددًا عند توفر الاتصال.',
                )}
              </ResultAlert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
export function AccountSecurity({
  locale,
  account,
  policy,
  intent,
}: {
  locale: Locale;
  account: PersonalAccount;
  intent: NavigationContext;
  policy: PasswordPolicy;
}) {
  useValidatedPersonalNavigation(account.id, account.reviewer, intent);
  const t = (e: string, a: string) => copy(locale, e, a),
    draft = useMemoryDraft(account.id + '/account/security'),
    [values, setValues] = useState({ ...draft.values }),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [result, setResult] = useState(''),
    [recoveryError, setRecoveryError] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(draft.status === 'complete');
  const change = (k: string, v: string) => {
    draft.values[k] = v;
    setValues({ ...draft.values });
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const errorText = (code: string) =>
    ({
      required: t('Enter your current password.', 'أدخل كلمة مرورك الحالية.'),
      current: t(
        'Your current password is incorrect.',
        'كلمة مرورك الحالية غير صحيحة.',
      ),
      policy: t(
        `Use ${policy.minimum}–${policy.maximum} characters.`,
        `استخدم ${policy.minimum}–${policy.maximum} حرفًا.`,
      ),
      match: t('The confirmation does not match.', 'التأكيد غير مطابق.'),
    })[code] ?? '';
  useEffect(() => {
    const clear = () => {
      setValues({});
      setErrors({});
      setResult('');
    };
    window.addEventListener('account-draft-cleared', clear);
    return () => window.removeEventListener('account-draft-cleared', clear);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || result === 'unknown') return;
    setResult('');
    const invalid: Record<string, string> = {};
    if (!values['currentPassword']) invalid['currentPassword'] = 'required';
    if (!passwordValid(values['newPassword'] ?? '', policy))
      invalid['newPassword'] = 'policy';
    if (values['confirm'] !== values['newPassword'])
      invalid['confirm'] = 'match';
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() =>
        document.getElementById(Object.keys(invalid)[0]!)?.focus(),
      );
      return;
    }
    setBusy(true);
    try {
      await accountPost(
        {
          currentPassword: values['currentPassword'],
          newPassword: values['newPassword'],
        },
        '/api/auth/change-password',
      );
      draft.values = {};
      draft.status = 'complete';
      setValues({});
      setDone(true);
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'INVALID_CREDENTIALS')
        setErrors({ currentPassword: 'current' });
      else setResult(e instanceof TypeError ? 'unknown' : 'failed');
    } finally {
      setBusy(false);
    }
  }
  async function checkBySigningIn() {
    if (busy) return;
    setBusy(true);
    setRecoveryError(false);
    try {
      await accountPost({}, '/api/auth/sign-out');
      draft.values = {};
      location.assign(`/${locale}/login`);
    } catch {
      setRecoveryError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="as-workspace-page">
      {intent.warning && (
        <p dir="auto" role="status">
          {t(
            'That return destination is no longer available. Use your current workspace.',
            'لم تعد وجهة العودة متاحة. استخدم مساحة عملك الحالية.',
          )}
        </p>
      )}
      <Link className="as-back" href={personalHref(locale, 'account', intent)}>
        <ArrowLeft />
        {t('Back to your account', 'العودة إلى حسابك')}
      </Link>
      <header className="as-page-header" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <span className="as-eyebrow">
          {t('PERSONAL ACCOUNT / SECURITY', 'الحساب الفردي / الأمان')}
        </span>
        <h1 dir="auto">{t('Account security', 'أمان الحساب')}</h1>
        <p dir="auto">
          {t(
            'Manage the password for your own identity.',
            'إدارة كلمة مرور هويتك الشخصية.',
          )}
        </p>
      </header>
      <Card className="as-focused-card" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <CardHeader>
          <div className="as-task-icon">
            <KeyRound />
          </div>
          <CardTitle>
            <h2 dir="auto">
              {done
                ? t('Password changed', 'تغيّرت كلمة المرور')
                : t('Change your password', 'تغيير كلمة مرورك')}
            </h2>
          </CardTitle>
          <CardDescription>
            <span dir="ltr">{account.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="as-outcome">
              <ResultAlert
                title={t('Change confirmed', 'تأكد التغيير')}
                kind="success"
              >
                {t(
                  'Your new password is saved. Other sessions have ended; this session remains open.',
                  'حُفظت كلمة المرور الجديدة وأُغلقت الجلسات الأخرى. تبقى هذه الجلسة مفتوحة.',
                )}
              </ResultAlert>
              <Button asChild className="as-primary">
                <Link href={personalHref(locale, 'account', intent)}>
                  {t('Return to your account', 'العودة إلى حسابك')}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <p dir="auto" className="as-muted">
                {t(
                  'Only your password changes. Other people’s account access is managed in the university People workspace.',
                  'يُغيّر هذا كلمة مرورك فقط. تُدار حسابات الآخرين في مساحة الأشخاص الخاصة بالجامعة.',
                )}
              </p>
              <form noValidate onSubmit={submit}>
                <FieldGroup>
                  <PasswordControl
                    id="currentPassword"
                    label={t('Current password', 'كلمة المرور الحالية')}
                    locale={locale}
                    disabled={busy}
                    value={values['currentPassword'] ?? ''}
                    onChange={(v) => change('currentPassword', v)}
                    {...(errors['currentPassword']
                      ? { error: errorText(errors['currentPassword']) }
                      : {})}
                  />
                  <Separator />
                  <PasswordControl
                    id="newPassword"
                    label={t('New password', 'كلمة المرور الجديدة')}
                    locale={locale}
                    newPassword
                    disabled={busy}
                    value={values['newPassword'] ?? ''}
                    onChange={(v) => change('newPassword', v)}
                    {...(errors['newPassword']
                      ? { error: errorText(errors['newPassword']) }
                      : {})}
                  />
                  <PasswordGuidance
                    locale={locale}
                    policy={policy}
                    value={values['newPassword'] ?? ''}
                  />
                  <PasswordControl
                    id="confirm"
                    label={t(
                      'Confirm new password',
                      'تأكيد كلمة المرور الجديدة',
                    )}
                    locale={locale}
                    newPassword
                    disabled={busy}
                    value={values['confirm'] ?? ''}
                    onChange={(v) => change('confirm', v)}
                    {...(errors['confirm']
                      ? { error: errorText(errors['confirm']) }
                      : {})}
                  />
                  {result && (
                    <ResultAlert
                      title={
                        result === 'unknown'
                          ? t(
                              'Change could not be confirmed',
                              'تعذر تأكيد التغيير',
                            )
                          : t('Password not changed', 'لم تتغير كلمة المرور')
                      }
                      kind="error"
                    >
                      {result === 'unknown'
                        ? t(
                            'The response was interrupted. Do not submit again yet. Sign out and check your new password; use recovery if you cannot sign in.',
                            'انقطع الرد. لا تُعد الإرسال الآن. سجّل الخروج وتحقق من كلمة المرور الجديدة، أو استخدم الاستعادة إذا تعذر الدخول.',
                          )
                        : t(
                            'Your input is kept. Check your connection and try again.',
                            'احتُفظ بمدخلاتك. تحقق من الاتصال وحاول مجددًا.',
                          )}
                    </ResultAlert>
                  )}
                  {result === 'unknown' ? (
                    <>
                      {recoveryError && (
                        <ResultAlert
                          title={t(
                            'Sign-out could not be confirmed',
                            'تعذر تأكيد تسجيل الخروج',
                          )}
                          kind="error"
                        >
                          {t(
                            'Check your connection and try again. Your password change still needs checking.',
                            'تحقق من الاتصال وحاول مجددًا. لا تزال نتيجة تغيير كلمة المرور بحاجة إلى التحقق.',
                          )}
                        </ResultAlert>
                      )}
                      <Button
                        pending={busy}
                        type="button"
                        disabled={busy}
                        className="as-primary"
                        onClick={() => void checkBySigningIn()}
                      >
                        {busy
                          ? t('Signing out…', 'جارٍ تسجيل الخروج…')
                          : t('Check by signing in', 'التحقق بتسجيل الدخول')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="submit"
                      disabled={busy}
                      className="as-primary"
                      pending={busy}
                    >
                      {busy
                        ? t('Saving…', 'جارٍ الحفظ…')
                        : t('Save new password', 'حفظ كلمة المرور الجديدة')}
                      <ArrowRight />
                    </Button>
                  )}
                  <p dir="auto" className="as-muted">
                    {t(
                      'After a successful change, your other sessions will end.',
                      'ستُغلق الجلسات الأخرى بعد التغيير الناجح.',
                    )}
                  </p>
                </FieldGroup>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
