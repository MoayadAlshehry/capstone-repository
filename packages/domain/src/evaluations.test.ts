import { describe, it, expect } from 'vitest';
import {
  assessmentIssues,
  coreQuarterPoints,
  internalProjection,
  type AssessmentInput,
  type CriterionInput,
} from './evaluations.js';
const file = '00000000-0000-4000-8000-000000000001';
const criteria = (level: number): CriterionInput[] =>
  Array.from({ length: 7 }, (_, i) => ({
    code: 'C' + (i + 1),
    level,
    comment: 'Evidence supports this explicitly scoped result.',
    locators: [{ file, kind: 'section', reference: 'Results 1' }],
  }));
const valid = (
  layer: 'supervisor' | 'committee' = 'supervisor',
): AssessmentInput => ({
  layer,
  criteria: criteria(3),
  overall:
    'The frozen report supports the scoped findings and records material limitations.',
  calibration: true,
  members: layer === 'committee' ? ['Member A', 'Member B'] : [],
  assessedOn: layer === 'committee' ? '2026-10-05' : null,
  attestation: layer === 'committee',
});
describe('exact CORE_V1 assessment', () => {
  it('flags exactly 15 points without needing a two-level criterion difference', () => {
    const c = criteria(3);
    for (const index of [0, 1, 2, 5]) c[index]!.level = 2;
    expect(internalProjection(criteria(3), c)).toMatchObject({
      committee: 60,
      disagreement: true,
    });
  });
  it('does not flag a 13.75 point difference after display rounding', () => {
    const c = criteria(3);
    for (const index of [0, 1, 2, 6]) c[index]!.level = 2;
    expect(internalProjection(criteria(3), c)).toMatchObject({
      committee: 61.25,
      disagreement: false,
    });
  });
  it.each([0, 2, 3, 4])('calculates uniform level %s exactly', (level) =>
    expect(coreQuarterPoints(criteria(level)) / 4).toBe(level * 25),
  );
  it('combines independent layers to 85 and flags total disagreement', () =>
    expect(internalProjection(criteria(4), criteria(3))).toMatchObject({
      supervisor: 100,
      committee: 75,
      internal: 85,
      disagreement: true,
    }));
  it('flags a two-level criterion difference even below 15 points', () => {
    const c = criteria(3);
    c[6]!.level = 1;
    expect(internalProjection(criteria(3), c).disagreement).toBe(true);
  });
  it('does not round a near-boundary disagreement', () => {
    const c = criteria(3);
    c[0]!.level = 2;
    c[1]!.level = 2;
    c[2]!.level = 2;
    expect(internalProjection(criteria(3), c)).toMatchObject({
      committee: 62.5,
      disagreement: false,
    });
  });
  it('requires complete distinct integer criteria', () => {
    for (const bad of [
      criteria(1.5),
      criteria(5),
      criteria(-1),
      criteria(2).slice(1),
      [...criteria(2).slice(1), criteria(2)[1]!],
    ])
      expect(() => coreQuarterPoints(bad)).toThrow();
  });
  it('requires calibration, overall, evidence and extreme justifications', () => {
    const v = valid();
    expect(assessmentIssues(v, '2026-10-05')).toEqual([]);
    v.calibration = false;
    v.overall = 'short';
    v.criteria[0]!.level = 0;
    v.criteria[0]!.comment = '';
    v.criteria[1]!.locators = [];
    expect(assessmentIssues(v, '2026-10-05')).toEqual(
      expect.arrayContaining([
        'CALIBRATION',
        'OVERALL',
        'C1:COMMENT',
        'C2:EVIDENCE',
      ]),
    );
  });
  it('normalizes duplicate committee names and rejects future/impossible dates', () => {
    const v = valid('committee');
    v.members = ['Member A', ' Ｍember   A '];
    v.assessedOn = '2026-10-06';
    v.attestation = false;
    expect(assessmentIssues(v, '2026-10-05')).toEqual(
      expect.arrayContaining(['MEMBERS', 'ASSESSED_ON', 'ATTESTATION']),
    );
    v.assessedOn = '2026-02-30';
    expect(assessmentIssues(v, '2026-10-05')).toContain('ASSESSED_ON');
  });
});
