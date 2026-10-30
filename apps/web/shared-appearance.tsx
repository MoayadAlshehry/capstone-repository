'use client';
import { useSyncExternalStore } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  Check,
  Globe2,
} from '@capstone/ui/workspace-v2';
import {
  applyAppearance,
  resolveAppearance,
  resolveTheme,
  themeStorageKey,
  type AppearancePreference,
  type Theme,
} from '@capstone/ui/theme';
function subscribe(notify: () => void) {
  const root = document.documentElement,
    observer = new MutationObserver(notify);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-appearance'],
  });
  const storage = (event: StorageEvent) => {
    if (event.key === themeStorageKey || event.key === null)
      applyAppearance(resolveAppearance(event.newValue));
  };
  addEventListener('storage', storage);
  return () => {
    observer.disconnect();
    removeEventListener('storage', storage);
  };
}
/** Observe the existing application root; these hooks own no independent preference. */
export function useSharedAppearance() {
  return useSyncExternalStore(
    subscribe,
    () => resolveTheme(document.documentElement.dataset.theme),
    () => 'light' as Theme,
  );
}
export function useAppearancePreference() {
  return useSyncExternalStore(
    subscribe,
    () => resolveAppearance(document.documentElement.dataset.appearance),
    () => 'light' as AppearancePreference,
  );
}
export const chooseAppearance = applyAppearance;
export function AppearanceSelect({
  locale,
  className = 'shared-appearance-select',
}: {
  locale: 'en' | 'ar';
  className?: string;
}) {
  const l = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  return (
    <DropdownMenu dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={'appearance-control ' + className}
          aria-label={l('Appearance', 'المظهر')}
          title={l('Appearance', 'المظهر')}
        >
          <Sun className="appearance-sun" aria-hidden="true" />
          <Moon className="appearance-moon" aria-hidden="true" />
          <Monitor className="appearance-system" aria-hidden="true" />
          <ChevronDown className="appearance-chevron" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="appearance-menu"
        align={locale === 'ar' ? 'start' : 'end'}
        sideOffset={10}
        collisionPadding={12}
      >
        <AppearanceOptions locale={locale} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function AppearanceOptions({ locale }: { locale: 'en' | 'ar' }) {
  const preference = useAppearancePreference(),
    l = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  return (
    <>
      <DropdownMenuLabel className="appearance-heading">
        {l('Appearance', 'المظهر')}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        className="appearance-options"
        value={preference}
        onValueChange={(value) => chooseAppearance(resolveAppearance(value))}
      >
        {(['light', 'dark', 'system'] as const).map((value, i) => (
          <DropdownMenuRadioItem
            key={value}
            value={value}
            className="appearance-choice"
          >
            {value === 'light' ? (
              <Sun aria-hidden="true" />
            ) : value === 'dark' ? (
              <Moon aria-hidden="true" />
            ) : (
              <Monitor aria-hidden="true" />
            )}
            <span className="appearance-choice-label">
              {
                [l('Light', 'فاتح'), l('Dark', 'داكن'), l('System', 'النظام')][
                  i
                ]
              }
            </span>
            <Check className="appearance-choice-check" aria-hidden="true" />
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
export function LanguageIcon() {
  return <Globe2 aria-hidden="true" />;
}
