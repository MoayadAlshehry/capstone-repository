import type { AISource } from './types';
/** Keep original vector indices while constraining the candidate population. */
export function scopedIndexEntries(
  sources: AISource[],
  vectors: Float32Array[],
  fileId?: string,
) {
  return sources
    .map((source, i) => ({ source, vector: vectors[i]! }))
    .filter(({ source }) => !fileId || source.file === fileId);
}
