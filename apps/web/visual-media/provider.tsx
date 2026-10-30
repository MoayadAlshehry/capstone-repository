'use client';
import type { ReactNode } from 'react';
import {
  VisualMediaProvider,
  type VisualTargetView,
  type VisualStateView,
} from '@capstone/ui/visual-media';
async function resolve(
  targets: VisualTargetView[],
): Promise<(VisualStateView | null)[]> {
  const response = await fetch('/api/visual-media/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets }),
    cache: 'no-store',
  });
  if (!response.ok) throw Error('MEDIA_UNAVAILABLE');
  const body = (await response.json()) as { items: (VisualStateView | null)[] };
  if (!Array.isArray(body.items) || body.items.length !== targets.length)
    throw Error('MEDIA_UNAVAILABLE');
  return body.items;
}
export function VisualMediaRoot({ children }: { children: ReactNode }) {
  return (
    <VisualMediaProvider resolve={resolve}>{children}</VisualMediaProvider>
  );
}
