import { notFound } from 'next/navigation';
import { currentAccount } from '../../../../../../auth/server';
import { CommitteeGovernance } from '../../../../../../committee/admin';
import '../../../../../../committee/committee.css';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params,
    a = await currentAccount();
  if (!a || a.role !== 'university_admin' || !['en', 'ar'].includes(locale))
    notFound();
  return <CommitteeGovernance locale={locale as 'en' | 'ar'} />;
}
