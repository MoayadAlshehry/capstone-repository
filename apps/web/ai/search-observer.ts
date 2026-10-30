import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { writeFile, rename } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
type Phase =
  'interpretation' | 'queryEmbedding' | 'indexEmbedding' | 'adjudication';
const context = new AsyncLocalStorage<Phase>();
const observed = new AsyncLocalStorage<boolean>();
export const observeSearch = <T>(work: () => Promise<T>) =>
  observed.run(true, work);
export async function countSearchRetrieval() {
  if (observed.getStore()) await searchCount('projectRetrieval');
}
const counts = {
  interpretation: 0,
  queryEmbedding: 0,
  indexEmbedding: 0,
  adjudication: 0,
  projectRetrieval: 0,
  searchRequests: 0,
  projectionRequests: 0,
  coalesced: 0,
};
let sequence = Promise.resolve();
export function searchCounters() {
  return { ...counts };
}
export async function searchCount(name: keyof typeof counts) {
  counts[name]++;
  const file = process.env['CAPSTONE_AI_SEARCH_TRACE_FILE'];
  // Operator-only test instrumentation; no debug route, prompts or identities.
  if (process.env['APP_ENV'] === 'test' && file && isAbsolute(file)) {
    const value = JSON.stringify({
      pid: process.pid,
      at: new Date().toISOString(),
      counters: counts,
    });
    sequence = sequence
      .catch(() => {})
      .then(async () => {
        await writeFile(file + '.tmp', value, { mode: 0o600 });
        await rename(file + '.tmp', file);
      });
    await sequence;
  }
}
export const searchPhase = <T>(phase: Phase, work: () => Promise<T>) =>
  context.run(phase, work);
export async function countSearchEndpoint() {
  const phase = context.getStore();
  if (phase) await searchCount(phase);
}
