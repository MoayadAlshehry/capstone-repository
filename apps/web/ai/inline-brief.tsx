'use client';
import { MotionReveal } from '@/components/ui/shared-motion';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RequestLoader } from './loader';
import { StreamingText } from '@/components/assistant-ui/elements/streaming-text';
import { useAISystem } from './context';
import { aiStream } from './transport';
import type { AIProjectRef, BriefSize, AISnapshot } from './types';
export function InlineBrief({
  project,
  compact = false,
  detail = false,
  briefSize,
}: {
  project: AIProjectRef & { version: string; abstract: string };
  compact?: boolean;
  detail?: boolean;
  briefSize?: BriefSize;
}) {
  const ai = useAISystem(),
    ar = ai.locale === 'ar',
    size = briefSize ?? (compact ? 'standard' : 'hero');
  const key = project.id + ':' + project.version + ':' + ai.locale + ':' + size;
  const [state, setState] = useState<{
    key: string;
    phase: string;
    text: string;
    cache: boolean;
  }>({ key, phase: 'idle', text: '', cache: false });
  const request = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null),
    close = useRef<HTMLButtonElement | null>(null);
  const current =
    state.key === key ? state : { key, phase: 'idle', text: '', cache: false };
  const active = ['retrieving', 'generating', 'streaming', 'queued'].includes(
    current.phase,
  );
  const l = (en: string, arabic: string) => (ar ? arabic : en);
  const panelOpen = !!current.text || active;
  useEffect(() => {
    if (panelOpen) close.current?.focus({ preventScroll: true });
  }, [panelOpen]);
  useEffect(() => {
    const off = () => {
      request.current?.abort();
      setState({ key, phase: 'idle', text: '', cache: false });
    };
    addEventListener('capstone-ai-disabled', off);
    addEventListener('capstone-ai-context-changed', off);
    return () => {
      off();
      removeEventListener('capstone-ai-disabled', off);
      removeEventListener('capstone-ai-context-changed', off);
    };
  }, [key]);
  async function start() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState({ key, phase: 'retrieving', text: '', cache: false });
    const timer = setInterval(() => {
      void fetch('/api/ai?status=1', {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (r) => {
          if (!r.ok) {
            controller.abort();
            setState({ key, phase: 'error', text: '', cache: false });
          }
        })
        .catch(() => undefined);
    }, 5000);
    try {
      for await (const event of aiStream(
        {
          action: 'snapshot',
          locale: ai.locale,
          project: project.id,
          version: project.version,
          briefSize: size,
        },
        controller.signal,
      )) {
        if (controller.signal.aborted) return;
        if (
          event.type === 'status' &&
          ['queued', 'generating'].includes(event.state)
        )
          setState((s) => ({ ...s, phase: event.state }));
        if (event.type === 'brief')
          setState({ key, phase: 'streaming', text: event.text, cache: false });
        if (event.type === 'result') {
          const result = event.value as {
            snapshot?: AISnapshot;
            cache: boolean;
          };
          if (result.snapshot)
            setState({
              key,
              phase: 'ready',
              text: result.snapshot.summary,
              cache: result.cache,
            });
        }
        if (event.type === 'error') throw Error(event.code);
      }
    } catch {
      if (!controller.signal.aborted)
        setState({ key, phase: 'error', text: '', cache: false });
    } finally {
      clearInterval(timer);
      if (request.current === controller) request.current = null;
    }
  }
  const reset = () => {
    request.current?.abort();
    request.current = null;
    setState({ key, phase: 'idle', text: '', cache: false });
    requestAnimationFrame(() =>
      trigger.current?.focus({ preventScroll: true }),
    );
  };
  if (!ai.enabled) return detail ? null : <p dir="auto">{project.abstract}</p>;
  return (
    <div
      className="pu-brief"
      data-capstone-ai
      data-brief-state={current.phase}
      data-brief-size={size}
      data-brief-detail={detail || undefined}
      data-ai-cache={current.cache ? 'hit' : 'miss'}
    >
      {!panelOpen && (
        <Button
          ref={trigger}
          className="ai-action-primary ai-brief-chip"
          size="sm"
          disabled={active}
          aria-expanded={current.phase === 'ready' || active}
          onClick={() => {
            void start();
          }}
        >
          <Sparkles aria-hidden="true" />
          {l('AI Brief', 'ملخص ذكي')}
        </Button>
      )}
      <MotionReveal
        visible={!!current.text || active}
        className="ai-brief-surface"
        dir={ar ? 'rtl' : 'ltr'}
      >
        <div className="ai-brief-header">
          <Sparkles size={14} aria-hidden="true" />
          <span>{l('AI-generated brief', 'ملخص مولّد بالذكاء الاصطناعي')}</span>
          <Button
            ref={close}
            variant="ghost"
            size="icon-sm"
            onClick={reset}
            aria-label={
              active
                ? l('Cancel brief', 'إلغاء الملخص')
                : l('Show original description', 'عرض الوصف الأصلي')
            }
          >
            <X size={14} />
          </Button>
        </div>
        {current.text ? (
          <StreamingText
            segments={[{ text: current.text }]}
            count={current.text.split(' ').length}
            streaming={current.phase === 'streaming'}
          />
        ) : (
          <RequestLoader
            label={l('Preparing a short brief…', 'جارٍ إعداد ملخص قصير…')}
          />
        )}
      </MotionReveal>
      {!panelOpen && !detail ? (
        <p className={compact ? 'line-clamp-3' : ''} dir="auto">
          {project.abstract}
        </p>
      ) : null}
      {current.phase === 'error' && (
        <p className="text-sm text-muted-foreground" role="status">
          {l(
            'Brief unavailable. The original description is shown. Retry when ready.',
            'تعذّر إعداد الملخص. يظهر الوصف الأصلي؛ يمكنك المحاولة مجددًا.',
          )}
        </p>
      )}
    </div>
  );
}
