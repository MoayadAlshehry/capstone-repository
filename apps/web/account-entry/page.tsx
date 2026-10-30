import { notFound, redirect } from 'next/navigation';
import { AccountEntry } from './forms';
import { currentAccount } from '../auth/server';
import { safeAccountReturn } from '@capstone/db/account-mail';
import { newPasswordPolicy } from '@capstone/db/password-policy';
import { PublicShell } from '../public-adoption/shell';
export function entryPage(
  mode:
    | 'login'
    | 'forgot-password'
    | 'setup-account'
    | 'reset-password'
    | 'activate'
    | 'request-setup',
) {
  return async function Page({
    params,
    searchParams,
  }: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const { locale } = await params;
    if (locale !== 'en' && locale !== 'ar') notFound();
    const query = await searchParams,
      returnTo = safeAccountReturn(query['returnTo'], locale);
    if (mode === 'login' && (await currentAccount()))
      redirect(`/${locale}/workspace?returnTo=${encodeURIComponent(returnTo)}`);
    return (
      <PublicShell locale={locale} authenticated={!!(await currentAccount())}>
        <div className="wrap ps-account">
          <AccountEntry
            locale={locale}
            mode={mode}
            returnTo={returnTo}
            policy={newPasswordPolicy}
          />
        </div>
      </PublicShell>
    );
  };
}

export function entryMetadata(mode: string) {
  return async ({ params }: { params: Promise<{ locale: string }> }) => {
    const { locale } = await params;
    const titles: Record<string, [string, string]> = {
      'forgot-password': ['Recover your account', 'استعادة حسابك'],
      'request-setup': ['Request a setup link', 'طلب رابط إعداد الحساب'],
      'setup-account': ['Set up your account', 'إعداد حسابك'],
      'reset-password': ['Reset your password', 'إعادة تعيين كلمة المرور'],
      activate: ['Activate your account', 'تفعيل حسابك'],
    };
    return {
      title:
        (titles[mode]?.[locale === 'ar' ? 1 : 0] ?? 'Account access') +
        ' | Capstone Repository',
      robots: { index: false, follow: false },
      referrer: 'no-referrer' as const,
    };
  };
}
