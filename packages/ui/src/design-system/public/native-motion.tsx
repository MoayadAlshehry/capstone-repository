'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'),
      change = () => setReduced(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return reduced;
}
/** Move the filter tray without fading readable foreground against its backdrop. */
export function Fade(props: ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null),
    reduced = useReducedMotion();
  useLayoutEffect(() => {
    if (reduced) return;
    const a = ref.current?.animate(
      [{ transform: 'translateY(4px)' }, { transform: 'translateY(0)' }],
      {
        duration: 180,
      },
    );
    return () => a?.cancel();
  }, [reduced]);
  return <div {...props} ref={ref} style={{ ...props.style, opacity: 1 }} />;
}
