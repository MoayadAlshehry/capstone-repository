import {
  matchReviewers,
  type AllocationCase,
  type ReviewerSnapshot,
} from './allocation-policy.js';
export interface EventCase extends AllocationCase {
  eventLane: 'Merit' | 'Discovery' | null;
  eventEligibleAt: string | null;
  reviewers: ReviewerSnapshot[];
  represented: string[];
}
export interface EventCursor {
  revision: number;
  lane: number;
  domains: Record<string, string>;
  universities: Record<string, string>;
}
const pattern = ['Merit', 'Merit', 'Discovery', 'Merit', 'Expansion'] as const;
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function successor(values: string[], after: string | undefined) {
  const list = [...new Set(values)].sort(order);
  return (
    list.find((x) => after === undefined || order(x, after) > 0) ?? list[0]!
  );
}
/** Replayable V3 choice. Classification never becomes an eligibility or operator-admission gate. */
export function chooseEventAllocation<T extends EventCase>(
  initial: T[],
  expansion: T[],
  cursor: EventCursor,
) {
  const rows = [
    ...initial.map((c) => ({
      c,
      lane: c.eventLane ?? ('Discovery' as string),
      match: matchReviewers(c, c.reviewers, c.represented),
    })),
    ...expansion.map((c) => ({
      c,
      lane: 'Expansion',
      match: matchReviewers(c, c.reviewers, c.represented),
    })),
  ].filter((r) => r.match.selected);
  if (!rows.length) return null;
  const capacities = new Map<string, number>();
  for (const r of rows)
    for (const candidate of r.match.eligible)
      capacities.set(candidate.reviewer, Math.max(0, 2 - candidate.workload));
  const need = rows.reduce(
      (n, r) =>
        n +
        (r.lane === 'Expansion'
          ? 1
          : Math.max(0, 2 - r.c.active - r.c.completed)),
      0,
    ),
    contended = need > [...capacities.values()].reduce((n, x) => n + x, 0);
  const halves = rows.filter(
    (r) => r.lane !== 'Expansion' && r.c.active + r.c.completed > 0,
  );
  let pool = halves.length ? halves : rows,
    nextLane = cursor.lane;
  if (contended && !halves.length) {
    for (let offset = 0; offset < 5; offset++) {
      const at = (cursor.lane + offset) % 5,
        available = rows.filter((r) => r.lane === pattern[at]);
      if (available.length) {
        pool = available;
        nextLane = (at + 1) % 5;
        break;
      }
    }
  } else if (!halves.length) {
    const first = rows.filter((r) => r.lane !== 'Expansion');
    if (first.length) pool = first;
  }
  if (contended || halves.length) {
    const domain = successor(
        pool.map((r) => r.c.domain),
        cursor.domains[pool[0]!.lane],
      ),
      domains = pool.filter((r) => r.c.domain === domain),
      university = successor(
        domains.map((r) => r.c.university),
        cursor.universities[domains[0]!.lane + ':' + domain],
      );
    pool = domains.filter((r) => r.c.university === university);
  }
  pool.sort(
    (a, b) =>
      (a.lane === 'Expansion' && b.lane === 'Expansion'
        ? a.c.completed - b.c.completed
        : 0) ||
      Date.parse(a.c.eventEligibleAt ?? a.c.waitingSince) -
        Date.parse(b.c.eventEligibleAt ?? b.c.waitingSince) ||
      order(a.c.id, b.c.id),
  );
  const chosen = pool[0]!;
  if (!(contended && !halves.length)) {
    for (let offset = 0; offset < 5; offset++) {
      const at = (cursor.lane + offset) % 5;
      if (pattern[at] === chosen.lane) {
        nextLane = (at + 1) % 5;
        break;
      }
    }
  }
  return {
    case: chosen.c,
    reviewer: chosen.match.selected!.reviewer,
    lane: chosen.lane,
    nextLane,
    contended,
    matchReasons: chosen.match.reasons,
    cursorBefore: cursor,
  };
}
