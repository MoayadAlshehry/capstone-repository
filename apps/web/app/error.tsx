'use client';
import { useLocale } from 'next-intl';
import { Suspense } from 'react';
import { PublicShell } from '../public-adoption/shell';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  return (
    <Suspense fallback={null}>
      <PublicShell locale={locale}>
        <main id="main" tabIndex={-1} className="wrap grid gap-6">
          <h1 dir="auto">
            {locale === 'ar'
              ? 'تعذر قراءة هذه الصفحة'
              : 'This page could not be read'}
          </h1>
          <p dir="auto">
            {locale === 'ar'
              ? 'أعد المحاولة للتحقق من الحالة الحالية. لا يُفترض نجاح أي إجراء سابق.'
              : 'Retry to check the current state. No preceding action is assumed to have succeeded.'}
          </p>
          <Button className="w-fit" onClick={reset}>
            {locale === 'ar' ? 'إعادة المحاولة' : 'Try again'}
          </Button>
          <a className="public-back" href={'/' + locale}>
            {locale === 'ar' ? 'العودة إلى المكتبة' : 'Return to the library'}
          </a>
        </main>
      </PublicShell>
    </Suspense>
  );
}
