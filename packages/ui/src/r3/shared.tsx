'use client';
import { Globe2, Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { BrandLogo } from '../brand-logo.js';
import { applyAppearance, resolveAppearance } from '../theme.js';
import { ProjectCover } from '../visual-media.js';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { PortalContext } from './portal.js';
import { Button } from './primitives/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './primitives/dropdown-menu.js';
import { UiLocale } from './primitives/locale.js';
import {
  rememberPosition,
  preparePosition,
  restorePosition,
} from './return-position.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './primitives/tooltip.js';
export type Locale = 'en' | 'ar';
const Context = createContext({
  locale: 'en' as Locale,
  dark: false,
  setLocale: (_v: Locale) => {
    void _v;
  },
  setDark: (_v: boolean) => {
    void _v;
  },
  homeHref: '/en',
  reference: false,
  workspaceHref: null as string | null,
  inbox: null as { href: string; unread: number | null } | null,
  contextOwner: 'visitor',
  localeError: null as string | null,
});

export const useR3 = () => useContext(Context);
export function useCopy() {
  const { locale } = useR3();
  const raw = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  return {
    raw,
    t: (en: string, ar: string) => (
      <span
        className="copy"
        lang={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        {raw(en, ar)}
      </span>
    ),
  };
}
export function R3Environment({
  children,
  locale: initialLocale = 'en',
  theme = 'light',
  reference = false,
  workspaceHref = null,
  onLocaleChange,
  inbox = null,
  contextOwner = 'visitor',
  localeError = null,
}: {
  children: ReactNode;
  locale?: Locale;
  theme?: 'light' | 'dark';
  reference?: boolean;
  workspaceHref?: string | null;
  onLocaleChange?: (locale: Locale, href: string) => void;
  inbox?: { href: string; unread: number | null } | null;
  contextOwner?: string;
  localeError?: string | null;
}) {
  const [locale, setLocale] = useState(initialLocale),
    [dark, setDark] = useState(theme === 'dark'),
    [portal, setPortal] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (reference) return;
    const update = () => {
      const theme =
        document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      setDark(theme === 'dark');
      document.documentElement.style.colorScheme = theme;
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const storage = (event: StorageEvent) => {
      if (event.key === 'capstone.ui.theme.v1')
        applyAppearance(resolveAppearance(event.newValue));
    };
    window.addEventListener('storage', storage);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', storage);
    };
  }, [reference]);
  useEffect(() => {
    setLocale(initialLocale);
  }, [initialLocale]);
  useEffect(() => {
    if (reference) return;
    const dispose = restorePosition(contextOwner);
    const click = (event: MouseEvent) => {
      if (
        event.button ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element)?.closest('a');
      if (link?.href) {
        rememberPosition(contextOwner);
        preparePosition(contextOwner, link.href);
      }
    };
    document.addEventListener('click', click);
    return () => {
      dispose();
      document.removeEventListener('click', click);
    };
  }, [contextOwner, reference, initialLocale]);
  function changeTheme(v: boolean) {
    setDark(v);
    if (!reference) applyAppearance(v ? 'dark' : 'light');
  }
  function changeLocale(v: Locale) {
    if (reference) setLocale(v);
    else {
      const u = new URL(location.href);
      u.pathname = u.pathname.replace(/^\/(en|ar)(?=\/|$)/, '/' + v);
      if (onLocaleChange) onLocaleChange(v, u.href);
      else location.assign(u);
    }
  }
  return (
    <Context.Provider
      value={{
        locale,
        dark,
        setLocale: changeLocale,
        setDark: changeTheme,
        homeHref: '/' + locale,
        reference,
        workspaceHref,
        inbox,
        contextOwner,
        localeError,
      }}
    >
      <UiLocale.Provider value={locale}>
        <TooltipProvider delayDuration={250}>
          <PortalContext.Provider value={portal}>
            <div
              className="r3"
              lang={locale}
              dir="ltr"
              data-reference={reference ? 'true' : undefined}
              data-lang={locale}
              data-theme={dark ? 'dark' : 'light'}
            >
              <a className="experience-skip" href="#r3-main">
                {locale === 'ar' ? 'تجاوز إلى المحتوى' : 'Skip to content'}
              </a>
              {children}
              <div ref={setPortal} data-r3-portals="" />
            </div>
          </PortalContext.Provider>
        </TooltipProvider>
      </UiLocale.Provider>
    </Context.Provider>
  );
}
export function Tools() {
  const { locale, dark, setDark, setLocale, reference, workspaceHref, inbox } =
    useR3();
  const { raw, t } = useCopy();
  return (
    <div className="tools">
      {inbox && (
        <a
          className="r3-inbox-indicator"
          href={inbox.href}
          aria-label={
            raw('Inbox', 'الوارد') +
            (inbox.unread === null
              ? ' · ' + raw('Count unavailable', 'العدد غير متاح')
              : ' · ' + inbox.unread + ' ' + raw('unread', 'غير مقروء'))
          }
        >
          <span aria-hidden="true">◉</span>
          {inbox.unread !== null && (
            <bdi dir="ltr">{inbox.unread > 999 ? '999+' : inbox.unread}</bdi>
          )}
        </a>
      )}
      <DropdownMenu dir="ltr">
        <DropdownMenuTrigger asChild>
          <Button
            className="ui-button icon-button utility-trigger"
            variant="ghost"
            aria-label={raw('Appearance and language', 'المظهر واللغة')}
          >
            <SlidersHorizontal size={20} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="menu-material" align="end">
          <DropdownMenuItem asChild className="public-compact-entry">
            <a href={'/' + locale + '/catalogue'}>{t('Discover', 'استكشف')}</a>
          </DropdownMenuItem>
          {inbox && (
            <DropdownMenuItem asChild className="public-compact-entry">
              <a
                href={inbox.href}
                aria-label={
                  raw('Inbox', 'الوارد') +
                  (inbox.unread === null
                    ? ' · ' + raw('Count unavailable', 'العدد غير متاح')
                    : ' · ' + inbox.unread + ' ' + raw('unread', 'غير مقروء'))
                }
              >
                {t('Inbox', 'الوارد')}
                {inbox.unread !== null && (
                  <bdi dir="ltr">
                    {inbox.unread > 999 ? '999+' : inbox.unread}
                  </bdi>
                )}
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDark(!dark)}>
            {dark ? <Sun /> : <Moon />}
            {t(
              dark ? 'Light theme' : 'Dark theme',
              dark ? 'المظهر الفاتح' : 'المظهر الداكن',
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setLocale(locale === 'en' ? 'ar' : 'en')}
          >
            <Globe2 />
            {t(
              locale === 'en' ? 'Arabic interface' : 'English interface',
              locale === 'en' ? 'الواجهة العربية' : 'الواجهة الإنجليزية',
            )}
          </DropdownMenuItem>
          {!reference && (
            <DropdownMenuItem asChild>
              <a href={workspaceHref || '/' + locale + '/login'}>
                {t(
                  workspaceHref ? 'My workspace' : 'Sign in',
                  workspaceHref ? 'مساحة عملي' : 'تسجيل الدخول',
                )}
              </a>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  const { homeHref } = useR3();
  const { raw } = useCopy();
  return (
    <a
      className={'brand ' + (compact ? 'compact' : '')}
      href={homeHref}
      aria-label={raw(
        'Capstone Repository home',
        'الصفحة الرئيسية لمستودع المشاريع',
      )}
    >
      <BrandLogo
        compact={compact}
        decorative
        label="Capstone Repository: مستودع مشاريع التخرج"
      />
    </a>
  );
}
export function Tip({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="tooltip-material">{label}</TooltipContent>
    </Tooltip>
  );
}
export function Status({ status }: { status: string }) {
  const { t } = useCopy();
  const labels: Record<string, [string, string]> = {
    active: ['Active', 'نشط'],
    inactive: ['Setup required', 'يتطلب الإعداد'],
    suspended: ['Suspended', 'موقوف'],
    draft: ['Draft', 'مسودة'],
    pending: ['In review', 'قيد المراجعة'],
    revision: ['Revision required', 'مطلوب تعديل'],
    published: ['Published', 'منشور'],
    retained: ['Retained internally', 'محفوظ داخليًا'],
  };
  return (
    <span className={'status status-' + status}>
      <i />
      {t(...(labels[status] || [status, status]))}
    </span>
  );
}
export function Cover({
  projectId,
  versionId,
  className = '',
  eager = false,
}: {
  projectId?: string | undefined;
  versionId?: string | undefined;
  kind?: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <ProjectCover
      projectId={projectId}
      versionId={versionId}
      published
      className={'topic-cover ' + className}
      eager={eager}
    />
  );
}
export function Original({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <bdi dir="auto" className={`original ${className}`}>
      {children}
    </bdi>
  );
}
export function Tech({ children }: { children: ReactNode }) {
  return (
    <bdi dir="ltr" className="technical">
      {children}
    </bdi>
  );
}
