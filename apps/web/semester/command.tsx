'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { commandAtLocation } from '../shared-experience/command-model';
import type { SemesterReceipt } from '@capstone/domain';
import { Button, LoaderCircle } from '@capstone/ui/workspace-v2';
import { Notice, t, type Locale } from './common';
export interface CommandFailure {
  code: string;
  issues?: string[];
  fields?: { path: string; code: string }[];
  knownRejected?: boolean;
}
export function useSemesterCommand(
  memory: Record<string, string>,
  task: string,
  project: string,
  version: string,
  actor: string,
  locked?: string,
) {
  const router = useRouter(),
    query = useSearchParams(),
    cid = useRef(
      (locked ?? memory[task + '.command'] ?? '') ===
        memory[task + '.acknowledged']
        ? ''
        : (locked ?? memory[task + '.command'] ?? ''),
    ),
    payload = useRef(memory[task + '.payload'] ?? ''),
    busy = useRef(false),
    acknowledged = useRef(memory[task + '.acknowledged'] ?? ''),
    epoch = useRef(0);
  const [state, setState] = useState(cid.current ? 'unknown' : 'editing'),
    [error, setError] = useState<CommandFailure | null>(null);
  function locate() {
    const url = new URL(window.location.href);
    url.searchParams.set('command', cid.current);
    url.searchParams.set('task', task);
    window.history.replaceState(
      window.history.state,
      '',
      url.pathname + url.search,
    );
  }
  function clear(removeLocation = true) {
    cid.current = '';
    payload.current = '';
    delete memory[task + '.command'];
    delete memory[task + '.payload'];
    const url = new URL(window.location.href);
    if (removeLocation && url.searchParams.get('task') === task) {
      url.searchParams.delete('task');
      url.searchParams.delete('command');
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }
  useEffect(() => {
    const revoke = (event: Event) => {
      epoch.current++;
      clear(
        (event as CustomEvent<{ reason?: string }>).detail?.reason !==
          'pagehide',
      );
      setState('unavailable');
      setError({ code: 'ACTOR_CHANGED', knownRejected: true });
    };
    window.addEventListener('semester-memory-cleared', revoke);
    return () => {
      epoch.current++;
      window.removeEventListener('semester-memory-cleared', revoke);
    };
  }, [actor, memory, task]);
  function confirmed(r: SemesterReceipt) {
    if (
      r.project !== project ||
      r.version !== version ||
      !(
        task === 'metadata'
          ? ['metadata.save']
          : task === 'checkpoint'
            ? ['checkpoint.send']
            : ['checkpoint.changes', 'checkpoint.accept']
      ).includes(r.operation)
    )
      throw Error('WRONG_RECEIPT');
    acknowledged.current = cid.current;
    memory[task + '.acknowledged'] = cid.current;
    clear();
    setState('confirmed');
    setError(null);
    return r;
  }
  const queryString = query.toString();
  useEffect(() => {
    if (
      acknowledged.current &&
      commandAtLocation(new URLSearchParams(queryString), task) ===
        acknowledged.current
    )
      clear();
  }, [state, queryString, task]);
  async function write(input: Record<string, unknown>) {
    if (busy.current || ['pending', 'unknown', 'unavailable'].includes(state))
      return null;
    cid.current ||= crypto.randomUUID();
    payload.current = JSON.stringify({ ...input, command: cid.current });
    memory[task + '.command'] = cid.current;
    memory[task + '.payload'] = payload.current;
    locate();
    return postFrozen();
  }
  async function postFrozen() {
    busy.current = true;
    setState('pending');
    setError(null);
    const generation = epoch.current;
    try {
      const reply = await fetch('/api/semester', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Workspace-Actor': actor,
          },
          body: payload.current,
        }),
        value = await reply.json();
      if (generation !== epoch.current) return null;
      if (reply.ok) return confirmed(value as SemesterReceipt);
      if (value.knownRejected) {
        if (value.code === 'ACTOR_CHANGED') {
          window.dispatchEvent(new Event('account-draft-cleared'));
          return null;
        }
        clear();
        setState('editing');
        setError(value as CommandFailure);
      } else setState('unknown');
    } catch {
      if (generation === epoch.current) setState('unknown');
    } finally {
      busy.current = false;
    }
    return null;
  }
  async function retryOriginal() {
    if (!payload.current || busy.current) return null;
    const result = await reconcile();
    if (result) return result;
    // Replaying the identical original command is safe even if its first
    // transaction is still finishing: the server serializes its receipt key.
    if (!busy.current && cid.current && payload.current) return postFrozen();
    return null;
  }
  async function reconcile() {
    if (busy.current || !cid.current) return null;
    busy.current = true;
    setState('pending');
    const generation = epoch.current;
    try {
      const reply = await fetch(
        '/api/semester?command=' + encodeURIComponent(cid.current),
        { cache: 'no-store', headers: { 'X-Workspace-Actor': actor } },
      );
      if (!reply.ok) throw Error();
      const value = await reply.json();
      if (generation !== epoch.current) return null;
      if (value.receipt) return confirmed(value.receipt as SemesterReceipt);
      setState('unknown');
      setError({ code: 'NOT_CONFIRMED' });
    } catch {
      if (generation === epoch.current) {
        setState('unknown');
        setError({ code: 'UNAVAILABLE' });
      }
    } finally {
      busy.current = false;
    }
    return null;
  }
  return {
    state,
    error,
    write,
    reconcile,
    retryOriginal,
    hasOriginalPayload: !!payload.current,
    clear,
    reset: () => {
      if (busy.current || ['pending', 'unknown', 'unavailable'].includes(state))
        return;
      clear();
      setState('editing');
      setError(null);
    },
    refresh: () => router.refresh(),
    pending: state === 'pending' || state === 'unknown',
  };
}
export function CommandRecovery({
  locale,
  command,
  onDone,
}: {
  locale: Locale;
  command: ReturnType<typeof useSemesterCommand>;
  onDone: (r: SemesterReceipt) => void;
}) {
  return (
    <Notice
      locale={locale}
      title={
        command.state === 'pending'
          ? t(locale, 'Waiting for confirmation', 'بانتظار التأكيد')
          : t(locale, 'Check the original request', 'تحقق من الطلب الأصلي')
      }
    >
      <p dir="auto">
        {command.state === 'pending'
          ? t(
              locale,
              'Your request is being checked by the server. Keep this page open until its outcome is confirmed.',
              'يتحقق الخادم من طلبك. أبقِ هذه الصفحة مفتوحة حتى تتأكد النتيجة.',
            )
          : t(
              locale,
              'The server result is not confirmed. Recheck the original request before making another change.',
              'لم تُؤكد نتيجة الخادم. أعد فحص الطلب الأصلي قبل إجراء تغيير آخر.',
            )}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={command.state === 'pending'}
        onClick={async () => {
          const r = await command.reconcile();
          if (r) onDone(r);
        }}
      >
        {command.state === 'pending' && <LoaderCircle />}
        {t(locale, 'Recheck original request', 'إعادة فحص الطلب الأصلي')}
      </Button>
      {command.error && (
        <p dir="auto">
          {t(
            locale,
            command.hasOriginalPayload
              ? 'No confirmed result is available yet. Your original input remains in this browser document.'
              : 'No confirmed result is available yet. After a full refresh, only this command reference remains; check its receipt before making another change.',
            command.hasOriginalPayload
              ? 'لا توجد نتيجة مؤكدة بعد. يبقى الإدخال الأصلي في صفحة المتصفح هذه.'
              : 'لا توجد نتيجة مؤكدة بعد. بعد التحديث الكامل يبقى مرجع الأمر فقط؛ تحقق من إيصال تسجيله قبل إجراء تغيير آخر.',
          )}
        </p>
      )}
      {command.error?.code === 'NOT_CONFIRMED' &&
        command.hasOriginalPayload && (
          <Button
            type="button"
            variant="outline"
            disabled={command.state === 'pending'}
            onClick={async () => {
              const r = await command.retryOriginal();
              if (r) onDone(r);
            }}
          >
            {t(
              locale,
              'Retry the same original request',
              'إعادة محاولة الطلب الأصلي نفسه',
            )}
          </Button>
        )}
    </Notice>
  );
}
