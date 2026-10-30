'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { useSharedAppearance } from '../shared-appearance';
const Locale = createContext<'en' | 'ar' | null>(null);
export function PublicScope({
  locale,
  children,
  className = '',
}: {
  locale: 'en' | 'ar';
  children: ReactNode;
  className?: string;
}) {
  const theme = useSharedAppearance();
  return (
    <Locale.Provider value={locale}>
      <link rel="stylesheet" href="/public-ui.css" />
      <div
        data-public-ui="shadcn"
        data-theme={theme}
        lang={locale}
        dir="ltr"
        className={'p3-public ' + (theme === 'dark' ? 'dark ' : '') + className}
      >
        {children}
      </div>
    </Locale.Provider>
  );
}
/** Radix content portals carry the same tokens and text direction outside the route root. */
export function usePublicPortal() {
  const theme = useSharedAppearance(),
    locale = useContext(Locale) ?? 'en';
  return {
    'data-public-ui': 'shadcn',
    'data-theme': theme,
    lang: locale,
    dir: locale === 'ar' ? ('rtl' as const) : ('ltr' as const),
    className: theme === 'dark' ? 'dark' : '',
  };
}
export function useIsPublicUI() {
  return useContext(Locale) !== null;
}
export function usePublicLocale() {
  return useContext(Locale) ?? 'en';
}
/** Re-establish public tokens where a light-DOM slot inherits the AI host theme. */
export function PublicContent({ children }: { children: ReactNode }) {
  const portal = usePublicPortal();
  return (
    <div {...portal} dir="ltr" data-public-content>
      {children}
    </div>
  );
}
