import { safeAccountReturn } from '@capstone/db/account-mail';
import { identityMetadata } from '../../../../../auth/r3-metadata';
import { notFound } from 'next/navigation';
import { PublicPartnerEntry } from '../../../../../public-adoption/partner-entry';
import { currentAccount } from '../../../../../auth/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  return (
    <PublicPartnerEntry
      locale={locale}
      authenticated={!!(await currentAccount())}
      returnTo={safeAccountReturn((await searchParams).returnTo, locale)}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return identityMetadata(locale, 'partner');
}
