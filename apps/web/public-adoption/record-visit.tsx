'use client';
import { useEffect } from 'react';
/** Counts a visible public record visit, never navigation prefetch or identified automation. */
export function RecordVisit({
  project,
  version,
}: {
  project: string;
  version: string;
}) {
  useEffect(() => {
    if (navigator.webdriver) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined,
      done = false,
      fetching = false,
      nonce: string | null = null;
    async function arm() {
      clearTimeout(timer);
      if (
        done ||
        fetching ||
        controller.signal.aborted ||
        document.visibilityState !== 'visible'
      )
        return;
      if (!nonce || Date.now() - Number(nonce.split('.')[0]) > 240000) {
        fetching = true;
        try {
          const response = await fetch(
            '/api/public-engagement?' +
              new URLSearchParams({ project, version }),
            { cache: 'no-store', signal: controller.signal },
          );
          if (!response.ok || response.status === 204) {
            done = true;
            return;
          }
          const data = (await response.json()) as { nonce: string };
          nonce = data.nonce;
        } catch {
          done = true;
          return;
        } finally {
          fetching = false;
        }
        if (document.visibilityState !== 'visible' || controller.signal.aborted)
          return;
      }
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible' || controller.signal.aborted)
          return;
        done = true;
        void fetch('/api/public-engagement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project, version, nonce }),
          signal: controller.signal,
        }).catch(() => {});
      }, 2100);
    }
    const visible = () => {
      if (document.visibilityState !== 'visible') clearTimeout(timer);
      else void arm();
    };
    document.addEventListener('visibilitychange', visible);
    void arm();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [project, version]);
  return null;
}
