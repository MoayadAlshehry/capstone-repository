'use client';
import type { AIEvent } from './types';
/** The application SSE contract stays authoritative. Runtime adapters consume
 * validated paragraphs and app-owned evidence; they never contact the model. */
export async function* aiStream(
  body: Record<string, unknown>,
  signal: AbortSignal,
): AsyncGenerator<AIEvent> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { code?: string };
    if (data.code === 'DISABLED')
      dispatchEvent(new Event('capstone-ai-disabled'));
    if (data.code === 'SOURCE_CHANGED')
      dispatchEvent(new Event('capstone-ai-context-changed'));
    throw Error(data.code ?? 'UNAVAILABLE');
  }
  if (!response.body) throw Error('UNAVAILABLE');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    ended = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as AIEvent;
        if (event.type === 'error' && event.code === 'DISABLED')
          dispatchEvent(new Event('capstone-ai-disabled'));
        if (event.type === 'error' && event.code === 'SOURCE_CHANGED')
          dispatchEvent(new Event('capstone-ai-context-changed'));
        if (signal.aborted) return;
        if (event.type === 'done' || event.type === 'error') ended = true;
        yield event;
      }
    }
    if (!ended && !signal.aborted) throw Error('STREAM_INTERRUPTED');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
