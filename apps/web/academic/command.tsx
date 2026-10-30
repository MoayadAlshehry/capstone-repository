'use client';
import { useEffect, useRef, useState } from 'react';
import { deniedRead } from '../semester/read-status';
import { useRouter, useSearchParams } from 'next/navigation';
import { commandAtLocation } from '../shared-experience/command-model';
import { academicReceiptMatches } from './receipt-model';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
import type { Locale } from '../semester/common';
export function useAcademicCommand(
  memory: Record<string, string>,
  task: string,
  actor: string,
  endpoint = '/api/academic',
  assignment?: string,
) {
  const scope = assignment ? 'independent.' + assignment : task,
    query = useSearchParams(),
    router = useRouter(),
    key = 'academic.command.' + task,
    cid = useRef(
      (memory[key + '.id'] ??
        commandAtLocation(new URLSearchParams(query.toString()), scope) ??
        '') === memory[key + '.acknowledged']
        ? ''
        : (memory[key + '.id'] ??
            commandAtLocation(new URLSearchParams(query.toString()), scope) ??
            ''),
    ),
    frozen = useRef(memory[key + '.payload'] ?? ''),
    acknowledged = useRef(memory[key + '.acknowledged'] ?? ''),
    busy = useRef(false),
    epoch = useRef(0);
  const [state, setState] = useState(
      cid.current ? 'unknown' : memory[key + '.conflict'] ? 'conflict' : 'idle',
    ),
    [error, setError] = useState<{ code: string; issues?: string[] } | null>(
      null,
    );
  useEffect(() => {
    const revoke = (event: Event) => {
      epoch.current++;
      cid.current = '';
      frozen.current = '';
      delete memory[key + '.id'];
      delete memory[key + '.payload'];
      if (
        (event as CustomEvent<{ reason?: string }>).detail?.reason !==
        'pagehide'
      )
        locate(null);
      setState('unavailable');
      setError({ code: 'AUTHORITY_UNAVAILABLE' });
    };
    window.addEventListener('semester-memory-cleared', revoke);
    return () => {
      epoch.current++;
      window.removeEventListener('semester-memory-cleared', revoke);
    };
  }, [memory, key]);
  function locate(command: string | null) {
    const url = new URL(location.href);
    if (command) {
      url.searchParams.set('command', command);
      url.searchParams.set('task', scope);
    } else if (url.searchParams.get('task') === scope) {
      url.searchParams.delete('command');
      url.searchParams.delete('task');
      router.replace(url.pathname + url.search + url.hash, { scroll: false });
      return;
    }
    history.replaceState(
      history.state,
      '',
      url.pathname + url.search + url.hash,
    );
  }
  function clear() {
    cid.current = '';
    frozen.current = '';
    delete memory[key + '.id'];
    delete memory[key + '.payload'];
    delete memory[key + '.conflict'];
    locate(null);
  }
  const queryString = query.toString();
  useEffect(() => {
    if (
      acknowledged.current &&
      commandAtLocation(new URLSearchParams(queryString), scope) ===
        acknowledged.current
    )
      locate(null);
  }, [state, queryString, scope]);
  async function post(): Promise<Record<string, unknown> | null> {
    if (busy.current) return null;
    busy.current = true;
    setState('saving');
    setError(null);
    const generation = epoch.current;
    let checkAfterRequest = false;
    try {
      const r = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Workspace-Actor': actor,
          },
          body: frozen.current,
          signal: AbortSignal.timeout(15000),
        }),
        value = await r.json();
      if (generation !== epoch.current) return null;
      if (
        r.ok &&
        JSON.parse(frozen.current).operation === 'assessment.finalize'
      ) {
        // Completion is displayed only from the exact authorized receipt query.
        checkAfterRequest = true;
      } else if (r.ok) {
        acknowledged.current = cid.current;
        memory[key + '.acknowledged'] = cid.current;
        clear();
        setState('confirmed');
        return value as Record<string, unknown>;
      }
      if (!r.ok && value.knownRejected) {
        clear();
        if (value.code === 'CONFLICT') memory[key + '.conflict'] = 'true';
        setState(value.code === 'CONFLICT' ? 'conflict' : 'rejected');
        setError(value);
      } else if (!r.ok) {
        setState('unknown');
        checkAfterRequest = true;
      }
    } catch {
      if (generation === epoch.current) {
        setState('unknown');
        checkAfterRequest = true;
      }
    } finally {
      busy.current = false;
    }
    if (checkAfterRequest && generation === epoch.current)
      return recheck(false);
    return null;
  }
  async function send(input: Record<string, unknown>) {
    if (busy.current || state === 'unknown' || state === 'unavailable')
      return null;
    cid.current = crypto.randomUUID();
    frozen.current = JSON.stringify({ ...input, command: cid.current });
    memory[key + '.id'] = cid.current;
    memory[key + '.payload'] = frozen.current;
    locate(cid.current);
    return post();
  }
  async function recheck(
    retryOriginal = true,
  ): Promise<Record<string, unknown> | null> {
    if (busy.current || !cid.current) return null;
    busy.current = true;
    setState('saving');
    const generation = epoch.current;
    try {
      const r = await fetch(
          endpoint +
            '?command=' +
            cid.current +
            (assignment ? '&assignment=' + assignment : ''),
          {
            cache: 'no-store',
            headers: { 'X-Workspace-Actor': actor },
            signal: AbortSignal.timeout(10000),
          },
        ),
        value = await r.json();
      if (generation !== epoch.current) return null;
      if (
        r.ok &&
        value.receipt &&
        academicReceiptMatches(value.receipt, cid.current, scope)
      ) {
        acknowledged.current = cid.current;
        memory[key + '.acknowledged'] = cid.current;
        clear();
        setState('confirmed');
        setError(null);
        return value.receipt as Record<string, unknown>;
      }
      if (r.ok && value.receipt) {
        setState('unknown');
        setError({ code: 'RECEIPT_SCOPE_MISMATCH' });
        return null;
      }
      if (!r.ok) {
        if (deniedRead(r.status)) {
          clear();
          setState('unavailable');
        } else setState('unknown');
        setError({
          code: deniedRead(r.status) ? 'AUTHORITY_UNAVAILABLE' : 'UNAVAILABLE',
        });
        return null;
      }
    } catch {
      if (generation === epoch.current) {
        setState('unknown');
        setError({ code: 'UNAVAILABLE' });
      }
      return null;
    } finally {
      busy.current = false;
    }
    if (!retryOriginal && frozen.current) {
      setState('unknown');
      setError({ code: 'NOT_COMMITTED' });
      return null;
    }
    if (frozen.current) return post();
    setState('unknown');
    setError({ code: 'ORIGINAL_PAYLOAD_UNAVAILABLE' });
    return null;
  }
  return {
    state,
    error,
    send,
    recheck,
    acknowledgeObservedCompletion: () => {
      // Called only after an authorized exact-round read found an immutable assessment.
      acknowledged.current = cid.current;
      memory[key + '.acknowledged'] = cid.current;
      clear();
      setState('confirmed');
      setError(null);
    },
    reset: () => {
      if (busy.current || state === 'unknown') return;
      clear();
      setState('idle');
      setError(null);
    },
  };
}

export function AcademicCommandProtection({
  command,
  locale,
}: {
  command: ReturnType<typeof useAcademicCommand>;
  locale: Locale;
}) {
  const unresolved = command.state === 'saving' || command.state === 'unknown';
  const guard = useAssessmentExit(unresolved, locale, () => {}, {
    preserveLocaleSwitch: true,
    canDiscard: false,
  });
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (unresolved) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [unresolved]);
  return guard;
}
