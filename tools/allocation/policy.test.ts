import { it, expect } from 'vitest';
import { meritBand } from '../../packages/domain/src/allocation-policy.js';
import {
  admission,
  eligibilityReasons,
  policyValues,
  matchReviewers,
  exactTagOverlap,
  selectAllocation,
  type AllocationCase,
  type ReviewerSnapshot,
  type AllocationCursor,
  type ReadyDemand,
} from '../../packages/domain/src/allocation-policy.js';
const now = '2026-10-07T00:00:00.000Z';
const form = (level = 3) => ({
  quarterPoints: level * 100,
  levels: Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => ['C' + (i + 1), level]),
  ),
});
function c(id = 'case-a', patch: Partial<AllocationCase> = {}): AllocationCase {
  return {
    id,
    project: 'p-' + id,
    version: 'v-' + id,
    university: 'uni-a',
    domain: 'software',
    academicYear: '2026',
    publishedAt: '2026-09-01T00:00:00Z',
    waitingSince: '2026-10-01T00:00:00Z',
    current: true,
    archived: true,
    approved: true,
    compatible: true,
    supervisor: form(),
    committee: form(),
    packet: 'packet-' + id,
    packetReadable: true,
    hold: false,
    discrepancy: false,
    explained: false,
    tags: ['research'],
    languages: ['en'],
    admittedAt: null,
    lane: null,
    completed: 0,
    initialHistory: 0,
    active: 0,
    expansionReady: false,
    expansionActive: false,
    ...patch,
  };
}
function r(
  id = 'reviewer-a',
  patch: Partial<ReviewerSnapshot> = {},
): ReviewerSnapshot {
  return {
    id,
    institution: 'uni-b',
    activeFaculty: true,
    approved: true,
    available: true,
    calibrated: true,
    domains: ['software'],
    languages: ['en'],
    tags: ['research'],
    workload: 0,
    lastAssignedAt: null,
    author: false,
    supervisor: false,
    formerSupervisor: false,
    conflict: false,
    committeeConflict: false,
    committeeNameMatch: false,
    committeeNameResolved: false,
    participated: false,
    ...patch,
  };
}
const cursor: AllocationCursor = { lane: 0, domains: {}, universities: {} };
const demand = (
  item: AllocationCase,
  lane: ReadyDemand['lane'] = 'Merit',
  reviewers = [r()],
): ReadyDemand => ({ case: item, lane, reviewers, represented: [] });
it('exact internal and priority arithmetic preserves quarter points', () => {
  const x = c();
  x.supervisor!.levels.C5 = 4;
  x.supervisor!.quarterPoints += 15;
  expect(policyValues(x)).toEqual({
    internal20: 1530,
    committee4: 300,
    priority40: 3110,
  });
  expect(policyValues(x).priority40 / 40).toBe(77.75);
});
it('new eligible small-cohort case is Discovery; no percentile claim', () => {
  const a = admission(c(), [c()]);
  expect(a.lane).toBe('Discovery');
  expect(a.percentile).toBe(false);
  expect(a.cohort.quota).toBe(0);
});
it.each([9, 10, 11, 15, 16])(
  'cohort %i selects exactly the source quota with stable cutoff ties',
  (n) => {
    const cohort = Array.from({ length: n }, (_, i) =>
      c('case-' + String(i).padStart(2, '0')),
    );
    const ranks = cohort.map((x) => admission(x, cohort));
    expect(ranks.filter((x) => x.percentile)).toHaveLength(
      n < 10 ? 0 : Math.ceil(n / 5),
    );
    expect(ranks[0]!.cohort.rows.map((x) => x.case)).toEqual(
      cohort.map((x) => x.id),
    );
  },
);
it('cohort counts complete compatible current cases despite absolute gate failures', () => {
  const xs = Array.from({ length: 10 }, (_, i) => c('c' + i, { packet: null }));
  expect(admission(xs[0]!, xs).cohort.N).toBe(10);
  expect(admission(xs[0]!, xs).lane).toBeNull();
});
it('earlier publication resolves score ties before stable case ID', () => {
  const x = c('a'),
    y = c('z', { publishedAt: '2026-08-01T00:00:00Z' });
  expect(admission(x, [x, y]).cohort.rows[0]!.case).toBe('z');
});
it('unrounded internal score precedes publication time', () => {
  const x = c('a'),
    y = c('z');
  y.supervisor!.levels.C7 = 4;
  y.supervisor!.quarterPoints += 5;
  expect(admission(x, [x, y]).cohort.rows[0]!.internal20).toBe(1510);
});
it.each([
  'current',
  'archived',
  'approved',
  'compatible',
  'packetReadable',
] as const)('absolute gate %s is never waived by percentile or wait', (k) => {
  const x = c('aged', {
    [k]: false,
    waitingSince: '2025-01-01T00:00:00Z',
    supervisor: form(4),
    committee: form(4),
  });
  expect(admission(x, [x]).lane).toBeNull();
});
it.each([
  { hold: true },
  { packet: null },
  { supervisor: null },
  { committee: null },
  { discrepancy: true, explained: false },
])('blocks incomplete/held state %j', (patch) =>
  expect(eligibilityReasons(c('a', patch)).length).toBeGreaterThan(0),
);
it('institutional explanation never modifies score values', () => {
  const x = c('a', { discrepancy: true, explained: true });
  expect(eligibilityReasons(x)).toEqual([]);
  expect(policyValues(x).internal20).toBe(1500);
});
it.each(['supervisor', 'committee'] as const)(
  '%s C3 and C4 floors cannot be compensated',
  (layer) => {
    for (const code of ['C3', 'C4']) {
      const x = c();
      x[layer]!.levels[code] = 1;
      x[layer]!.quarterPoints -= 40;
      expect(eligibilityReasons(x)).toContain(
        layer + '_' + code.toLowerCase() + '_floor',
      );
    }
  },
);
it('admitted initial lane remains stable across cohort change and a low first external score', () => {
  const x = c('a', {
    lane: 'Discovery',
    admittedAt: '2026-09-01T00:00:00Z',
    completed: 1,
  });
  const xs = Array.from({ length: 10 }, (_, i) => c('b' + i));
  expect(admission(x, [x, ...xs]).lane).toBe('Discovery');
});
it.each([
  { activeFaculty: false },
  { approved: false },
  { available: false },
  { calibrated: false },
  { institution: 'uni-a' },
  { domains: ['hardware'] },
  { languages: ['ar'] },
  { workload: 2 },
  { author: true },
  { supervisor: true },
  { formerSupervisor: true },
  { conflict: true },
  { committeeConflict: true },
  { committeeNameMatch: true },
  { participated: true },
])('hard exclusion %j survives tag advantage', (patch) => {
  expect(
    matchReviewers(c(), [r('a', { ...patch, tags: ['research', 'extra'] })], [])
      .selected,
  ).toBeNull();
});
it('committee-name verification is a hold rather than an identity claim', () => {
  expect(
    matchReviewers(c(), [r('a', { committeeNameMatch: true })], [])
      .candidates[0]!.reasons,
  ).toEqual(['committee_verification_hold']);
  expect(
    matchReviewers(
      c(),
      [r('a', { committeeNameMatch: true, committeeNameResolved: true })],
      [],
    ).selected!.reviewer,
  ).toBe('a');
});
it('different external university takes precedence over tag/workload advantage', () => {
  expect(
    matchReviewers(
      c(),
      [
        r('a', { workload: 0 }),
        r('b', { institution: 'uni-c', tags: [], workload: 1 }),
      ],
      ['uni-b'],
    ).selected!.reviewer,
  ).toBe('b');
});
it('same institution fallback records an explicit reason', () =>
  expect(matchReviewers(c(), [r()], ['uni-b']).reasons).toContain(
    'same_external_university_fallback',
  ));
it('exact normalized intersection does not double-count duplicates or fuzzy matches', () =>
  expect(
    exactTagOverlap(
      [' Research ', 'RESEARCH', 'résumé'],
      ['research', 'resume'],
    ),
  ).toBe(1));
it('after overlap, lower workload precedes last assigned time', () =>
  expect(
    matchReviewers(
      c(),
      [r('a', { workload: 1 }), r('b', { workload: 0, lastAssignedAt: now })],
      [],
    ).selected!.reviewer,
  ).toBe('b'));
it('never-assigned reviewer precedes assigned reviewer; ID resolves null ties', () => {
  expect(
    matchReviewers(c(), [r('a', { lastAssignedAt: now }), r('b')], []).selected!
      .reviewer,
  ).toBe('b');
  expect(matchReviewers(c(), [r('b'), r('a')], []).selected!.reviewer).toBe(
    'a',
  );
});
// Inject a constant band: these tests prove lane/rotation independent of the unresolved band boundary.
it('continuously matchable cycle produces M/M/D/M/X and advances only successful reservations', () => {
  let state = cursor;
  const ds = [
    demand(c('m')),
    demand(c('d'), 'Discovery'),
    demand(c('x', { expansionReady: true, completed: 2 }), 'Expansion'),
  ];
  const lanes = [];
  for (let i = 0; i < 10; i++) {
    const result = selectAllocation(ds, state, now, () => 0);
    lanes.push(result.selected!.lane);
    state = result.cursorAfter;
  }
  expect(lanes).toEqual([
    'Merit',
    'Merit',
    'Discovery',
    'Merit',
    'Expansion',
    'Merit',
    'Merit',
    'Discovery',
    'Merit',
    'Expansion',
  ]);
  expect(state.lane).toBe(0);
});
it('no match retains all cursors; a lawful alternative consumes its actual lane position', () => {
  const initial = { ...cursor, lane: 4 };
  const no = selectAllocation(
    [demand(c(), 'Merit', [])],
    initial,
    now,
    () => 0,
  );
  expect(no.cursorAfter).toEqual(initial);
  const yes = selectAllocation(
    [demand(c(), 'Discovery')],
    initial,
    now,
    () => 0,
  );
  expect(yes.selected!.lane).toBe('Discovery');
  expect(yes.cursorAfter.lane).toBe(3);
  expect(yes.skips.length).toBeGreaterThan(0);
});
it('domain/university turns rotate across currently matchable demand', () => {
  const ds = [
    demand(c('a')),
    demand(c('b', { university: 'uni-c' })),
    demand(c('c', { domain: 'data' }), 'Merit', [
      r('c', { domains: ['data'] }),
    ]),
  ];
  let state = cursor;
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const result = selectAllocation(ds, state, now, () => 0);
    ids.push(result.selected!.case.id);
    state = result.cursorAfter;
  }
  expect(ids).toEqual(['c', 'a', 'c', 'b']);
});
it('admitted half-pair precedes new cases within its university turn', () => {
  const result = selectAllocation(
    [
      demand(c('new')),
      demand(
        c('half', {
          admittedAt: now,
          completed: 1,
          initialHistory: 1,
          waitingSince: now,
        }),
      ),
    ],
    cursor,
    now,
    () => 0,
  );
  expect(result.selected!.case.id).toBe('half');
});
it('terminal initial slot replacement and unqualified expansion are excluded until Phase31', () => {
  expect(
    selectAllocation(
      [
        demand(c('terminal', { initialHistory: 2, active: 0, completed: 1 })),
        demand(c('x', { completed: 2 }), 'Expansion'),
      ],
      cursor,
      now,
      () => 0,
    ).selected,
  ).toBeNull();
});
it('Discovery uses age and ID, never private priority score', () => {
  const result = selectAllocation(
    [
      demand(
        c('new', { supervisor: form(4), committee: form(4) }),
        'Discovery',
      ),
      demand(c('old', { waitingSince: '2026-09-01T00:00:00Z' }), 'Discovery'),
    ],
    cursor,
    now,
    () => 0,
  );
  expect(result.selected!.case.id).toBe('old');
});
it('thirty-day aging applies at equality ahead of non-aged Merit', () => {
  const x = c('aged', { waitingSince: '2026-09-07T00:00:00Z' }),
    y = c('new', { supervisor: form(4), committee: form(4) });
  expect(
    selectAllocation([demand(y), demand(x)], cursor, now, () => 0).selected!
      .case.id,
  ).toBe('aged');
});

it.each(Array.from({ length: 20 }, (_, i) => i))(
  'band %i exact lower/upper boundaries',
  (i) => {
    expect(meritBand(i * 200)).toBe(i);
    expect(meritBand(i * 200 + 199)).toBe(i);
  },
);
it('P=100 belongs to the inclusive last band', () =>
  expect(meritBand(4000)).toBe(19));
it.each([-1, 4001, NaN, Infinity, 0.5])(
  'invalid fixed-point priority %s is rejected',
  (value) => expect(() => meritBand(value)).toThrow('INVALID_PRIORITY'),
);

it('private policy input allowlist excludes protected, qualification, popularity and file storage data', async () => {
  const { policyCaseInput } =
    await import('../../packages/domain/src/allocation-policy.js');
  const extra = {
    ...c(),
    gender: 'forbidden',
    views: 999,
    files: [{ key: 'private' }],
    qualification: 'secret',
    reviewers: [{ ...r(), qualification: 'private', studentId: 'forbidden' }],
    represented: [],
  };
  expect(JSON.stringify(policyCaseInput(extra))).not.toMatch(
    /gender|views|files|qualification|studentId|private/,
  );
});

it('every immutable configuration field and unknown protected input is checked', async () => {
  const { policyConfigMatches } =
    await import('../../packages/domain/src/allocation-policy.js');
  const { default: cfg } = await import(
    '../../packages/domain/src/eval-policy-v1.json',
    { with: { type: 'json' } }
  );
  expect(policyConfigMatches(cfg)).toBe(true);
  for (const key of Object.keys(cfg))
    expect(policyConfigMatches({ ...cfg, [key]: 'tampered' })).toBe(false);
  expect(policyConfigMatches({ ...cfg, gender: 'forbidden' })).toBe(false);
});
