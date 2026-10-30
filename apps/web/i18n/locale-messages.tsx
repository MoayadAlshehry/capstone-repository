import { LocaleClient } from './locale-client';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
/** URL-bound messages refresh at the locale segment; retain request-specific public message filtering. */
export async function LocaleMessages({
  locale,
  children,
}: {
  locale: 'en' | 'ar';
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      key={locale}
      locale={locale}
      messages={await getMessages({ locale })}
    >
      <LocaleClient locale={locale}>{children}</LocaleClient>
    </NextIntlClientProvider>
  );
}
