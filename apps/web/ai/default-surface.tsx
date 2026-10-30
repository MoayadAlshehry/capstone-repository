'use client';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Selection } from './context';
import type { AILocale, AIEffort } from './types';
const DefaultConversation = lazy(() =>
  import('./default-runtime').then((m) => ({ default: m.DefaultConversation })),
);
/** Isolate only the floating conversation. The document never moves into a panel. */
export function DefaultSurface({
  children,
  selection,
  locale,
  open,
  mode,
  generation,
  onClose,
}: {
  children: ReactNode;
  selection: Selection | null;
  locale: AILocale;
  open: boolean;
  mode: AIEffort;
  generation: number;
  onClose: () => void;
}) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null),
    [theme, setTheme] = useState('light');
  const bind = useCallback((node: HTMLDivElement | null) => {
    if (node) setShadow(node.shadowRoot ?? node.attachShadow({ mode: 'open' }));
  }, []);
  useEffect(() => {
    const update = () =>
      setTheme(document.documentElement.getAttribute('data-theme') ?? 'light');
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <>
      {children}
      <link rel="stylesheet" href="/assistant-ui-properties.css" />
      {selection && (
        <div ref={bind} data-ai-host data-ai-open={open}>
          {shadow &&
            createPortal(
              <>
                <link rel="stylesheet" href="/assistant-ui-default.css" />
                <Suspense fallback={null}>
                  <DefaultConversation
                    key={
                      generation +
                      ':' +
                      locale +
                      ':' +
                      selection.project?.id +
                      ':' +
                      selection.project?.version
                    }
                    selection={selection}
                    locale={locale}
                    open={open}
                    mode={mode}
                    theme={theme}
                    portal={shadow}
                    onClose={onClose}
                  />
                </Suspense>
              </>,
              shadow,
            )}
        </div>
      )}
    </>
  );
}
