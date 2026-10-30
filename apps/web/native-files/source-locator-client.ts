'use client';
import { useEffect } from 'react';
/** Native viewer positioning is independent of inference and current file
 * authorization. No source content is copied into URLs or interpreted as code. */
export function useSourceLocator(
  root: HTMLElement | null,
  key: string,
  ready: boolean,
  requested: string | null,
) {
  useEffect(() => {
    const line = Number(requested);
    if (
      !ready ||
      !Number.isSafeInteger(line) ||
      line < 1 ||
      line > 1_000_000 ||
      !root
    )
      return;
    let target: HTMLElement | null = null;
    const seek = () => {
      const matches = Array.from(
        root.querySelectorAll<HTMLElement>('[data-source-line-start]') ?? [],
      )
        .map((el) => ({
          el,
          start: Number(el.dataset['sourceLineStart']),
          end: Number(el.dataset['sourceLineEnd']),
        }))
        .filter((x) => x.start <= line && x.end >= line)
        .sort((a, b) => a.end - a.start - (b.end - b.start));
      if (!matches[0]) return;
      const next = matches[0].el;
      if (target === next && next.classList.contains('ci-evidence-target'))
        return;
      target?.classList.remove('ci-evidence-target');
      target = next;
      target.classList.add('ci-evidence-target');
      target.tabIndex = -1;
      target.scrollIntoView({ block: 'center', behavior: 'auto' });
      target.focus({ preventScroll: true });
      // Streamed navigation may replace an already positioned paragraph.
      // Keep following the live reader until the locator changes.
    };
    const observer = new MutationObserver(seek);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-source-line-start', 'data-source-line-end'],
    });
    seek();
    return () => {
      observer.disconnect();
      target?.classList.remove('ci-evidence-target');
    };
  }, [root, key, ready, requested]);
}
