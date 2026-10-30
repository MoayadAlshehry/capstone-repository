'use client';
import { AIProvider } from '../ai/client';
import { UnifiedSearchProvider } from '../ai/search-client';
import { useEffect, useState, type ReactNode } from 'react';
import { PublicShell } from './shell';
import { PublicFooter } from './footer';
import { PublicContent } from '../public-ui/scope';
export { usePublicDraft } from './state';
export function PublicFrame({
  locale,
  children,
  authenticated: initial = false,
  aiEnabled = false,
}: {
  locale: 'en' | 'ar';
  children: ReactNode;
  authenticated?: boolean;
  aiEnabled?: boolean;
}) {
  const [authenticated, setAuthenticated] = useState(initial);
  useEffect(() => {
    const f = (e: Event) =>
      setAuthenticated((e as CustomEvent<boolean>).detail);
    addEventListener('p3-public-account', f);
    return () => removeEventListener('p3-public-account', f);
  }, []);
  return (
    <PublicShell
      locale={locale}
      authenticated={authenticated}
      includeFooter={false}
    >
      <AIProvider locale={locale} enabled={aiEnabled}>
        <UnifiedSearchProvider>
          <PublicContent>
            {children}
            <PublicFooter locale={locale} authenticated={authenticated} />
          </PublicContent>
        </UnifiedSearchProvider>
      </AIProvider>
    </PublicShell>
  );
}
