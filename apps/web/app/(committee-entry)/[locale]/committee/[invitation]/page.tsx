import { notFound } from 'next/navigation';
import { CommitteeGuest } from '../../../../../committee/guest';
import { LocaleMessages } from '../../../../../i18n/locale-messages';
import '../../../../../../../packages/ui/workspace-v2.css';
import '../../../../../../../packages/ui/workspace-identity.css';
import '../../../../../assessment-studio/studio.css';
import '../../../../../semester/semester.css';
import '../../../../../academic/academic.css';
import '../../../../../committee/committee.css';
export const dynamic = 'force-dynamic';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return {
    title:
      locale === 'ar'
        ? 'تقييم اللجنة الخاص · Capstone Repository'
        : 'Private committee assessment · Capstone Repository',
    robots: { index: false, follow: false },
    referrer: 'no-referrer' as const,
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; invitation: string }>;
}) {
  const { locale, invitation } = await params;
  if (!['en', 'ar'].includes(locale) || !/^[a-f0-9-]{36}$/.test(invitation))
    notFound();
  return (
    <LocaleMessages locale={locale as 'en' | 'ar'}>
      <CommitteeGuest locale={locale as 'en' | 'ar'} invitation={invitation} />
    </LocaleMessages>
  );
}
