'use client';
import { useState, type ReactNode } from 'react';
import { R3Environment } from '@capstone/ui/r3';
import { clearPrivateInputs } from './client-privacy';
import { identityMetadata } from './r3-metadata';
export function IdentityPublicFrame({
  locale,
  children,
}: {
  locale: 'en' | 'ar';
  children: ReactNode;
}) {
  const [lang, setLang] = useState(locale);
  return (
    <R3Environment
      locale={lang}
      onLocaleChange={(next, href) => {
        clearPrivateInputs();
        history.replaceState(history.state, '', href);
        document.documentElement.lang = next;
        const path = new URL(href, location.origin).pathname;
        const purpose = path.endsWith('/activate')
          ? 'activate'
          : path.endsWith('/reset-password')
            ? 'reset'
            : path.endsWith('/partner/register')
              ? 'partner'
              : 'login';
        document.title = identityMetadata(next, purpose).title;
        setLang(next);
      }}
    >
      {children}
    </R3Environment>
  );
}
