'use client';
import { useLocale, useTranslations } from 'next-intl';
import { PublicShell } from '../../../public-adoption/shell';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
export default function PublicError({ reset }: { reset: () => void }) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en',
    t = useTranslations('Archive');
  return (
    <PublicShell locale={locale}>
      <main id="main" className="wrap grid gap-6">
        <Alert variant="destructive">
          <AlertTitle>
            <h1 dir="auto">{t('catalogue.failedTitle')}</h1>
          </AlertTitle>
          <AlertDescription dir="auto">
            {t('catalogue.failedText')}
          </AlertDescription>
        </Alert>
        <Button className="w-fit" onClick={reset}>
          {t('common.retry')}
        </Button>
      </main>
    </PublicShell>
  );
}
