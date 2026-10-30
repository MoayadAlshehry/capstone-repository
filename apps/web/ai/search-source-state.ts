import 'server-only';
import type { NativeFile } from '@capstone/domain';
import { nativeReader } from '../native-files/server';
import { digest } from './core';
import { AIError } from './types';
export type SearchSourceStates = Record<
  string,
  { version: string; files: string }
>;
export function publicFileSignature(files: NativeFile[]) {
  return digest(
    files
      .map((f) => [f.id, f.sha256, f.size, f.path, f.visibility, f.status])
      .sort(),
  );
}
/** No extraction, embedding or RAG. Check current public ACL/content through
 * the same native manifest service used by the reader. Include non-matches:
 * newly public evidence may legitimately turn a former zero into a match. */
export async function searchSourcesCurrent(
  states: SearchSourceStates | undefined,
) {
  if (!states || Object.keys(states).length > 96) return false;
  const entries = Object.entries(states),
    reader = await nativeReader();
  for (let i = 0; i < entries.length; i += 4) {
    const valid = await Promise.all(
      entries.slice(i, i + 4).map(async ([project, state]) => {
        try {
          return (
            publicFileSignature(
              await reader.list({ kind: 'public' }, project, state.version),
            ) === state.files
          );
        } catch (error) {
          if (
            error instanceof AIError &&
            [
              'NOT_FOUND',
              'SOURCE_CHANGED',
              'REVIEW_CONTEXT_RESTRICTED',
            ].includes(error.code)
          )
            return false;
          throw error;
        }
      }),
    );
    if (valid.some((v) => !v)) return false;
  }
  return true;
}
