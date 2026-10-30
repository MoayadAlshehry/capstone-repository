'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type {
  AILocale,
  AIProjectRef,
  AISnapshot as Snapshot,
  AIEffort,
} from './types';
import { DefaultSurface } from './default-surface';
import {
  SystemContext,
  useAISystem,
  type Selection,
  type System,
} from './context';
export { useAISystem } from './context';
import { useCallback } from 'react';
export function AIProvider({
  enabled: initial,
  locale,
  children,
}: {
  enabled: boolean;
  locale: AILocale;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(initial),
    [opened, setOpened] = useState(false),
    [selection, setSelection] = useState<Selection | null>(null),
    [mode, setMode] = useState<AIEffort>('balanced'),
    [generation, setGeneration] = useState(0);
  const opener = useRef<HTMLElement | null>(null),
    path = usePathname(),
    router = useRouter(),
    previousLocale = useRef(locale);
  const close = () => {
    setOpened(false);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected)
        opener.current.focus({ preventScroll: true });
    });
  };
  useEffect(() => setEnabled(initial), [initial]);
  useEffect(() => {
    try {
      const value = localStorage.getItem('capstone-ai-reasoning');
      if (value === 'quick' || value === 'balanced' || value === 'deep')
        setMode(value);
    } catch {}
  }, []);
  const changeMode = (value: AIEffort) => {
    setMode(value);
    try {
      localStorage.setItem('capstone-ai-reasoning', value);
    } catch {}
  };
  useEffect(() => {
    if (previousLocale.current !== locale) {
      setOpened(false);
      setSelection(null);
      previousLocale.current = locale;
    }
    if (selection?.project && !path.endsWith('/' + selection.project.id)) {
      setOpened(false);
      setSelection(null);
    }
    try {
      const raw = sessionStorage.getItem('capstone-official-ai-intent');
      if (!raw) return;
      const value = JSON.parse(raw) as Selection & { locale: AILocale };
      if (
        value.locale === locale &&
        value.project &&
        path.endsWith('/' + value.project.id)
      ) {
        sessionStorage.removeItem('capstone-official-ai-intent');
        setSelection(value);
        setOpened(true);
      }
    } catch {}
  }, [path, locale]);
  useEffect(() => {
    const off = () => {
      setEnabled(false);
      setOpened(false);
      setSelection(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        close();
      }
    };
    addEventListener('capstone-ai-disabled', off);
    const invalidate = () => {
      setOpened(false);
      setSelection(null);
      setGeneration((x) => x + 1);
    };
    addEventListener('capstone-ai-context-changed', invalidate);
    if (opened) addEventListener('keydown', escape);
    return () => {
      removeEventListener('capstone-ai-disabled', off);
      removeEventListener('capstone-ai-context-changed', invalidate);
      removeEventListener('keydown', escape);
    };
  }, [opened]);
  useEffect(() => {
    if (!opened || !enabled) return;
    const controller = new AbortController();
    let context: string | undefined;
    const check = async () => {
      try {
        const response = await fetch('/api/ai?status=1', {
            cache: 'no-store',
            signal: controller.signal,
          }),
          value = (await response.json()) as {
            code?: string;
            context?: string;
          };
        if (controller.signal.aborted) return;
        if (value.code === 'DISABLED') {
          setEnabled(false);
          setOpened(false);
          setSelection(null);
        }
        if (
          value.code === 'SOURCE_CHANGED' ||
          (context && value.context && context !== value.context)
        ) {
          setOpened(false);
          setSelection(null);
          setGeneration((x) => x + 1);
        }
        context = value.context ?? context;
      } catch {}
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [opened, enabled]);
  const open: System['open'] = (kind, project, query, cached) => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const value: Selection = {
      kind,
      ...(project ? { project } : {}),
      ...(query ? { query } : {}),
      ...(cached ? { cached } : {}),
      serial: Date.now(),
    };
    if (project && path !== '/' + locale + '/catalogue/' + project.id) {
      try {
        sessionStorage.setItem(
          'capstone-official-ai-intent',
          JSON.stringify({ ...value, locale }),
        );
      } catch {}
      router.push('/' + locale + '/catalogue/' + project.id);
      return;
    }
    setSelection(value);
    setOpened(true);
  };
  const registerProject = useCallback((project: AIProjectRef) => {
    setSelection((previous) =>
      previous?.project?.id === project.id &&
      previous.project.version === project.version
        ? previous
        : { kind: 'ask', project, serial: 0 },
    );
  }, []);
  const publicRoute = /^\/(en|ar)(\/catalogue(?:\/|$)|\/?$)/.test(path);
  return (
    <SystemContext.Provider
      value={{
        enabled,
        locale,
        mode,
        setMode: changeMode,
        open,
        close,
        isOpen: opened,
        registerProject,
      }}
    >
      {enabled && publicRoute ? (
        <DefaultSurface
          selection={selection}
          locale={locale}
          open={opened}
          mode={mode}
          generation={generation}
          onClose={close}
        >
          {children}
        </DefaultSurface>
      ) : (
        children
      )}
    </SystemContext.Provider>
  );
}
export function AITrigger({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <button type="button" className="secondary" onClick={onClick}>
      {children}
    </button>
  );
}
export function AIProjectActions({ project }: { project: AIProjectRef }) {
  const ai = useAISystem();
  if (!ai.enabled) return null;
  return (
    <div>
      <AITrigger
        onClick={() => (ai.isOpen ? ai.close() : ai.open('ask', project))}
      >
        {ai.locale === 'ar'
          ? ai.isOpen
            ? 'إغلاق المساعد'
            : 'اسأل المساعد'
          : ai.isOpen
            ? 'Close assistant'
            : 'Ask AI'}
      </AITrigger>{' '}
      <label>
        <span className="ds-sr-only">
          {ai.locale === 'ar' ? 'نمط التفكير' : 'Reasoning mode'}
        </span>
        <select
          aria-label={ai.locale === 'ar' ? 'نمط التفكير' : 'Reasoning mode'}
          value={ai.mode}
          onChange={(e) => ai.setMode(e.target.value as AIEffort)}
        >
          <option value="quick">{ai.locale === 'ar' ? 'سريع' : 'Quick'}</option>
          <option value="balanced">
            {ai.locale === 'ar' ? 'متوازن' : 'Balanced'}
          </option>
          <option value="deep">{ai.locale === 'ar' ? 'عميق' : 'Deep'}</option>
        </select>
      </label>
    </div>
  );
}
export function AIDiscoveryButton({ query = '' }: { query?: string }) {
  const ai = useAISystem();
  return ai.enabled ? (
    <AITrigger
      onClick={() =>
        ai.isOpen ? ai.close() : ai.open('discover', undefined, query)
      }
    >
      {ai.locale === 'ar' ? 'بحث ذكي' : 'AI Search'}
    </AITrigger>
  ) : null;
}
export function AISnapshot({
  project,
  compact = false,
  detail = false,
}: {
  project: AIProjectRef & { version: string; abstract: string };
  compact?: boolean;
  detail?: boolean;
}) {
  const ai = useAISystem(),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [identity, setIdentity] = useState(''),
    element = useRef<HTMLElement | null>(null),
    key = project.id + ':' + project.version + ':' + ai.locale;
  useEffect(() => {
    if (!ai.enabled) return;
    setSnapshot(null);
    setIdentity(key);
    const controller = new AbortController();
    let requested = false;
    const load = () => {
      if (requested || controller.signal.aborted) return;
      requested = true;
      void fetch(
        '/api/ai?' +
          new URLSearchParams({
            project: project.id,
            version: project.version,
            locale: ai.locale,
          }),
        { cache: 'no-store', signal: controller.signal },
      )
        .then(async (response) => {
          if (response.ok) {
            const value = (await response.json()) as {
              snapshot: Snapshot | null;
            };
            if (!controller.signal.aborted) setSnapshot(value.snapshot);
          }
        })
        .catch(() => undefined);
    };
    const observer =
      element.current && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                observer?.disconnect();
                load();
              }
            },
            { rootMargin: '240px 0px' },
          )
        : null;
    if (observer && element.current) observer.observe(element.current);
    else load();
    return () => {
      controller.abort();
      observer?.disconnect();
    };
  }, [key, ai.enabled]);
  if (!ai.enabled) return detail ? null : <p dir="auto">{project.abstract}</p>;
  const saved = identity === key ? snapshot : null;
  return (
    <>
      <AITrigger
        onClick={() =>
          ai.open('summary', project, undefined, saved ?? undefined)
        }
      >
        {ai.locale === 'ar' ? 'ملخص ذكي' : 'AI Brief'}
      </AITrigger>
      <p
        ref={(node) => {
          element.current = node;
        }}
        data-ai-cache={saved ? 'hit' : 'miss'}
        dir={saved ? (ai.locale === 'ar' ? 'rtl' : 'ltr') : 'auto'}
      >
        {saved?.summary ?? project.abstract}
      </p>
      {saved && (
        <small>
          {ai.locale === 'ar'
            ? 'ملخص مولّد بالذكاء الاصطناعي'
            : 'AI-generated summary'}
        </small>
      )}
      {!compact && (
        <a
          href={
            '/' + ai.locale + '/catalogue/' + project.id + '#original-abstract'
          }
        >
          {ai.locale === 'ar' ? 'قراءة الملخص الأصلي' : 'Read abstract'}
        </a>
      )}
    </>
  );
}
