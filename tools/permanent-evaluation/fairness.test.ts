import { it, expect } from 'vitest';
import {
  chooseEventAllocation,
  type EventCase,
  type EventCursor,
} from '@capstone/domain/event-allocation-policy';
import type { ReviewerSnapshot } from '@capstone/domain/allocation-policy';
const reviewer: ReviewerSnapshot = {
  id: 'r',
  institution: 'external',
  activeFaculty: true,
  approved: true,
  available: true,
  calibrated: true,
  domains: ['software', 'data'],
  languages: ['en'],
  tags: ['validation'],
  workload: 1,
  lastAssignedAt: null,
  author: false,
  supervisor: false,
  formerSupervisor: false,
  conflict: false,
  committeeConflict: false,
  committeeNameMatch: false,
  committeeNameResolved: false,
  participated: false,
};
const cursor = (): EventCursor => ({
  revision: 0,
  lane: 0,
  domains: {},
  universities: {},
});
function item(
  id: string,
  lane: 'Merit' | 'Discovery',
  domain = 'software',
  university = 'A',
): EventCase {
  return {
    id,
    project: id,
    version: id,
    university,
    domain,
    academicYear: '2026–2027',
    publishedAt: '2026-10-20T00:00:00Z',
    waitingSince: '2026-10-20T00:00:00Z',
    current: true,
    archived: true,
    approved: true,
    compatible: true,
    supervisor: {
      quarterPoints: lane === 'Merit' ? 400 : 300,
      levels: Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [
          'C' + (i + 1),
          lane === 'Merit' ? 4 : 3,
        ]),
      ),
    },
    committee: {
      quarterPoints: 300,
      levels: Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => ['C' + (i + 1), 3]),
      ),
    },
    packet: 'packet',
    packetReadable: true,
    hold: false,
    discrepancy: false,
    explained: true,
    tags: ['validation'],
    languages: ['en'],
    admittedAt: null,
    lane: null,
    completed: 0,
    initialHistory: 0,
    active: 0,
    expansionReady: false,
    expansionActive: false,
    nextSlot: 1,
    eventLane: lane,
    eventEligibleAt: '2026-10-20T00:00:00Z',
    reviewers: [reviewer],
    represented: [],
  };
}
it('retains the reasoned M,M,D,M,X rotation only when lawful demands actually compete for capacity', () => {
  const m = item('m', 'Merit'),
    d = item('d', 'Discovery'),
    x = {
      ...item('x', 'Merit'),
      completed: 2,
      nextSlot: 3,
      expansionReady: true,
    },
    state = cursor(),
    lanes = [];
  for (let i = 0; i < 5; i++) {
    const choice = chooseEventAllocation([m, d], [x], state)!;
    lanes.push(choice.lane);
    state.lane = choice.nextLane;
    state.domains[choice.lane] = choice.case.domain;
    state.universities[choice.lane + ':' + choice.case.domain] =
      choice.case.university;
  }
  expect(lanes).toEqual(['Merit', 'Merit', 'Discovery', 'Merit', 'Expansion']);
});
it('rotates lawful domains and universities with persistent cursors under genuine contention', () => {
  const a = item('a', 'Merit', 'software', 'A'),
    b = item('b', 'Merit', 'software', 'B'),
    c = item('c', 'Merit', 'data', 'A'),
    state = cursor();
  state.domains.Merit = 'data';
  state.universities['Merit:software'] = 'A';
  expect(chooseEventAllocation([a, b, c], [], state)!.case.id).toBe('b');
  state.domains.Merit = 'software';
  expect(chooseEventAllocation([a, b, c], [], state)!.case.id).toBe('c');
});
it('never makes a healthy first pair wait for an expansion pattern turn, and preserves a started pair despite a low first result', () => {
  const p = item('p', 'Discovery'),
    x = {
      ...item('x', 'Merit'),
      completed: 2,
      nextSlot: 3,
      expansionReady: true,
    },
    state = cursor();
  state.lane = 4;
  p.reviewers = [
    { ...reviewer, workload: 0 },
    { ...reviewer, id: 'r2', workload: 0 },
  ];
  x.reviewers = p.reviewers;
  expect(chooseEventAllocation([p], [x], state)!.case.id).toBe('p');
  const half = { ...item('half', 'Discovery'), completed: 1, nextSlot: 2 };
  expect(
    chooseEventAllocation([item('new', 'Merit'), half], [x], state)!.case.id,
  ).toBe('half');
});
