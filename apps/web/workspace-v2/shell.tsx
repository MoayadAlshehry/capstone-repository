'use client';
import { BrandLogo } from '@capstone/ui/brand-logo';
import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Separator,
  Building2,
  FolderKanban,
  UsersRound,
  Archive,
  Bell,
  BookOpen,
  ShieldCheck,
  LayoutDashboard,
  Clock3,
  Settings,
  Globe2,
  LogOut,
  ChevronDown,
  ChevronsUpDown,
} from '@capstone/ui/workspace-v2';
import {
  navigation,
  landing,
  text,
  type WorkspaceIdentity,
  type Locale,
} from './navigation';
import {
  navigationIcon,
  activeDestination,
  roleLabel,
  contextLabel,
  breadcrumbLabel,
} from './studio-model';
import {
  useBackPrivacyGuard,
  hidePrivateSurfaces,
} from '../auth/client-privacy';
import {
  resolveNavigationContext,
  originNavigation,
  personalHref,
  localeDestination,
  inboxHref,
  type NavigationContext,
} from './navigation-context';
import { guardedNavigation } from '../assessment-studio/exit-guard';
import { PersonAvatar, visualInitials } from '@capstone/ui/visual-media';
import { AppearanceSelect, AppearanceOptions } from '../shared-appearance';
import {
  NavigationValidation,
  useNavigationValidation,
} from './navigation-context-client';
const studioIcons = {
  Building2,
  FolderKanban,
  UsersRound,
  Archive,
  Bell,
  BookOpen,
  ShieldCheck,
  LayoutDashboard,
  Clock3,
  Settings,
  Globe2,
};
function StudioIcon({ path }: { path: string }) {
  const Icon = studioIcons[navigationIcon(path)];
  return <Icon aria-hidden="true" />;
}
function Navigation({
  identity,
  locale,
  independent,
  intent,
}: {
  identity: WorkspaceIdentity;
  locale: Locale;
  independent: boolean;
  intent: NavigationContext;
}) {
  const pathname = usePathname().replace(/^\/(en|ar)/, ''),
    search = useSearchParams(),
    { setOpenMobile } = useSidebar();
  const active =
    independent &&
    (pathname === '/reviewer/history' ||
      (pathname === '/reviewer' && search.get('tab') === 'history'))
      ? '/reviewer?tab=history'
      : activeDestination(identity, pathname, independent);
  return (
    <SidebarMenu>
      {(intent.context === 'personal'
        ? [
            { path: '/account', label: ['Your account', 'حسابك'] as const },
            { path: '/notifications', label: ['Inbox', 'الوارد'] as const },
          ]
        : navigation(identity, independent)
      ).map((n) => (
        <SidebarMenuItem key={n.path}>
          <SidebarMenuButton
            asChild
            isActive={active === n.path}
            className="wv-nav"
            tooltip={{
              children: text(n.label, locale),
              className: 'wsv2 wv-tooltip',
              dir: locale === 'ar' ? 'rtl' : 'ltr',
            }}
          >
            <Link
              href={
                n.path === '/account'
                  ? personalHref(locale, 'account', intent)
                  : n.path === '/notifications'
                    ? inboxHref(identity, locale, intent)
                    : '/' + locale + n.path
              }
              aria-label={text(n.label, locale)}
              aria-current={active === n.path ? 'page' : undefined}
              onClick={() => setOpenMobile(false)}
            >
              <StudioIcon path={n.path} />
              <span dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                {text(n.label, locale)}
              </span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
function UserMenu({
  identity,
  locale,
  independent,
  accountHref,
  busy,
  language,
  signOut,
  footer = false,
}: {
  identity: WorkspaceIdentity;
  locale: Locale;
  independent: boolean;
  accountHref: string;
  busy: boolean;
  language: () => Promise<void>;
  signOut: () => Promise<void>;
  footer?: boolean;
}) {
  const { setOpenMobile } = useSidebar(),
    pathname = usePathname(),
    [open, setOpen] = useState(false),
    t = (en: string, ar: string) => (locale === 'ar' ? ar : en),
    dir = locale === 'ar' ? 'rtl' : 'ltr';
  useEffect(() => setOpen(false), [pathname]);
  const avatar = (
    <PersonAvatar
      name={identity.name}
      userId={identity.id}
      size="sm"
      className="wv-avatar"
    />
  );
  return (
    <DropdownMenu dir="ltr" open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {footer ? (
          <button className="wv-user-trigger">
            <span aria-hidden="true" style={{ display: 'contents' }}>
              {avatar}
            </span>
            <span className="wv-user-copy">
              <bdi className="wv-user-name">{identity.name}</bdi>
              <span className="wv-user-role" dir={dir}>
                {text(roleLabel(identity.role, independent), locale)}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" />
          </button>
        ) : (
          <Button
            variant="ghost"
            className="wv-header-avatar"
            aria-label={
              visualInitials(identity.name) +
              ' · ' +
              t('Account menu', 'قائمة الحساب')
            }
          >
            <span aria-hidden="true" style={{ display: 'contents' }}>
              {avatar}
            </span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="wsv2 wv-menu"
        align="end"
        side={footer ? 'top' : 'bottom'}
        sideOffset={8}
      >
        <DropdownMenuLabel className="wv-menu-identity">
          <strong dir="auto">{identity.name}</strong>
          <small dir="ltr">{identity.email}</small>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href={accountHref}
            onClick={() => {
              setOpen(false);
              setOpenMobile(false);
            }}
          >
            <Settings aria-hidden="true" />
            <span dir={dir}>{t('Your account', 'حسابك')}</span>
          </Link>
        </DropdownMenuItem>
        {identity.role === 'faculty_supervisor' && identity.reviewerCapable && (
          <DropdownMenuItem asChild>
            <Link
              href={'/' + locale + (independent ? '/supervision' : '/reviewer')}
              onClick={() => {
                setOpen(false);
                setOpenMobile(false);
              }}
            >
              <BookOpen aria-hidden="true" />
              <span dir={dir}>
                {independent
                  ? t('Switch to supervision', 'الانتقال إلى الإشراف')
                  : t(
                      'Switch to independent review',
                      'الانتقال إلى التقييم المستقل',
                    )}
              </span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            void language();
          }}
        >
          <Globe2 aria-hidden="true" />
          <span dir={dir}>{locale === 'en' ? 'العربية' : 'English'}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            void signOut();
          }}
        >
          <LogOut aria-hidden="true" />
          <span dir={dir}>
            {t(
              busy ? 'Working…' : 'Sign out',
              busy ? 'جارٍ التنفيذ…' : 'تسجيل الخروج',
            )}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function ShellContent({
  identity: initialIdentity,
  locale,
  children,
  error,
  busy,
  language,
  signOut,
}: {
  identity: WorkspaceIdentity;
  locale: Locale;
  children: ReactNode;
  error: string;
  busy: boolean;
  language: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const validation = useNavigationValidation(),
    urlPath = usePathname(),
    urlQuery = useSearchParams(),
    key = urlPath + (urlQuery.size ? '?' + urlQuery.toString() : ''),
    validNavigation =
      validation?.actor === initialIdentity.id && validation.key === key
        ? validation
        : null,
    identity = validNavigation
      ? { ...initialIdentity, reviewerCapable: validNavigation.reviewer }
      : initialIdentity;
  const pathname = usePathname(),
    query = useSearchParams(),
    path = pathname.replace(/^\/(en|ar)/, ''),
    intent =
      validNavigation?.intent ??
      (path.startsWith('/account')
        ? resolveNavigationContext(identity, locale, {
            context: query.get('context') ?? undefined,
            returnTo: query.get('returnTo') ?? undefined,
          })
        : originNavigation(
            identity,
            locale,
            pathname + (query.size ? '?' + query.toString() : ''),
          )),
    independent = intent.context === 'independent',
    dir = locale === 'ar' ? 'rtl' : 'ltr',
    t = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const context =
      intent.context === 'personal'
        ? t('Personal account', 'الحساب الفردي')
        : text(contextLabel(identity.role, independent), locale),
    current = text(breadcrumbLabel(path), locale);
  const { setOpenMobile, state: navigationState } = useSidebar();
  const [contextOpen, setContextOpen] = useState(false);
  useEffect(() => setContextOpen(false), [pathname]);
  const menuProps = {
    identity,
    locale,
    independent,
    busy,
    language,
    signOut,
    accountHref: personalHref(locale, 'account', intent),
  };
  return (
    <>
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-card focus:p-3"
      >
        {t('Skip to content', 'انتقل إلى المحتوى')}
      </a>
      <Sidebar
        side="left"
        collapsible="icon"
        closeLabel={t('Close navigation', 'إغلاق التنقل')}
        navigationLabel={t('Navigation', 'التنقل')}
        navigationDescription={t(
          'Workspace navigation',
          'التنقل في مساحة العمل',
        )}
      >
        <SidebarHeader className="wv-side-header">
          <Link
            className="wv-brand"
            href={'/' + locale}
            aria-label={
              'Capstone Repository: مستودع مشاريع التخرج — ' +
              t('Home', 'الرئيسية')
            }
          >
            <BrandLogo
              decorative
              label="Capstone Repository: مستودع مشاريع التخرج"
            />
          </Link>
          <div className="wv-context">
            {identity.role === 'faculty_supervisor' &&
            identity.reviewerCapable ? (
              <DropdownMenu
                dir="ltr"
                open={contextOpen}
                onOpenChange={setContextOpen}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    className="wv-context-title wv-context-switch"
                    aria-label={
                      context +
                      ' · ' +
                      t('Switch workspace context', 'تبديل سياق مساحة العمل')
                    }
                  >
                    <BookOpen aria-hidden="true" />
                    <span dir={dir}>{context}</span>
                    <ChevronDown className="ml-auto" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="wsv2 wv-menu" align="start">
                  <DropdownMenuItem asChild>
                    <Link
                      href={'/' + locale + '/supervision'}
                      onClick={() => {
                        setContextOpen(false);
                        setOpenMobile(false);
                      }}
                    >
                      {t('Supervision', 'الإشراف')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={'/' + locale + '/reviewer'}
                      onClick={() => {
                        setContextOpen(false);
                        setOpenMobile(false);
                      }}
                    >
                      {t('Independent review', 'التقييم المستقل')}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="wv-context-title">
                <StudioIcon path={landing[identity.role] ?? '/account'} />
                <span dir={dir}>{context}</span>
              </div>
            )}
            <div
              className="wv-context-name"
              dir={identity.universityEn ? 'auto' : dir}
            >
              {(locale === 'ar'
                ? identity.universityAr
                : identity.universityEn) ||
                t(
                  identity.role === 'platform_admin'
                    ? 'Across connected universities'
                    : 'Your personal workspace',
                  identity.role === 'platform_admin'
                    ? 'عبر الجامعات المرتبطة'
                    : 'مساحة عملك الشخصية',
                )}
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="wv-nav-group">
            <SidebarGroupLabel className="wv-nav-label">
              {t('Workspace', 'مساحة العمل')}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <Navigation
                identity={identity}
                locale={locale}
                independent={independent}
                intent={intent}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="wv-side-footer">
          <UserMenu {...menuProps} footer />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background min-w-0">
        <header
          className="wv-topbar"
          data-testid="workspace-header"
          data-navigation={navigationState}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger className="wv-toggle">
                {t('Toggle navigation', 'تبديل التنقل')}
              </SidebarTrigger>
            </TooltipTrigger>
            <TooltipContent className="wsv2 wv-tooltip">
              {t('Toggle navigation', 'تبديل التنقل')}
            </TooltipContent>
          </Tooltip>
          <Link
            className="wv-header-brand"
            href={'/' + locale}
            aria-label={
              'Capstone Repository: مستودع مشاريع التخرج — ' +
              t('Home', 'الرئيسية')
            }
          >
            <BrandLogo
              compact
              decorative
              label="Capstone Repository: مستودع مشاريع التخرج"
            />
          </Link>
          <Separator orientation="vertical" className="wv-top-divider" />
          <Breadcrumb className="wv-breadcrumb">
            <BreadcrumbList>
              <BreadcrumbItem className="wv-breadcrumb-parent">
                <BreadcrumbLink asChild>
                  <Link
                    href={
                      intent.context === 'personal'
                        ? personalHref(locale, 'account', intent)
                        : '/' +
                          locale +
                          (independent ? '/reviewer' : landing[identity.role])
                    }
                  >
                    <span dir={dir}>{context}</span>
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="wv-breadcrumb-separator" />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  <span dir={dir}>{current}</span>
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="wv-utilities">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  className="wv-icon-button wv-inbox-utility wv-desktop-utility"
                >
                  <Link
                    href={inboxHref(identity, locale, intent)}
                    aria-label={t('Open Inbox', 'فتح الوارد')}
                  >
                    <Bell aria-hidden="true" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="wsv2 wv-tooltip">
                {t('Inbox', 'الوارد')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  pending={busy}
                  variant="ghost"
                  className="wv-icon-button wv-desktop-utility"
                  disabled={busy}
                  onClick={() => {
                    void language();
                  }}
                  aria-label={t('Switch to Arabic', 'التبديل إلى الإنجليزية')}
                >
                  <Globe2 aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="wsv2 wv-tooltip">
                {locale === 'en' ? 'العربية' : 'English'}
              </TooltipContent>
            </Tooltip>
            <AppearanceSelect
              locale={locale}
              className="wv-icon-button wv-desktop-utility"
            />
            <DropdownMenu dir="ltr">
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="wv-icon-button wv-compact-tools"
                  aria-label={t('Appearance and language', 'المظهر واللغة')}
                >
                  <Settings aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="wsv2 wv-menu appearance-menu"
                align="end"
              >
                <DropdownMenuItem asChild>
                  <Link href={inboxHref(identity, locale, intent)}>
                    <Bell aria-hidden="true" />
                    <span dir={dir}>{t('Inbox', 'الوارد')}</span>
                  </Link>
                </DropdownMenuItem>
                <AppearanceOptions locale={locale} />
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => {
                    void language();
                  }}
                >
                  <Globe2 aria-hidden="true" />
                  <span dir={dir}>
                    {locale === 'en' ? 'العربية' : 'English'}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <UserMenu {...menuProps} />
          </div>
        </header>
        {error && (
          <p role="alert" className="wv-error" dir={dir}>
            {error}
          </p>
        )}
        <main id="workspace-main" tabIndex={-1} className="wv-content">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
export function WorkspaceShell({
  identity,
  locale,
  children,
  initialOpen = true,
}: {
  identity: WorkspaceIdentity;
  locale: Locale;
  children: ReactNode;
  initialOpen?: boolean;
}) {
  const pathname = usePathname(),
    router = useRouter(),
    search = useSearchParams();
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [valid, setValid] = useState(true),
    [sessionError, setSessionError] = useState(false),
    [sessionRetry, setSessionRetry] = useState(0);
  useBackPrivacyGuard(true);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    async function check() {
      const current = ++generation;
      try {
        const r = await fetch('/api/auth/get-session', { cache: 'no-store' });
        if (!alive || current !== generation) return;
        if ([401, 403].includes(r.status)) {
          hidePrivateSurfaces();
          setValid(false);
          setSessionError(false);
          return;
        }
        if (!r.ok && ![401, 403].includes(r.status))
          throw Error('SESSION_READ_UNAVAILABLE');
        const data = await r.json();
        if (!alive || current !== generation) return;
        if (
          !r.ok ||
          !data?.user ||
          data.user.id !== identity.id ||
          data.user.status !== 'active' ||
          data.user.role !== identity.role
        ) {
          hidePrivateSurfaces();
          setValid(false);
          setSessionError(false);
          return;
        }
        setSessionError(false);
        setValid(true);
        router.refresh();
      } catch {
        if (alive && current === generation) setSessionError(true);
      }
    }
    if (sessionRetry > 0) void check();
    const focus = () => {
      void check();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, 60000);
    window.addEventListener('focus', focus);
    const visibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [identity.id, identity.role, router, sessionRetry]);
  async function signOut() {
    guardedNavigation('/' + locale + '/login', async () => {
      setBusy(true);
      setError('');
      try {
        const r = await fetch('/api/auth/sign-out', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!r.ok) throw Error();
        hidePrivateSurfaces();
        location.replace('/' + locale + '/login');
      } catch {
        setBusy(false);
        setError(
          t(
            'Sign-out was not confirmed. Try again.',
            'لم يتأكد تسجيل الخروج. حاول مجددًا.',
          ),
        );
      }
    });
  }
  async function language() {
    const target = localeDestination(
      pathname + (search.size ? '?' + search.toString() : ''),
      locale === 'en' ? 'ar' : 'en',
    );
    guardedNavigation(target, async () => {
      setBusy(true);
      setError('');
      const next = locale === 'en' ? 'ar' : 'en';
      try {
        const r = await fetch('/api/auth/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
        if (!r.ok) throw Error();
        router.push(
          localeDestination(
            pathname + (search.size ? '?' + search.toString() : ''),
            next,
          ),
        );
      } catch {
        setError(
          t(
            'Language was not saved. Try again.',
            'لم تُحفظ اللغة. حاول مجددًا.',
          ),
        );
      } finally {
        setBusy(false);
      }
    });
  }

  if (!valid)
    return (
      <main
        id="workspace-main"
        tabIndex={-1}
        className="wsv2 min-h-svh p-8"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <h1 dir="auto">{t('Sign in to continue', 'سجّل الدخول للمتابعة')}</h1>
        <p dir="auto">
          {t('Sign in again to continue.', 'سجّل الدخول مجددًا للمتابعة.')}
        </p>
        <a href={'/' + locale + '/login'}>{t('Sign in', 'تسجيل الدخول')}</a>
      </main>
    );
  return (
    <NavigationValidation>
      <SidebarProvider
        defaultOpen={initialOpen}
        className="wsv2"
        dir="ltr"
        lang={locale}
        data-locale={locale}
        data-private-surface
        style={
          {
            '--sidebar-width': '248px',
            '--sidebar-width-icon': '72px',
          } as CSSProperties
        }
      >
        <ShellContent
          identity={identity}
          locale={locale}
          error={error}
          busy={busy}
          language={language}
          signOut={signOut}
        >
          {sessionError && (
            <div
              role="alert"
              className="wv-error"
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
            >
              <p dir="auto">
                {t(
                  'Your session could not be checked. Work on this page is kept. Retry before continuing.',
                  'تعذر التحقق من جلستك. بقي عملك في هذه الصفحة. أعد المحاولة قبل المتابعة.',
                )}
              </p>
              <Button
                variant="outline"
                onClick={() => setSessionRetry((value) => value + 1)}
              >
                {t('Retry session check', 'إعادة التحقق من الجلسة')}
              </Button>
            </div>
          )}
          {children}
        </ShellContent>
      </SidebarProvider>
    </NavigationValidation>
  );
}
