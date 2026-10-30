import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { PublicShell } from '../public-adoption/shell';
import { Button } from '@/components/ui/button';
import type { Locale } from '../i18n/routing';
export default async function NotFound() {
  const t = await getTranslations('Shell'),
    locale = (await getLocale()) as Locale;
  return (
    <Suspense fallback={null}>
      <PublicShell locale={locale}>
        <main id="main" tabIndex={-1} className="wrap grid gap-6" dir="ltr">
          <h1 dir={locale === 'ar' ? 'rtl' : 'ltr'}>{t('notFound')}</h1>
          <p dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            {locale === 'ar'
              ? 'قد تكون الصفحة غير متاحة أو تغيرت صلاحيتك. افتح مساحة عملك أو المكتبة.'
              : 'This page may be unavailable or your access may have changed. Open your workspace or the public library.'}
          </p>
          <Button asChild className="w-fit">
            <a href={`/${locale}/workspace`}>
              {locale === 'ar' ? 'مساحة عملي' : 'My workspace'}
            </a>
          </Button>{' '}
          <a href={`/${locale}`} className="text-primary underline w-fit">
            {locale === 'ar' ? 'المكتبة العامة' : 'Public library'}
          </a>
        </main>
      </PublicShell>
    </Suspense>
  );
}
