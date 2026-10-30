import type {
  SemesterFile,
  SemesterState,
  SemesterCollection,
} from '@capstone/domain';
export function initialEvidence(files: SemesterFile[], saved?: string) {
  return (
    files.find((f) => f.id === saved) ??
    [...files]
      .sort(
        (a, b) =>
          Number(!/\.(tsx?|jsx?|py|html|css|json)$/i.test(a.path ?? '')) -
          Number(!/\.(tsx?|jsx?|py|html|css|json)$/i.test(b.path ?? '')),
      )
      .find((f) => /pdf|text|json|javascript|image/.test(f.mime))
  );
}
export function projectTask(state: SemesterState, finalReady: boolean) {
  if (state.final && !state.editable) return 'record';
  if (state.lifecycle === 'awaiting_review') return 'checkpoint';
  if (state.lifecycle === 'final_revision') return 'revision';
  if (finalReady && state.role === 'lead') return 'final';
  if (state.lifecycle === 'changes_requested') return 'feedback';
  return !state.files.length
    ? 'files'
    : state.role === 'author'
      ? 'files'
      : 'details';
}
export function collectionCategory(
  item: SemesterCollection['items'][number],
  faculty: boolean,
) {
  if (['archived', 'retained'].includes(item.lifecycle)) return 'completed';
  if (item.lifecycle === 'final_pending')
    return faculty ? (item.finalTask ?? 'assessment') : 'final';
  if (item.lifecycle === 'awaiting_review') return 'checkpoint';
  if (
    (!faculty && item.finalReady) ||
    ['changes_requested', 'final_revision'].includes(item.lifecycle)
  )
    return 'action';
  return 'progress';
}
