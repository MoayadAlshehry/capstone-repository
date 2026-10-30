'use client';
import { BrandLogo } from '@capstone/ui/brand-logo';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { Globe2, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from '@/components/ui/navigation-menu';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/public-ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PublicAppearance } from '../public-ui/appearance';
import { PublicScope, usePublicPortal } from '../public-ui/scope';
import { PublicFooter } from './footer';
import {
  publicLocaleDestination,
  localizedPublicDestination,
} from './navigation';
type Locale = 'en' | 'ar';
export function PublicShell(props: {
  locale: Locale;
  authenticated?: boolean;
  children: ReactNode;
  onLocaleChange?: (href: string) => void;
  localeDisabled?: boolean;
  entryReturnTo?: string;
  includeFooter?: boolean;
}) {
  return (
    <PublicScope locale={props.locale}>
      <ShellContent {...props} />
    </PublicScope>
  );
}
function ShellContent({
  locale,
  authenticated = false,
  children,
  onLocaleChange,
  localeDisabled = false,
  entryReturnTo,
  includeFooter = true,
}: Parameters<typeof PublicShell>[0]) {
  const router = useRouter(),
    path = usePathname(),
    query = useSearchParams(),
    portal = usePublicPortal();
  const [open, setOpen] = useState(false),
    [error, setError] = useState('');
  const l = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const other = locale === 'en' ? 'ar' : 'en',
    localeHref = localizedPublicDestination(path, query.toString(), other);
  const nav = [
    ['', l('Home', 'الرئيسية')],
    ['/catalogue', l('Explore projects', 'استكشف المشاريع')],
    ['/about', l('About the platform', 'عن المنصة')],
  ];
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  async function switchLocale(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (localeDisabled) return;
    const href = publicLocaleDestination(
      localeHref,
      location.hash,
      location.origin,
    );
    if (onLocaleChange) {
      onLocaleChange(href);
      return;
    }
    if (authenticated) {
      try {
        const r = await fetch('/api/auth/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: other }),
        });
        if (!r.ok) throw Error();
      } catch {
        setError(
          l(
            'The language preference could not be saved. Please retry.',
            'تعذّر حفظ تفضيل اللغة. حاول مرة أخرى.',
          ),
        );
        return;
      }
    }
    setOpen(false);
    router.push(href);
  }
  const language = (
    <Button asChild variant="ghost" size="icon-lg">
      <Link
        title={l('Switch to Arabic', 'التبديل إلى الإنجليزية')}
        aria-label={l('Switch to Arabic', 'التبديل إلى الإنجليزية')}
        href={localeHref}
        lang={other}
        hrefLang={other}
        aria-disabled={localeDisabled}
        onClick={(e) => {
          void switchLocale(e);
        }}
      >
        <Globe2 />
      </Link>
    </Button>
  );
  const entryHref =
    '/' +
    locale +
    '/' +
    (authenticated ? 'workspace' : 'login') +
    (!authenticated && entryReturnTo
      ? '?returnTo=' + encodeURIComponent(entryReturnTo)
      : '');
  const entry = (
    <Button asChild size="lg">
      <Link href={entryHref}>
        {authenticated
          ? l('My workspace', 'مساحة عملي')
          : l('Sign in', 'تسجيل الدخول')}
        <span aria-hidden="true">↗</span>
      </Link>
    </Button>
  );
  const active = (tail: string) =>
    tail ? path.startsWith('/' + locale + tail) : path === '/' + locale;
  return (
    <>
      <a className="sr-only focus:not-sr-only" href="#main">
        {l('Skip to content', 'تخطَّ إلى المحتوى')}
      </a>
      <header className="ps-header-band">
        <div className="ps-header wrap">
          <Link
            className="ps-brand"
            href={'/' + locale}
            aria-label={l(
              'Capstone Repository - Home',
              'مستودع مشاريع التخرج - الرئيسية',
            )}
          >
            <BrandLogo decorative label="Capstone Repository" />
          </Link>
          <NavigationMenu
            className="ps-desktop-nav"
            aria-label={l('Main navigation', 'التنقل الرئيسي')}
            viewport={false}
          >
            <NavigationMenuList>
              {nav.map(([tail, label]) => (
                <NavigationMenuItem key={tail}>
                  <NavigationMenuLink asChild active={active(tail!)}>
                    <Link
                      href={'/' + locale + tail}
                      aria-current={active(tail!) ? 'page' : undefined}
                    >
                      {label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
          <div className="ps-header-actions">
            {language}
            <PublicAppearance locale={locale} />
            <span className="ps-desktop-entry">{entry}</span>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-lg"
                  className="ps-menu-trigger"
                  aria-label={l('Open menu', 'فتح القائمة')}
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent {...portal} side="right">
                <SheetHeader>
                  <SheetTitle>{l('Menu', 'القائمة')}</SheetTitle>
                </SheetHeader>
                <nav
                  className="flex flex-col gap-3 p-6"
                  aria-label={l('Mobile navigation', 'التنقل على الجوال')}
                >
                  {nav.map(([tail, label]) => (
                    <Button
                      variant={active(tail!) ? 'secondary' : 'ghost'}
                      asChild
                      key={tail}
                    >
                      <Link
                        href={'/' + locale + tail}
                        onClick={() => setOpen(false)}
                        aria-current={active(tail!) ? 'page' : undefined}
                      >
                        {label}
                      </Link>
                    </Button>
                  ))}
                  {entry}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      {error && (
        <Alert variant="destructive" className="wrap my-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {children}
      {includeFooter && (
        <PublicFooter locale={locale} authenticated={authenticated} />
      )}
    </>
  );
}
