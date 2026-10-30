'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@capstone/ui/workspace-v2';
type State = {
  schema: string;
  project: string;
  version: string;
  revision: number;
  manifestHash: string;
  authorized: boolean;
  canAuthorize: boolean;
  files: { id: string; path: string }[];
  allocation?: {
    policy: string;
    eligibleAt: string | null;
    checkedAt: string;
    active: number;
    waitingInitialSlots: number;
    completed: number;
    reasons: string[];
    progressionState?: string | null;
    qualityPaused?: boolean;
    progressionReasons?: string[];
  } | null;
};
export function FinalPacketConsent({
  project,
  version,
  actor,
  locale,
}: {
  project: string;
  version: string;
  actor: string;
  locale: 'en' | 'ar';
}) {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [ack, setAck] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    command = useRef('');
  const copy = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const textDir = locale === 'ar' ? 'rtl' : 'ltr';
  const endpoint =
    '/api/academic-packets?project=' + project + '&version=' + version;
  async function load(signal?: AbortSignal) {
    const r = await fetch(endpoint, {
      cache: 'no-store',
      headers: { 'X-Workspace-Actor': actor },
      ...(signal ? { signal } : {}),
    });
    if (!r.ok) throw Error('READ_FAILED');
    const value = (await r.json()) as State;
    setState(value);
    return value;
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((e) => {
      if (e.name !== 'AbortError')
        setError(
          copy(
            'Unable to load academic review authorization.',
            'تعذّر تحميل تفويض المراجعة الأكاديمية.',
          ),
        );
    });
    const timer = setInterval(() => {
      void load(controller.signal).catch(() => {});
    }, 10000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [project, version, actor]);
  async function authorize() {
    if (!state || !ack || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/academic-packets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actor,
        },
        body: JSON.stringify({
          operation: 'authorize-final',
          project,
          version,
          revision: state.revision,
          hash: state.manifestHash,
          acknowledged: true,
          command: command.current,
        }),
      });
      if (!r.ok) throw Error('COMMAND_FAILED');
      await load();
      dialog.current?.close();
    } catch {
      try {
        const current = await load();
        if (current.authorized) {
          dialog.current?.close();
          return;
        }
      } catch {}
      setError(
        copy(
          'Authorization was not confirmed. Refresh the evidence and retry; no access is granted by this message.',
          'لم يُؤكَّد التفويض. حدّث الأدلة وأعد المحاولة؛ لا تمنح هذه الرسالة أي وصول.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="ss-card"
      aria-label={copy(
        'Academic review authorization',
        'تفويض المراجعة الأكاديمية',
      )}
    >
      <h3 dir={textDir}>
        {copy('Independent academic review', 'المراجعة الأكاديمية المستقلة')}
      </h3>
      {state ? (
        <>
          <p dir={textDir}>
            {state.authorized
              ? copy(
                  'The project lead authorized this exact frozen evidence packet. Reviewer eligibility and assignment are checked separately.',
                  'فوّض قائد المشروع حزمة الأدلة المجمدة هذه تحديدًا. يُتحقَّق من أهلية المراجع وتكليفه بصورة منفصلة.',
                )
              : copy(
                  'Publication does not authorize independent-review access. The current lead must confirm the score-free frozen evidence packet.',
                  'لا يجيز النشر الوصول للمراجعة المستقلة. يجب أن يؤكد القائد الحالي خلو حزمة الأدلة المجمدة من الدرجات.',
                )}
          </p>
          <p dir={textDir}>
            {copy('Frozen original files: ', 'الملفات الأصلية المجمدة: ')}
            {state.files.length}
          </p>
          {state.allocation && (
            <section
              aria-label={copy(
                'Independent review status',
                'حالة المراجعة المستقلة',
              )}
            >
              <h4 dir={textDir}>
                {copy(
                  'Automatic independent review',
                  'المراجعة المستقلة التلقائية',
                )}
              </h4>
              <p dir={textDir}>
                {copy('Active offers/tasks: ', 'عروض أو مهام نشطة: ')}
                {state.allocation.active} ·{' '}
                {copy('Completed assessments: ', 'تقييمات مكتملة: ')}
                {state.allocation.completed} ·{' '}
                {copy('Waiting initial slots: ', 'خانات أولية منتظرة: ')}
                {state.allocation.waitingInitialSlots}
              </p>
              <p dir={textDir}>
                {state.allocation.qualityPaused ||
                state.allocation.progressionState === 'paused_quality'
                  ? copy(
                      'Further independent review is paused at the current quality boundary. Completed assessments remain recorded; time alone does not restart allocation.',
                      'تتوقف المراجعات المستقلة الإضافية عند حدود الجودة الحالية. تبقى التقييمات المكتملة محفوظة، ولا يعيد مرور الوقت وحده بدء الإسناد.',
                    )
                  : state.allocation.progressionState === 'completed_limit'
                    ? copy(
                        'Independent review is complete at the ten-review limit. Completed assessments remain recorded.',
                        'اكتملت المراجعة المستقلة عند حد عشرة تقييمات. تبقى التقييمات المكتملة محفوظة.',
                      )
                    : state.allocation.progressionState === 'paused_access'
                      ? copy(
                          'Independent review cannot proceed until publication, frozen-evidence authorization and current access requirements are met. Recorded assessments stay unchanged.',
                          'لا يمكن متابعة المراجعة المستقلة قبل استيفاء النشر وتفويض الأدلة المجمدة ومتطلبات الوصول الحالية. تبقى التقييمات المسجلة دون تغيير.',
                        )
                      : ['queued_expansion', 'waiting_capacity'].includes(
                            state.allocation.progressionState ?? '',
                          )
                        ? copy(
                            'This edition qualifies for a further independent review and is waiting for qualified capacity. Existing results remain recorded.',
                            'تؤهل هذه النسخة لمراجعة مستقلة إضافية وتنتظر سعة مؤهلة. تبقى النتائج السابقة محفوظة.',
                          )
                        : state.allocation.active > 0
                          ? copy(
                              'Independent review is in progress. Offers and accepted tasks are distinct from completed assessments.',
                              'المراجعة المستقلة قيد العمل. تختلف العروض والمهام المقبولة عن التقييمات المكتملة.',
                            )
                          : state.allocation.reasons.includes(
                                'waiting_for_qualified_capacity',
                              )
                            ? copy(
                                'Waiting for qualified independent capacity. No reviewer is invented and no hard gate is relaxed.',
                                'بانتظار سعة مؤهلة ومستقلة. لا يُختلق مراجع ولا يُتجاوز أي شرط.',
                              )
                            : state.allocation.reasons.length
                              ? copy(
                                  'Publication, evidence or eligibility prerequisites are still pending.',
                                  'ما زالت متطلبات النشر أو الأدلة أو الأهلية غير مكتملة.',
                                )
                              : copy(
                                  'The first-pair policy has checked this exact edition. Offers are distinct from completed assessments.',
                                  'تحققت سياسة أول مراجعَين من هذه النسخة المحددة. العروض ليست تقييمات مكتملة.',
                                )}
              </p>
              <small dir="ltr">
                {state.allocation.policy} · {copy('Checked ', 'آخر تحقق ')}
                {new Date(state.allocation.checkedAt).toLocaleString(locale)}
              </small>
            </section>
          )}
          {!state.authorized && state.canAuthorize && (
            <Button
              ref={trigger}
              onClick={() => {
                setAck(false);
                setError('');
                command.current = crypto.randomUUID();
                dialog.current?.showModal();
              }}
            >
              {copy('Review academic packet', 'مراجعة الحزمة الأكاديمية')}
            </Button>
          )}
        </>
      ) : !error ? (
        <p role="status" dir={textDir}>
          {copy(
            'Loading academic review authorization…',
            'جارٍ تحميل تفويض المراجعة الأكاديمية…',
          )}
        </p>
      ) : null}
      {error && (
        <p role="alert" dir={textDir}>
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className="ss-card"
        style={{
          maxWidth: 640,
          width: 'calc(100% - 32px)',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: 24,
          borderRadius: 16,
        }}
        aria-labelledby="academic-consent-title"
        onClose={() => trigger.current?.focus()}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <h2 id="academic-consent-title" dir={textDir}>
          {copy(
            'Authorize this frozen evidence packet',
            'تفويض حزمة الأدلة المجمدة هذه',
          )}
        </h2>
        <p dir={textDir}>
          {copy(
            'This includes every frozen original, including restricted files. Only an eligible reviewer with an accepted, unexpired assignment can read the packet. Public file visibility stays unchanged.',
            'يشمل هذا كل أصل مجمد، بما في ذلك الملفات المقيّدة. لا يقرأ الحزمة إلا مراجع مؤهل بتكليف مقبول وغير منتهٍ. لا تتغير إتاحة الملفات للعامة.',
          )}
        </p>
        <ul dir="ltr">
          {state?.files.map((f) => (
            <li key={f.id}>
              <code>{f.path}</code>
            </li>
          ))}
        </ul>
        <label dir="auto" style={{ display: 'flex', gap: 12, marginBlock: 20 }}>
          <input
            type="checkbox"
            checked={ack}
            disabled={busy}
            onChange={(e) => setAck(e.target.checked)}
          />
          <span dir={textDir}>
            {copy(
              'I checked that these files contain no assessment scores, reviewer identities or private feedback. As the current lead, I authorize this exact version for independent academic review.',
              'تحققت من خلو هذه الملفات من درجات التقييم وهويات المراجعين والتغذية الراجعة الخاصة. وبصفتي القائد الحالي، أفوض هذا الإصدار تحديدًا للمراجعة الأكاديمية المستقلة.',
            )}
          </span>
        </label>
        {error && (
          <p role="alert" dir={textDir}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button disabled={!ack || busy} onClick={() => void authorize()}>
            {busy
              ? copy('Confirming…', 'جارٍ التأكيد…')
              : copy('Confirm lead authorization', 'تأكيد تفويض القائد')}
          </Button>
          <Button
            pending={busy}
            variant="outline"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            {copy('Cancel', 'إلغاء')}
          </Button>
        </div>
      </dialog>
    </section>
  );
}
