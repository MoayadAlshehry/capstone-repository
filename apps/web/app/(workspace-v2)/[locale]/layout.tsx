import '../../../../../packages/ui/workspace-v2.css';
import '../../../../../packages/ui/workspace-identity.css';
import '../../../account-entry/entry.css';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import { safeAccountReturn } from '@capstone/db/account-mail';
import { currentAccount } from '../../../auth/server';
import { accountContext } from '../../../auth/r3-context-server';
import { WorkspaceShell } from '../../../workspace-v2/shell';
import { LocaleMessages } from '../../../i18n/locale-messages';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ locale: string }>;
  children: ReactNode;
}) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  const a = await currentAccount();
  if (!a)
    redirect(
      '/' +
        locale +
        '/login?returnTo=' +
        encodeURIComponent(
          safeAccountReturn(
            (await headers()).get('x-capstone-workspace-path'),
            locale,
          ),
        ),
    );
  return (
    <LocaleMessages locale={locale}>
      <WorkspaceShell
        identity={await accountContext(a)}
        locale={locale}
        initialOpen={(await cookies()).get('sidebar_state')?.value !== 'false'}
      >
        {children}
      </WorkspaceShell>
    </LocaleMessages>
  );
}
