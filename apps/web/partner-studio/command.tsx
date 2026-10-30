'use client';
import { useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSemesterMemory } from '../semester/memory';
import { Button } from '@capstone/ui/workspace-v2';
import { copy, type Locale } from './model';
export function usePartnerCommand(
  actor: string,
  scope: string,
  endpoint = '/api/partner-access',
) {
  const memory = useSemesterMemory(actor, scope),
    key = 'partner.command.' + endpoint,
    router = useRouter(),
    lock = useRef(false),
    epoch = useRef(0);
  const [state, setState] = useState(memory[key] ? 'unknown' : 'ready');
  useEffect(() => {
    const clear = () => {
      epoch.current++;
      lock.current = false;
      setState('denied');
    };
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      epoch.current++;
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, []);
  async function send(input?: Record<string, unknown>) {
    if (lock.current || state === 'denied') return;
    lock.current = true;
    const current = epoch.current;
    if (input)
      memory[key] = JSON.stringify({
        ...input,
        commandId: crypto.randomUUID(),
      });
    const body = memory[key];
    if (!body) {
      lock.current = false;
      return;
    }
    setState('saving');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actor,
        },
        body,
      });
      const value = await res.json();
      if (current !== epoch.current) return;
      if (res.ok) {
        delete memory[key];
        setState(value.noop ? 'existing' : 'saved');
        router.refresh();
        return value as { scope: string; row_version: number; noop?: boolean };
      }
      if (res.status >= 500) {
        setState('unknown');
        return;
      }
      delete memory[key];
      setState(
        res.status === 409
          ? 'stale'
          : res.status === 403 || res.status === 401
            ? 'denied'
            : 'invalid',
      );
      if (res.status === 409) router.refresh();
    } catch {
      if (current === epoch.current) setState('unknown');
    } finally {
      if (current === epoch.current) lock.current = false;
    }
  }
  return {
    state,
    send,
    reset: () => {
      if (state === 'stale') {
        setState('ready');
        router.refresh();
      }
    },
    blocked: ['saving', 'unknown', 'denied', 'stale'].includes(state),
  };
}
export function CommandOutcome({
  locale,
  cmd,
}: {
  locale: Locale;
  cmd: ReturnType<typeof usePartnerCommand>;
}) {
  const t = (e: string, a: string) => copy(locale, e, a);
  return (
    <div className="ps-outcome" aria-live="polite">
      {cmd.state === 'saving' && (
        <p dir="auto">{t('Saving on the server…', 'جارٍ الحفظ على الخادم…')}</p>
      )}
      {cmd.state === 'saved' && (
        <p dir="auto" role="status">
          {t(
            'Saved on the server. The current record is shown below.',
            'حُفظ على الخادم. يظهر السجل الحالي أدناه.',
          )}
        </p>
      )}
      {cmd.state === 'existing' && (
        <p dir="auto" role="status">
          {t(
            'A request or grant already exists for this edition. No duplicate was created.',
            'يوجد طلب أو إذن لهذه النسخة بالفعل. لم يُنشأ تكرار.',
          )}
        </p>
      )}
      {cmd.state === 'unknown' && (
        <>
          <p dir="auto" role="alert">
            {t(
              'The outcome is unknown. Check the same command before trying another action.',
              'نتيجة الإجراء غير معروفة. تحقق من الإجراء نفسه قبل محاولة إجراء آخر.',
            )}
          </p>
          <Button variant="outline" onClick={() => void cmd.send()}>
            {t('Check outcome', 'التحقق من النتيجة')}
          </Button>
        </>
      )}
      {cmd.state === 'stale' && (
        <>
          <p dir="auto" role="alert">
            {t(
              'The record changed. Review its current state before deciding again.',
              'تغيّر السجل. راجع حالته الحالية قبل اتخاذ قرار جديد.',
            )}
          </p>
          <Button variant="outline" onClick={cmd.reset}>
            {t('Review current record', 'مراجعة السجل الحالي')}
          </Button>
        </>
      )}
      {cmd.state === 'denied' && (
        <p dir="auto" role="alert">
          {t(
            'Your current access does not permit this action. Return to your workspace or sign in again.',
            'لا يسمح وصولك الحالي بهذا الإجراء. عد إلى مساحة عملك أو سجّل الدخول مجددًا.',
          )}
        </p>
      )}
      {cmd.state === 'invalid' && (
        <p dir="auto" role="alert">
          {t(
            'The action was rejected. Check the purpose, reason and current eligibility.',
            'رُفض الإجراء. تحقق من الغرض والسبب والأهلية الحالية.',
          )}
        </p>
      )}
    </div>
  );
}
