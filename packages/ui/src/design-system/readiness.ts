'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReadinessPhase } from './loading.js';
type State<T> = {
  context: string;
  phase: ReadinessPhase;
  data: T | undefined;
  error: string | undefined;
};
/** One caller-owned resource operation; no global cache, router or authorization inference. */
export function useReadiness<T>({
  context,
  initialData,
  isEmpty,
}: {
  context: string;
  initialData?: T;
  isEmpty: (data: T) => boolean;
}) {
  const generation = useRef(0),
    operation = useRef<AbortController | null>(null),
    current = useRef(context);
  const [state, setState] = useState<State<T>>({
    context,
    phase:
      initialData === undefined
        ? 'idle'
        : isEmpty(initialData)
          ? 'empty'
          : 'ready',
    data: initialData,
    error: undefined,
  });
  const visible: State<T> =
    state.context === context
      ? state
      : { context, phase: 'idle', data: undefined, error: undefined };
  useLayoutEffect(() => {
    if (current.current === context) return;
    current.current = context;
    generation.current++;
    operation.current?.abort();
    setState({ context, phase: 'idle', data: undefined, error: undefined });
  }, [context]);
  useLayoutEffect(
    () => () => {
      generation.current++;
      operation.current?.abort();
    },
    [],
  );
  async function run(
    load: (signal: AbortSignal) => Promise<T>,
    { retainSafeContent = false }: { retainSafeContent?: boolean } = {},
  ) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    const intent = ++generation.current,
      key = context,
      retained = retainSafeContent ? visible.data : undefined;
    setState({
      context: key,
      phase: retained === undefined ? 'cold' : 'warm',
      data: retained,
      error: undefined,
    });
    try {
      const data = await load(controller.signal);
      if (
        intent !== generation.current ||
        current.current !== key ||
        controller.signal.aborted
      )
        return;
      setState({
        context: key,
        phase: isEmpty(data) ? 'empty' : 'ready',
        data,
        error: undefined,
      });
    } catch (error) {
      if (
        intent !== generation.current ||
        current.current !== key ||
        controller.signal.aborted
      )
        return;
      setState({
        context: key,
        phase: 'error',
        data: retained,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  function cancel() {
    generation.current++;
    operation.current?.abort();
    setState({ ...visible, phase: 'cancelled', error: undefined });
  }
  function markSlow() {
    setState((previous) =>
      ['cold', 'warm'].includes(previous.phase)
        ? { ...previous, phase: 'slow' }
        : previous,
    );
  }
  return {
    ...visible,
    run,
    cancel,
    markSlow,
    busy: ['cold', 'warm', 'slow'].includes(visible.phase),
  };
}
