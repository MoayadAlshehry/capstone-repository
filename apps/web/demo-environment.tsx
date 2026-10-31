'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
const Environment = createContext(false);
export function DemoEnvironment({
  active,
  sharedReset = active,
  children,
  locale = 'en',
}: {
  active: boolean;
  sharedReset?: boolean;
  children: ReactNode;
  locale?: string;
}) {
  const [blocked, setBlocked] = useState(false),
    modal = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!sharedReset) return;
    let disposed = false,
      seen: number | undefined,
      interrupted = false;
    async function poll() {
      try {
        const r = await fetch('/__demo/status', {
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        });
        if (r.status === 404) return; // Private direct-origin verification has no public gateway.
        if (!r.ok) throw Error('UNAVAILABLE');
        const state = (await r.json()) as {
          epoch: number;
          maintenance: boolean;
        };
        if (
          disposed ||
          !Number.isSafeInteger(state.epoch) ||
          typeof state.maintenance !== 'boolean'
        )
          return;
        setBlocked(state.maintenance);
        if (state.maintenance) interrupted = true;
        if (
          !state.maintenance &&
          (interrupted || (seen !== undefined && seen !== state.epoch))
        ) {
          try {
            for (const key of Object.keys(sessionStorage))
              if (key.startsWith('capstone.position.'))
                sessionStorage.removeItem(key);
          } catch {}
          window.location.reload();
          return;
        }
        seen ??= state.epoch;
      } catch {
        if (!disposed && seen !== undefined) setBlocked(true);
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [sharedReset]);
  useEffect(() => {
    if (blocked && !modal.current?.open) modal.current?.showModal();
    else if (!blocked && modal.current?.open) modal.current.close();
  }, [blocked]);
  const ar = locale === 'ar';
  return (
    <Environment.Provider value={active}>
      {children}
      {sharedReset && (
        <dialog
          ref={modal}
          aria-labelledby="demo-reset-title"
          aria-describedby="demo-reset-message"
          onCancel={(e) => e.preventDefault()}
          style={{
            display: blocked ? 'block' : 'none',
            background: 'Canvas',
            color: 'CanvasText',
            font: 'inherit',
            maxWidth: '480px',
            border: '1px solid currentColor',
            borderRadius: '16px',
            padding: '28px',
          }}
        >
          <h2 id="demo-reset-title" dir={ar ? 'rtl' : 'ltr'}>
            {ar
              ? 'جارٍ إعادة تهيئة العرض التوضيحي'
              : 'The shared demonstration is resetting'}
          </h2>
          <p id="demo-reset-message" dir={ar ? 'rtl' : 'ltr'}>
            {ar
              ? 'ستنتهي الجلسة وتُزال التغييرات منذ آخر إعادة تهيئة. يرجى الانتظار حتى تصبح البيئة جاهزة.'
              : 'Your session will end and changes made since the last reset will be discarded. Please wait until the environment is ready.'}
          </p>
        </dialog>
      )}
    </Environment.Provider>
  );
}
export function DemoNotice({ locale }: { locale: 'en' | 'ar' }) {
  return useContext(Environment) ? (
    <p className="ps-rights" role="note" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {locale === 'en'
        ? 'Sample projects, author identities and assessments are fictional. No university endorsement is implied.'
        : 'المشاريع وأسماء مؤلفيها والتقييمات المعروضة أمثلة افتراضية، ولا تعني اعتمادًا من الجامعات.'}
    </p>
  ) : null;
}
