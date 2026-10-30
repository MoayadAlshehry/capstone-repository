'use client';
import { useLocale, useTranslations } from 'next-intl';
import { PublicShell } from '../../../../../public-adoption/shell';
import { Button } from '@/components/ui/button';
export default function NotFound() {
  const locale = useLocale() === 'ar' ? 'ar' : 'en',
    t = useTranslations('Archive');
  return (
    <PublicShell locale={locale}>
      <main id="main" className="wrap grid gap-6">
        <h1 dir="auto">{t('project.unavailableTitle')}</h1>
        <p dir="auto">{t('project.unavailableText')}</p>
        <Button asChild className="w-fit">
          <a href={`/${locale}/catalogue`}>{t('nav.backToLibrary')}</a>
        </Button>
      </main>
    </PublicShell>
  );
}
