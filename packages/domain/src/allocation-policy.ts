import config from './eval-policy-v1.json' with { type: 'json' };
/** Governance-private deterministic policy inputs. Never serialize into reviewer DTOs. */
export const allocationLanes = ['Merit', 'Discovery', 'Expansion'] as const;
export type AllocationLane = (typeof allocationLanes)[number];
export const allocationPattern = [
  'Merit',
  'Merit',
  'Discovery',
  'Merit',
  'Expansion',
] as const;
export const allocationStates = [
  'awaiting_internal',
  'awaiting_eligibility',
  'queued_initial',
  'reviewing_initial',
  'queued_expansion',
  'reviewing_expansion',
  'paused_quality',
  'paused_access',
  'held',
  'completed_limit',
  'superseded',
] as const;
export const policyConstants = Object.freeze({
  code: 'EVAL_POLICY_V1',
  internalFloor20: 1400,
  committeeFloor4: 260,
  meritFloor20: 1600,
  minimumCohort: 10,
  agingMilliseconds: 30 * 86400000,
  capacity: 2,
  offerDays: 7,
  taskDays: 14,
});
export type InternalForm = {
  quarterPoints: number;
  levels: Record<string, number>;
};
export type AllocationCase = {
  id: string;
  project: string;
  version: string;
  university: string;
  domain: string;
  academicYear: string;
  publishedAt: string;
  waitingSince: string;
  current: boolean;
  archived: boolean;
  approved: boolean;
  compatible: boolean;
  supervisor: InternalForm | null;
  committee: InternalForm | null;
  packet: string | null;
  packetReadable: boolean;
  hold: boolean;
  discrepancy: boolean;
  explained: boolean;
  tags: string[];
  languages: string[];
  admittedAt: string | null;
  lane: AllocationLane | null;
  completed: number;
  initialHistory: number;
  active: number;
  expansionReady: boolean;
  expansionActive: boolean;
  nextSlot?: number | null;
  progression?: {
    state: string;
    n: number;
    sumQuarterPoints: number;
    rangeQuarterPoints: number | null;
    threshold: number | null;
    activeInitial: number;
    activeExpansion: number;
    reasons: string[];
    run: string;
  };
};
const codeOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const epoch = (s: string) => {
  const n = Date.parse(s);
  if (!Number.isFinite(n)) throw Error('INVALID_POLICY_TIME');
  return n;
};
function formValid(f: InternalForm | null): f is InternalForm {
  return (
    f !== null &&
    Number.isInteger(f.quarterPoints) &&
    f.quarterPoints >= 0 &&
    f.quarterPoints <= 400 &&
    Array.from({ length: 7 }, (_, i) => f.levels['C' + (i + 1)]).every(
      (x) => Number.isInteger(x) && x! >= 0 && x! <= 4,
    ) &&
    [10, 20, 20, 20, 15, 10, 5].reduce(
      (s, w, i) => s + w * f.levels['C' + (i + 1)]!,
      0,
    ) === f.quarterPoints
  );
}
/** Internal score in exact twentieths. Priority in exact fortieths. */
export function policyValues(c: AllocationCase) {
  if (!formValid(c.supervisor) || !formValid(c.committee))
    throw Error('INCOMPLETE_INTERNAL');
  const s = c.supervisor,
    t = c.committee,
    combined = (k: string) => 2 * s.levels[k]! + 3 * t.levels[k]!;
  const internal20 = 2 * s.quarterPoints + 3 * t.quarterPoints;
  return {
    internal20,
    committee4: t.quarterPoints,
    priority40:
      internal20 + 40 * combined('C5') + 30 * (combined('C4') + combined('C6')),
  };
}
export function eligibilityReasons(c: AllocationCase): string[] {
  const r: string[] = [];
  if (!c.current) r.push('superseded_case');
  if (!c.archived) r.push('not_archived');
  if (!c.approved) r.push('unapproved_submission');
  if (!c.compatible) r.push('incompatible_cohort');
  if (!formValid(c.supervisor) || !formValid(c.committee))
    r.push('incomplete_internal');
  else {
    const v = policyValues(c);
    if (v.internal20 < 1400) r.push('internal_floor');
    if (v.committee4 < 260) r.push('committee_floor');
    for (const [name, f] of [
      ['supervisor', c.supervisor],
      ['committee', c.committee],
    ] as const)
      for (const k of ['C3', 'C4'])
        if (f.levels[k]! < 2) r.push(name + '_' + k.toLowerCase() + '_floor');
  }
  if (!c.packet || !c.packetReadable) r.push('packet_unavailable');
  if (c.hold) r.push('governance_hold');
  if (c.discrepancy && !c.explained) r.push('discrepancy_explanation_required');
  return r;
}
export function cohortSnapshot(
  c: AllocationCase,
  population: AllocationCase[],
) {
  const rows = population
    .filter(
      (x) =>
        x.current &&
        x.archived &&
        x.approved &&
        x.compatible &&
        x.domain === c.domain &&
        x.academicYear === c.academicYear &&
        formValid(x.supervisor) &&
        formValid(x.committee),
    )
    .map((x) => ({
      case: x.id,
      internal20: policyValues(x).internal20,
      publishedAt: x.publishedAt,
    }));
  rows.sort(
    (a, b) =>
      b.internal20 - a.internal20 ||
      epoch(a.publishedAt) - epoch(b.publishedAt) ||
      codeOrder(a.case, b.case),
  );
  return {
    domain: c.domain,
    academicYear: c.academicYear,
    N: rows.length,
    quota: rows.length >= 10 ? Math.ceil(rows.length / 5) : 0,
    rows,
  };
}
export function admission(c: AllocationCase, population: AllocationCase[]) {
  const reasons = eligibilityReasons(c),
    cohort = cohortSnapshot(c, population);
  const rank = cohort.rows.findIndex((x) => x.case === c.id) + 1;
  const percentile = cohort.N >= 10 && rank > 0 && rank <= cohort.quota;
  const lane: AllocationLane | null = reasons.length
    ? null
    : c.admittedAt && c.lane
      ? c.lane
      : policyValues(c).internal20 >= 1600 || percentile
        ? 'Merit'
        : 'Discovery';
  return {
    eligible: reasons.length === 0,
    reasons,
    lane,
    cohort,
    percentile,
    values:
      formValid(c.supervisor) && formValid(c.committee)
        ? policyValues(c)
        : null,
  };
}
export type ReviewerSnapshot = {
  id: string;
  institution: string;
  activeFaculty: boolean;
  approved: boolean;
  available: boolean;
  calibrated: boolean;
  domains: string[];
  languages: string[];
  tags: string[];
  workload: number;
  lastAssignedAt: string | null;
  author: boolean;
  supervisor: boolean;
  formerSupervisor: boolean;
  conflict: boolean;
  committeeConflict: boolean;
  committeeNameMatch: boolean;
  committeeNameResolved: boolean;
  participated: boolean;
};
export function reviewerReasons(c: AllocationCase, r: ReviewerSnapshot) {
  const out: string[] = [];
  if (!r.activeFaculty) out.push('inactive_faculty');
  if (!r.approved) out.push('unapproved_reviewer');
  if (!r.available) out.push('reviewer_unavailable');
  if (!r.calibrated) out.push('calibration_required');
  if (r.institution === c.university) out.push('same_project_university');
  if (!r.domains.includes(c.domain)) out.push('domain_mismatch');
  if (!r.languages.some((l) => c.languages.includes(l)))
    out.push('language_mismatch');
  if (r.workload >= 2) out.push('reviewer_capacity_full');
  if (
    r.author ||
    r.supervisor ||
    r.formerSupervisor ||
    r.conflict ||
    r.committeeConflict
  )
    out.push('conflict_relation');
  if (r.committeeNameMatch && !r.committeeNameResolved)
    out.push('committee_verification_hold');
  if (r.participated) out.push('same_case_participation');
  return out;
}
export function exactTagOverlap(a: string[], b: string[]) {
  const normalize = (x: string) => x.normalize('NFC').trim().toLowerCase();
  const right = new Set(b.map(normalize));
  return new Set(a.map(normalize).filter((x) => right.has(x))).size;
}
export function matchReviewers(
  c: AllocationCase,
  reviewers: ReviewerSnapshot[],
  represented: string[],
) {
  const candidates = reviewers.map((r) => ({
    reviewer: r.id,
    institution: r.institution,
    reasons: reviewerReasons(c, r),
    overlap: exactTagOverlap(c.tags, r.tags),
    workload: r.workload,
    lastAssignedAt: r.lastAssignedAt,
    represented: represented.includes(r.institution),
  }));
  const eligible = candidates
    .filter((r) => r.reasons.length === 0)
    .sort(
      (a, b) =>
        Number(a.represented) - Number(b.represented) ||
        b.overlap - a.overlap ||
        a.workload - b.workload ||
        (a.lastAssignedAt === null ? -Infinity : epoch(a.lastAssignedAt)) -
          (b.lastAssignedAt === null ? -Infinity : epoch(b.lastAssignedAt)) ||
        codeOrder(a.reviewer, b.reviewer),
    );
  const selected = eligible[0] ?? null;
  return {
    candidates,
    eligible,
    selected,
    reasons: selected
      ? selected.represented
        ? ['same_external_university_fallback']
        : []
      : ['no_lawful_candidate'],
  };
}
export type AllocationCursor = {
  lane: number;
  domains: Partial<Record<AllocationLane, string>>;
  universities: Record<string, string>;
};
function rotate(values: string[], after: string | undefined) {
  const a = [...new Set(values)].sort(codeOrder);
  const next =
    after === undefined ? 0 : a.findIndex((x) => codeOrder(x, after) > 0);
  const at = next < 0 ? 0 : next;
  return [...a.slice(at), ...a.slice(0, at)];
}
export type ReadyDemand = {
  case: AllocationCase;
  lane: AllocationLane;
  reviewers: ReviewerSnapshot[];
  represented: string[];
};
/** Owner clarification: [0,5), ... [90,95), [95,100], higher first. */
export function meritBand(priority40: number): number {
  if (!Number.isInteger(priority40) || priority40 < 0 || priority40 > 4000)
    throw Error('INVALID_PRIORITY');
  return Math.min(19, Math.floor(priority40 / 200));
}
/** Pure replay of the immutable EVAL_POLICY_V1 selection rules. */
export function selectAllocation(
  demand: ReadyDemand[],
  cursor: AllocationCursor,
  now: string,
  band: (priority40: number) => number = meritBand,
) {
  if (!Number.isInteger(cursor.lane) || cursor.lane < 0 || cursor.lane > 4)
    throw Error('INVALID_CURSOR');
  const skips: { scope: string; value: string; reason: string }[] = [];
  const lawful = demand
    .filter(
      (d) =>
        eligibilityReasons(d.case).length === 0 &&
        (d.lane === 'Expansion'
          ? d.case.expansionReady &&
            d.case.completed >= 2 &&
            d.case.active === 0
          : (d.case.nextSlot === undefined
              ? d.case.initialHistory < 2
              : d.case.nextSlot !== null && d.case.nextSlot <= 2) &&
            d.case.completed < 2 &&
            d.case.active < 2),
    )
    .map((d) => ({
      ...d,
      match: matchReviewers(d.case, d.reviewers, d.represented),
    }));
  for (let offset = 0; offset < 5; offset++) {
    const index = (cursor.lane + offset) % 5,
      lane = allocationPattern[index]!;
    const all = lawful.filter((d) => d.lane === lane),
      ready = all.filter((d) => d.match.selected !== null);
    if (!ready.length) {
      skips.push({
        scope: 'lane',
        value: lane,
        reason: all.length ? 'lane_unmatchable' : 'lane_unavailable',
      });
      continue;
    }
    for (const d of [...new Set(all.map((x) => x.case.domain))].sort(
      codeOrder,
    )) {
      if (!ready.some((x) => x.case.domain === d))
        skips.push({ scope: 'domain', value: d, reason: 'domain_unavailable' });
      for (const u of [
        ...new Set(
          all.filter((x) => x.case.domain === d).map((x) => x.case.university),
        ),
      ].sort(codeOrder))
        if (!ready.some((x) => x.case.domain === d && x.case.university === u))
          skips.push({
            scope: 'university',
            value: u,
            reason: 'university_unavailable',
          });
    }
    const domains = rotate(
        ready.map((d) => d.case.domain),
        cursor.domains[lane],
      ),
      domain = domains[0]!;
    const key = lane + ':' + domain,
      universities = rotate(
        ready
          .filter((d) => d.case.domain === domain)
          .map((d) => d.case.university),
        cursor.universities[key],
      ),
      university = universities[0]!;
    const cases = ready.filter(
      (d) => d.case.domain === domain && d.case.university === university,
    );
    cases.sort((a, b) => {
      const x = a.case,
        y = b.case,
        wait = epoch(x.waitingSince) - epoch(y.waitingSince),
        stable = codeOrder(x.id, y.id);
      if (lane === 'Expansion')
        return x.completed - y.completed || wait || stable;
      const pair =
        Number(y.admittedAt !== null && y.completed < 2) -
        Number(x.admittedAt !== null && x.completed < 2);
      if (pair) return pair;
      if (lane === 'Merit') {
        const aged = (c: AllocationCase) =>
          epoch(now) - epoch(c.waitingSince) >=
          policyConstants.agingMilliseconds;
        return (
          Number(aged(y)) - Number(aged(x)) ||
          band(policyValues(y).priority40) - band(policyValues(x).priority40) ||
          wait ||
          stable
        );
      }
      return wait || stable;
    });
    const selected = cases[0]!;
    const after: AllocationCursor = {
      lane: (index + 1) % 5,
      domains: { ...cursor.domains, [lane]: domain },
      universities: { ...cursor.universities, [key]: university },
    };
    return { selected, cursorBefore: cursor, cursorAfter: after, skips };
  }
  return { selected: null, cursorBefore: cursor, cursorAfter: cursor, skips };
}

/** Positive allowlist: private qualification/protected/popularity inputs are excluded. */
export function policyCaseInput(
  c: AllocationCase & { reviewers: ReviewerSnapshot[]; represented: string[] },
) {
  const keys = [
    'id',
    'project',
    'version',
    'university',
    'domain',
    'academicYear',
    'publishedAt',
    'waitingSince',
    'current',
    'archived',
    'approved',
    'compatible',
    'supervisor',
    'committee',
    'packet',
    'packetReadable',
    'hold',
    'discrepancy',
    'explained',
    'tags',
    'languages',
    'admittedAt',
    'lane',
    'completed',
    'initialHistory',
    'active',
    'expansionReady',
    'expansionActive',
    'nextSlot',
    'progression',
  ] as const;
  const reviewerKeys = [
    'id',
    'institution',
    'activeFaculty',
    'approved',
    'available',
    'calibrated',
    'domains',
    'languages',
    'tags',
    'workload',
    'lastAssignedAt',
    'author',
    'supervisor',
    'formerSupervisor',
    'conflict',
    'committeeConflict',
    'committeeNameMatch',
    'committeeNameResolved',
    'participated',
  ] as const;
  return {
    ...Object.fromEntries(keys.map((k) => [k, c[k]])),
    represented: c.represented,
    reviewers: c.reviewers.map((r) =>
      Object.fromEntries(reviewerKeys.map((k) => [k, r[k]])),
    ),
  };
}

export function policyConfigMatches(value: unknown): boolean {
  const canonical = (v: unknown): string =>
    Array.isArray(v)
      ? '[' + v.map(canonical).join(',') + ']'
      : v !== null && typeof v === 'object'
        ? '{' +
          Object.keys(v)
            .sort()
            .map(
              (k) =>
                JSON.stringify(k) +
                ':' +
                canonical((v as Record<string, unknown>)[k]),
            )
            .join(',') +
          '}'
        : JSON.stringify(v);
  return canonical(value) === canonical(config);
}
