'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { submissionUuid } from '@capstone/domain';
import { useSemesterMemory } from '../semester/memory';
import {
  commandAtLocation,
  governedReceipt,
  governedResult,
  type GovernedResult,
} from './command-model';
export type { GovernedResult } from './command-model';
export function useGovernedCommand(
  actorId: string,
  scope: string,
  requestBinding?: {
    logical: string;
    layer: 'supervisor' | 'committee' | 'external';
  },
) {
  const memory = useSemesterMemory(actorId, 'governance.' + scope),
    key = 'governance.command',
    lock = useRef(false),
    epoch = useRef(0),
    boundMemory = useRef(memory),
    query = useSearchParams(),
    router = useRouter(),
    command = useRef<string | null>(initialCommand()),
    acknowledged = useRef<string | null>(memory[key + '.acknowledged'] ?? null),
    [pending, setPending] = useState(false),
    [unknown, setUnknown] = useState(!!command.current),
    [denied, setDenied] = useState(false),
    [error, setError] = useState<string | null>(null),
    [lastResult, setLastResult] = useState<GovernedResult | null>(null);
  function initialCommand() {
    try {
      const frozen = JSON.parse(memory[key] ?? 'null') as {
        command?: unknown;
      } | null;
      if (submissionUuid(frozen?.command))
        return frozen!.command === memory[key + '.acknowledged']
          ? null
          : (frozen!.command as string);
    } catch {
      /* Only this document's original payload can be replayed. */
    }
    const candidate = commandAtLocation(
      new URLSearchParams(query.toString()),
      scope,
    );
    return candidate === memory[key + '.acknowledged'] ? null : candidate;
  }
  function locate(value: string | null) {
    const url = new URL(location.href);
    if (value) {
      url.searchParams.set('command', value);
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
  function confirmed(value: GovernedResult) {
    acknowledged.current = command.current;
    if (command.current) memory[key + '.acknowledged'] = command.current;
    delete memory[key];
    command.current = null;
    locate(null);
    setUnknown(false);
    setLastResult(value);
    return value;
  }
  const queryString = query.toString();
  useEffect(() => {
    if (
      acknowledged.current &&
      commandAtLocation(new URLSearchParams(queryString), scope) ===
        acknowledged.current
    )
      locate(null);
  }, [lastResult, queryString, scope]);
  function reject(status: number) {
    delete memory[key];
    command.current = null;
    locate(null);
    setUnknown(false);
    if ([401, 403, 404].includes(status)) setDenied(true);
    setError(
      status === 409
        ? 'CONFLICT'
        : [401, 403, 404].includes(status)
          ? 'AUTHORITY_UNAVAILABLE'
          : 'REJECTED',
    );
  }
  useEffect(() => {
    if (boundMemory.current === memory) return;
    epoch.current++;
    boundMemory.current = memory;
    command.current = initialCommand();
    setPending(false);
    setUnknown(!!command.current);
    setDenied(false);
    setError(null);
    setLastResult(null);
  }, [memory]);
  useEffect(() => {
    const clear = (event: Event) => {
      epoch.current++;
      delete memory[key];
      command.current = null;
      if (
        (event as CustomEvent<{ reason?: string }>).detail?.reason !==
        'pagehide'
      )
        locate(null);
      setPending(false);
      setUnknown(false);
      setDenied(true);
      setLastResult(null);
      setError('AUTHORITY_UNAVAILABLE');
    };
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      epoch.current++;
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [memory]);
  async function post(generation: number): Promise<GovernedResult | null> {
    const frozen = memory[key];
    if (!frozen || !command.current) {
      setError('ORIGINAL_PAYLOAD_UNAVAILABLE');
      return null;
    }
    const input = JSON.parse(frozen) as {
      command: string;
      body: { issue?: string };
    };
    if (input.command !== command.current) {
      setUnknown(true);
      setError('OUTCOME_UNKNOWN');
      return null;
    }
    const response = await fetch('/api/evaluation-governance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Actor': actorId,
      },
      body: frozen,
    });
    if (generation !== epoch.current) return null;
    if (!response.ok) {
      if (response.status >= 500) {
        setUnknown(true);
        setError('OUTCOME_UNKNOWN');
        return null;
      }
      reject(response.status);
      return null;
    }
    const value: unknown = await response.json();
    if (generation !== epoch.current) return null;
    if (
      !governedResult(value) ||
      (input.body.issue && value.issue !== input.body.issue)
    ) {
      setUnknown(true);
      setError('OUTCOME_UNKNOWN');
      return null;
    }
    return confirmed(value);
  }
  async function execute(reconcile: boolean): Promise<GovernedResult | null> {
    if (lock.current || denied || !command.current) return null;
    lock.current = true;
    setPending(true);
    setError(null);
    const generation = epoch.current;
    try {
      if (reconcile) {
        const response = await fetch(
          '/api/evaluation-governance?receipt=' + command.current,
          {
            cache: 'no-store',
            headers: { 'X-Workspace-Actor': actorId },
          },
        );
        if (generation !== epoch.current) return null;
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status))
            reject(response.status);
          else {
            setUnknown(true);
            setError('OUTCOME_UNKNOWN');
          }
          return null;
        }
        const value = (await response.json()) as { receipt?: unknown };
        if (generation !== epoch.current) return null;
        if (value.receipt !== null) {
          if (
            !governedReceipt(
              value.receipt,
              command.current,
              scope,
              requestBinding,
            )
          ) {
            setUnknown(true);
            setError('OUTCOME_UNKNOWN');
            return null;
          }
          return confirmed(value.receipt.result);
        }
      }
      return await post(generation);
    } catch {
      if (generation === epoch.current) {
        setUnknown(true);
        setError('OUTCOME_UNKNOWN');
      }
      return null;
    } finally {
      lock.current = false;
      if (generation === epoch.current) setPending(false);
    }
  }
  async function send(operation: string, body: Record<string, unknown>) {
    if (lock.current || unknown || denied) return null;
    command.current = crypto.randomUUID();
    memory[key] = JSON.stringify({
      operation,
      body,
      command: command.current,
    });
    locate(command.current);
    return execute(false);
  }
  return {
    send,
    retry: () => execute(true),
    pending,
    unknown,
    denied,
    error,
    lastResult,
  };
}
