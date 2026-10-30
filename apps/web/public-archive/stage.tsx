'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function ResearchStageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let cancelled = false,
      cleanup = () => {};
    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        const media = gsap.matchMedia();
        media.add('(prefers-reduced-motion: no-preference)', () => {
          const context = gsap.context(() => {
            gsap.from('[data-stage-mount]', {
              y: 24,
              scale: 0.98,
              duration: 0.75,
              stagger: 0.12,
              ease: 'power3.out',
              clearProps: 'all',
            });
            const reveal = node.parentElement?.parentElement?.querySelectorAll(
              '[data-archive-reveal]',
            );
            reveal?.forEach((el) =>
              gsap.from(el, {
                y: 20,
                duration: 0.65,
                ease: 'power3.out',
                scrollTrigger: { trigger: el, start: 'top 93%', once: true },
              }),
            );
          }, node);
          return () => context.revert();
        });
        let frame = 0;
        const objects =
            node.querySelectorAll<HTMLElement>('[data-stage-shift]'),
          moves = [...objects].map((el) => ({
            x: gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' }),
            y: gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' }),
          }));
        const pointer = (event: PointerEvent) => {
          if (
            !matchMedia(
              '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
            ).matches ||
            document.hidden
          )
            return;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const rect = node.getBoundingClientRect(),
              x = ((event.clientX - rect.left) / rect.width - 0.5) * 16,
              y = ((event.clientY - rect.top) / rect.height - 0.5) * 12;
            moves.forEach((move, i) => {
              move.x(x * (1 - i * 0.16));
              move.y(y * (1 - i * 0.16));
            });
          });
        };
        const reset = () =>
          moves.forEach((move) => {
            move.x(0);
            move.y(0);
          });
        node.addEventListener('pointermove', pointer, { passive: true });
        node.addEventListener('pointerleave', reset);
        cleanup = () => {
          cancelAnimationFrame(frame);
          node.removeEventListener('pointermove', pointer);
          node.removeEventListener('pointerleave', reset);
          media.revert();
          gsap.killTweensOf(objects);
        };
      },
    );
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
  return (
    <div className="lra-research-stage" ref={root}>
      {children}
    </div>
  );
}
