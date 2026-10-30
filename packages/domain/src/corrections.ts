import { progressionDecision } from './progression-policy.js';

export type AssessmentRevision = {
  id: string;
  logical: string;
  case: string;
  evaluator: string;
  rubric: string;
  revision: number;
  supersedes: string | null;
  issue: string | null;
  quarterPoints: number;
};
/** Validate the complete append-only chain before selecting its current head. */
export function latestValidAssessments(
  rows: readonly AssessmentRevision[],
  invalidated: ReadonlySet<string>,
) {
  const ids = new Map<string, AssessmentRevision>();
  const heads = new Map<string, AssessmentRevision>();
  for (const r of [...rows].sort(
    (a, b) => a.revision - b.revision || a.id.localeCompare(b.id),
  )) {
    if (
      ids.has(r.id) ||
      !Number.isInteger(r.quarterPoints) ||
      r.quarterPoints < 0 ||
      r.quarterPoints > 400 ||
      !Number.isInteger(r.revision) ||
      r.revision < 0
    )
      throw Error('INVALID_REVISION');
    const previous = heads.get(r.logical);
    if (!previous) {
      if (
        r.revision !== 0 ||
        r.id !== r.logical ||
        r.supersedes !== null ||
        r.issue !== null
      )
        throw Error('BROKEN_ORIGINAL');
    } else if (
      r.revision !== previous.revision + 1 ||
      r.supersedes !== previous.id ||
      !r.issue ||
      r.case !== previous.case ||
      r.evaluator !== previous.evaluator ||
      r.rubric !== previous.rubric
    )
      throw Error('BROKEN_SUPERSESSION');
    ids.set(r.id, r);
    heads.set(r.logical, r);
  }
  return [...heads.values()]
    .filter((r) => !invalidated.has(r.logical))
    .sort((a, b) => a.logical.localeCompare(b.logical));
}
/** A revision replaces one logical evaluator; it never supplies another slot. */
export function correctedExternalProjection(
  rows: readonly AssessmentRevision[],
  invalidated: ReadonlySet<string>,
  previousPaused: boolean,
  authorizedExternalChange: boolean,
) {
  const current = latestValidAssessments(rows, invalidated);
  if (
    new Set(current.map((r) => r.evaluator)).size !== current.length ||
    new Set(current.map((r) => r.case)).size > 1
  )
    throw Error('INVALID_INDEPENDENCE');
  const progression = progressionDecision(
    current.map((r) => r.quarterPoints),
    previousPaused && !authorizedExternalChange,
  );
  return { current, progression, feedbackReleased: current.length >= 2 };
}
