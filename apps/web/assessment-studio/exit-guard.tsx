'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button, DecisionConfirmation } from '@capstone/ui/workspace-v2';
import type { Locale } from '../workspace-v2/navigation';
import {
  workspaceHistoryEvent,
  type WorkspaceHistoryIntent,
} from './history-guard';
export function guardedNavigation(
  destination: string,
  commit: () => void | Promise<void>,
) {
  const event = new CustomEvent('workspace-navigation-intent', {
    cancelable: true,
    detail: { destination, commit },
  });
  window.dispatchEvent(event);
  if (!event.defaultPrevented) void commit();
}
export function useAssessmentExit(
  dirty: boolean,
  locale: Locale,
  discard: () => void,
  options: {
    preserveLocaleSwitch?: boolean;
    canDiscard?: boolean;
    stayLabel?: string;
    description?: string;
    allowDestination?: (destination: string) => boolean;
  } = {},
) {
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams().toString(),
    [target, setTarget] = useState<string | null>(null),
    commit = useRef<(() => void | Promise<void>) | null>(null),
    discardRef = useRef(discard);
  discardRef.current = discard;
  useLayoutEffect(() => {
    if (!dirty) {
      setTarget(null);
      commit.current = null;
      return;
    }
    const request = (
      destination: string,
      action: () => void | Promise<void>,
    ) => {
      commit.current = action;
      setTarget(destination);
    };
    const links = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest('a');
      if (
        !dirty ||
        !a ||
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0 ||
        a.hasAttribute('download') ||
        a.target === '_blank'
      )
        return;
      const u = new URL(a.href);
      if (
        u.origin !== location.origin ||
        options.allowDestination?.(u.pathname + u.search + u.hash) ||
        (u.pathname === location.pathname && u.search === location.search) ||
        (options.preserveLocaleSwitch &&
          u.pathname.split('/')[1] !== location.pathname.split('/')[1] &&
          u.pathname.replace(/^\/(en|ar)/, '') ===
            location.pathname.replace(/^\/(en|ar)/, ''))
      )
        return;
      e.preventDefault();
      request(u.pathname + u.search + u.hash, () =>
        router.push(u.pathname + u.search + u.hash),
      );
    };
    const intents = (e: Event) => {
      if (!dirty) return;
      const event = e as CustomEvent<{
        destination: string;
        commit: () => void | Promise<void>;
      }>;
      const u = new URL(event.detail.destination, location.origin);
      if (
        options.allowDestination?.(u.pathname + u.search + u.hash) ||
        (options.preserveLocaleSwitch &&
          u.pathname.split('/')[1] !== location.pathname.split('/')[1] &&
          u.pathname.replace(/^\/(en|ar)/, '') ===
            location.pathname.replace(/^\/(en|ar)/, ''))
      )
        return;
      event.preventDefault();
      request(event.detail.destination, event.detail.commit);
    };
    const origin = pathname + (search ? '?' + search : '') + location.hash;
    const back = (e: Event) => {
      if (!dirty) return;
      const intent = e as CustomEvent<WorkspaceHistoryIntent>;
      const destination = intent.detail.destination;
      if (destination === origin || options.allowDestination?.(destination))
        return;
      intent.preventDefault();
      request(destination, intent.detail.resume);
    };
    document.addEventListener('click', links, true);
    window.addEventListener('workspace-navigation-intent', intents);
    window.addEventListener(workspaceHistoryEvent, back);
    return () => {
      document.removeEventListener('click', links, true);
      window.removeEventListener('workspace-navigation-intent', intents);
      window.removeEventListener(workspaceHistoryEvent, back);
    };
  }, [
    dirty,
    router,
    options.preserveLocaleSwitch,
    options.allowDestination,
    pathname,
    search,
  ]);
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  return (
    <DecisionConfirmation
      open={target !== null}
      onOpenChange={(v) => {
        if (!v) {
          setTarget(null);
          commit.current = null;
        }
      }}
      title={t(
        options.canDiscard === false
          ? 'Check the original request first'
          : 'Leave with unsaved changes?',
        options.canDiscard === false
          ? 'تحقق من الطلب الأصلي أولًا'
          : 'هل تريد المغادرة مع تعديلات غير محفوظة؟',
      )}
      description={
        options.description ??
        t(
          options.canDiscard === false
            ? 'Stay to check the result of your original request before leaving or sending another.'
            : 'Keep your unsent input here, or discard it before continuing.',
          options.canDiscard === false
            ? 'ابقَ للتحقق من نتيجة الطلب الأصلي قبل المغادرة أو إرسال طلب آخر.'
            : 'احتفظ بإدخالك غير المرسل هنا، أو تجاهله قبل المتابعة.',
        )
      }
    >
      <Button
        variant="outline"
        onClick={() => {
          setTarget(null);
          commit.current = null;
        }}
      >
        {options.stayLabel ??
          (options.canDiscard === false
            ? t('Stay and check', 'البقاء والتحقق')
            : t('Keep editing', 'متابعة التحرير'))}
      </Button>
      {options.canDiscard !== false && (
        <Button
          onClick={() => {
            const action = commit.current;
            discardRef.current();
            setTarget(null);
            commit.current = null;
            void action?.();
          }}
        >
          {t('Discard and continue', 'تجاهل والمتابعة')}
        </Button>
      )}
    </DecisionConfirmation>
  );
}
