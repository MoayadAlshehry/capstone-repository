import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { aiEnabled } from '../../../ai/runtime';
import '../../../ai/integration.css';
import '../../../native-files/source-locator.css';
import { notFound } from 'next/navigation';
import { PublicFrame } from '../../../public-adoption/frame';
import { currentAccount } from '../../../auth/server';
import { LocaleMessages } from '../../../i18n/locale-messages';
import 'react-pdf/dist/Page/TextLayer.css';
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  return (
    <LocaleMessages locale={locale}>
      <PublicFrame
        locale={locale}
        authenticated={!!(await currentAccount())}
        aiEnabled={await aiEnabled(await headers())}
      >
        {children}
      </PublicFrame>
    </LocaleMessages>
  );
}
