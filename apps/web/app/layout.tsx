import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { historyInitialization } from '../assessment-studio/history-guard';
import './base.css';
import '../../../packages/ui/r3.css';
import '../../../packages/ui/r3-identity.css';
import '../../../packages/ui/brand.css';
import '../../../packages/ui/bidi.css';
import '../../../packages/ui/visual-media.css';
import '../visual-media/media.css';
import '../../../packages/ui/interaction-patterns.css';
import '../../../packages/ui/interaction-feedback.css';
import { VisualMediaRoot } from '../visual-media/provider';
import { DemoEnvironment } from '../demo-environment';

import { themeInitialization } from '@capstone/ui/theme';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell');
  return {
    title:
      process.env['P53_DEMO_ENVIRONMENT'] === 'true'
        ? 'Demonstration · Capstone Repository'
        : 'Capstone Repository',
    ...(process.env['P53_DEMO_ENVIRONMENT'] === 'true'
      ? { robots: { index: false, follow: false } }
      : {}),
    description: t('description'),
    icons: { icon: '/brand/Icon_Mark.svg' },
  };
}
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir="ltr" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitialization }} />
        <Script id="workspace-history-guard" strategy="beforeInteractive">
          {historyInitialization}
        </Script>
      </head>
      <body>
        <NextIntlClientProvider>
          <DemoEnvironment
            active={process.env['P53_DEMO_ENVIRONMENT'] === 'true'}
            locale={locale}
          >
            <VisualMediaRoot>{children}</VisualMediaRoot>
          </DemoEnvironment>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
