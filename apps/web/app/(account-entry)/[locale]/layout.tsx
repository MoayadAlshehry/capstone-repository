import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { LocaleMessages } from '../../../i18n/locale-messages';
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  return <LocaleMessages locale={locale}>{children}</LocaleMessages>;
}
