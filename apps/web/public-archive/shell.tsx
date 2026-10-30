'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BrandLogo,
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  List,
  Sun,
  Moon,
  Globe2,
  ArrowRight,
} from '@capstone/ui/workspace-v2';
import { themeStorageKey } from '@capstone/ui/theme';
import type { Locale } from './core';
export function PublicShell({
  locale,
  authenticated = false,
  children,
}: {
  locale: Locale;
  authenticated?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('Archive'),
    path = usePathname(),
    query = useSearchParams(),
    root = useRef<HTMLDivElement>(null),
    header = useRef<HTMLElement>(null),
    [open, setOpen] = useState(false),
    [dark, setDark] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const update = () =>
      setDark(document.documentElement.dataset.theme === 'dark');
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const size = new ResizeObserver(() =>
      root.current?.style.setProperty(
        '--archive-header',
        header.current?.offsetHeight + 'px',
      ),
    );
    if (header.current) size.observe(header.current);
    return () => {
      observer.disconnect();
      size.disconnect();
    };
  }, []);
  function theme() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {}
  }
  async function language() {
    const next = locale === 'en' ? 'ar' : 'en',
      params = new URLSearchParams(query.toString()),
      from = params.get('from');
    if (from?.startsWith('/' + locale + '/catalogue'))
      params.set('from', from.replace(/^\/(en|ar)/, '/' + next));
    if (authenticated)
      try {
        const r = await fetch('/api/auth/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
        if (!r.ok) throw Error();
      } catch {
        setError(t('access.failed'));
        return;
      }
    location.assign(
      path.replace(/^\/(en|ar)/, '/' + next) +
        (params.size ? '?' + params : '') +
        location.hash,
    );
  }
  const settings = (
    <div className="lra-settings">
      <button onClick={() => void language()}>
        <Globe2 />
        {locale === 'en' ? 'العربية' : 'English'}
      </button>
      <button
        onClick={theme}
        aria-label={
          t('nav.appearance') + ': ' + t(dark ? 'nav.light' : 'nav.dark')
        }
      >
        {dark ? <Sun /> : <Moon />}
        {t(dark ? 'nav.light' : 'nav.dark')}
      </button>
    </div>
  );
  const entry = `/${locale}/${authenticated ? 'workspace' : 'login'}`;
  return (
    <div
      className="lra"
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      ref={root}
    >
      <link
        rel="preload"
        as="font"
        href={
          locale === 'ar'
            ? '/fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2'
            : '/fonts/space-grotesk-latin-variable.woff2'
        }
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <a className="lra-skip" href="#archive-main">
        {t('nav.skip')}
      </a>
      <header className="lra-header" ref={header}>
        <div className="lra-wrap lra-header-line">
          <a
            href={`/${locale}`}
            className="lra-logo"
            aria-label="Capstone Repository"
          >
            <BrandLogo decorative label="Capstone Repository" />
          </a>
          <nav className="lra-nav" aria-label={t('nav.menu')}>
            <a
              href={`/${locale}`}
              aria-current={path === `/${locale}` ? 'page' : undefined}
            >
              {t('nav.home')}
            </a>
            <a
              href={`/${locale}/catalogue`}
              aria-current={path.includes('catalogue') ? 'page' : undefined}
            >
              {t('nav.explore')}
            </a>
          </nav>
          <div className="lra-header-end">
            <div className="lra-settings-desktop">{settings}</div>
            <a className="lra-entry" href={entry}>
              {t(authenticated ? 'nav.workspace' : 'nav.signIn')}
              <ArrowRight />
            </a>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button className="lra-menu-button" aria-label={t('nav.menu')}>
                  <List />
                </button>
              </SheetTrigger>
              <SheetContent
                className="lra lra-sheet"
                lang={locale}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                closeLabel={t('nav.closeMenu')}
              >
                <SheetTitle>{t('nav.menu')}</SheetTitle>
                <SheetDescription className="lra-sr">
                  {t('nav.language')} / {t('nav.appearance')}
                </SheetDescription>
                <nav className="lra-menu-links">
                  <a href={`/${locale}`}>{t('nav.home')}</a>
                  <a href={`/${locale}/catalogue`}>{t('nav.explore')}</a>
                  <a href={entry}>
                    {t(authenticated ? 'nav.workspace' : 'nav.signIn')}
                  </a>
                </nav>
                {settings}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <noscript>
        <style>
          {
            '.lra-menu-button,.lra-settings-desktop{display:none!important}.lra-header{position:static}.lra-static-nav{display:flex;gap:1.5rem;flex-wrap:wrap;padding-block:1rem}'
          }
        </style>
        <nav className="lra-wrap lra-static-nav">
          <a href={`/${locale}`}>{t('nav.home')}</a>
          <a href={`/${locale}/catalogue`}>{t('nav.explore')}</a>
          <a
            href={
              path.replace(/^\/(en|ar)/, locale === 'en' ? '/ar' : '/en') +
              (query.size ? '?' + query : '')
            }
          >
            {locale === 'en' ? 'العربية' : 'English'}
          </a>
        </nav>
      </noscript>
      {error && (
        <p dir="auto" className="lra-wrap" role="alert">
          {error}
        </p>
      )}
      <main className="lra-wrap lra-main" id="archive-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="lra-wrap lra-footer">
        <a href={`/${locale}`} className="lra-logo">
          <BrandLogo label="Capstone Repository" />
        </a>
        <p dir="auto">{t('footer.line')}</p>
        <a href={`/${locale}/catalogue`}>
          {t('nav.explore')} <ArrowRight />
        </a>
      </footer>
    </div>
  );
}
