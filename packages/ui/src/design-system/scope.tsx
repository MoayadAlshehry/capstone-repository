'use client';
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { BidiProvider } from '../bidi.js';
import { Slot } from 'radix-ui';
export type DesignScopeValue = {
  theme: 'light' | 'dark';
  context: 'public' | 'workspace';
  locale: 'en' | 'ar';
};
const Scope = createContext<
  DesignScopeValue & { root: RefObject<HTMLDivElement | null> }
>({ theme: 'light', context: 'public', locale: 'en', root: { current: null } });
export function useDesignScope() {
  return useContext(Scope);
}
export function scopeAttributes(scope: DesignScopeValue) {
  return {
    'data-cr-ds': '',
    'data-theme': scope.theme,
    'data-context': scope.context,
    lang: scope.locale,
    dir: 'ltr' as const,
  };
}
export function DesignScope({
  theme = 'light',
  context = 'public',
  locale = 'en',
  className = '',
  children,
  asChild = false,
  ...props
}: Partial<DesignScopeValue> &
  Omit<ComponentProps<'div'>, 'dir' | 'lang' | 'context'> & {
    asChild?: boolean;
  }) {
  const root = useRef<HTMLDivElement>(null),
    value = useMemo(
      () => ({ theme, context, locale, root }),
      [theme, context, locale],
    );
  const Component = asChild ? Slot.Root : 'div';
  return (
    <BidiProvider locale={locale}>
      <Scope.Provider value={value}>
        <Component
          {...props}
          {...scopeAttributes(value)}
          ref={root}
          className={[
            context === 'public' ? 'family f02' : 'wsv2',
            locale === 'ar' ? 'arabic' : '',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {children}
        </Component>
      </Scope.Provider>
    </BidiProvider>
  );
}
/** Explicit portal owner: no document-wide theme mutation or focus behavior replacement. */
export function ScopedPortal({ children }: { children: ReactNode }) {
  const scope = useDesignScope();
  return typeof document === 'undefined'
    ? null
    : createPortal(
        <Scope.Provider value={scope}>
          <div
            {...scopeAttributes(scope)}
            className={
              (scope.context === 'public' ? 'family f02' : 'wsv2') +
              ' ds-portal-owner'
            }
          >
            {children}
          </div>
        </Scope.Provider>,
        document.body,
      );
}
