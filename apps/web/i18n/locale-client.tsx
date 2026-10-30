'use client';
import { useLayoutEffect, type ReactNode } from 'react';
import { BidiProvider } from '@capstone/ui/bidi';
export function LocaleClient({
  locale,
  children,
}: {
  locale: 'en' | 'ar';
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <BidiProvider locale={locale}>{children}</BidiProvider>;
}
