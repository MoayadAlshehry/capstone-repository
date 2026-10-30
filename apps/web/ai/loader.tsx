'use client';
import { useEffect, useState } from 'react';
import { GenerationLoader } from '@/components/assistant-ui/elements/loading-state';
/** Upstream animation clock exists only while a genuine request is waiting. */
export function RequestLoader({ label }: { label: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setTick((x) => x + 1), 120);
    return () => clearInterval(timer);
  }, []);
  return (
    <GenerationLoader
      className="ai-loader"
      label={label}
      tick={tick}
      role="status"
      aria-live="polite"
    />
  );
}
