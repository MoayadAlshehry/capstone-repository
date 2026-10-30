import { expect, it } from 'vitest';
import { correctionForm, decodeRubric } from './types';
import { coreRubric } from '@capstone/domain';
import { externalRubric } from '@capstone/domain/external-reviews';

it('stored correction payloads bind exact layer, codes and levels without invented locators or acknowledgments', () => {
  const original = {
    layer: 'supervisor',
    criteria: Array.from({ length: 7 }, (_, index) => ({
      code: 'C' + (index + 1),
      level: 3,
      comment: '',
      locators: null,
    })),
    overall: '',
    calibration: false,
    members: [],
    assessedOn: null,
    attestation: false,
  };
  const parsed = correctionForm(original, 'supervisor')!;
  expect(
    parsed.criteria.every(
      (criterion) =>
        Array.isArray(criterion.locators) && criterion.locators.length === 0,
    ),
  ).toBe(true);
  expect(parsed.calibration).toBe(false);
  expect(
    original.criteria.every((criterion) => criterion.locators === null),
  ).toBe(true);
  expect(correctionForm(original, 'committee')).toBeNull();
  expect(
    correctionForm(
      {
        ...original,
        criteria: original.criteria.map((criterion) => ({
          ...criterion,
          code: 'C1',
        })),
      },
      'supervisor',
    ),
  ).toBeNull();
  expect(
    correctionForm(
      {
        ...original,
        criteria: original.criteria.map((criterion) => ({
          ...criterion,
          level: 5,
        })),
      },
      'supervisor',
    ),
  ).toBeNull();
  expect(
    correctionForm({ ...original, peerScores: [99] }, 'supervisor'),
  ).toBeNull();
  expect(
    correctionForm(
      {
        ...original,
        criteria: original.criteria.map((criterion) => ({
          ...criterion,
          locators: [{ file: 'wrong', kind: 'invented', reference: 'x' }],
        })),
      },
      'supervisor',
    ),
  ).toBeNull();
});

it('reads the exact installed rubric descriptors and refuses incomplete or fabricated anchors', () => {
  expect(decodeRubric(coreRubric)?.code).toBe('CORE_V1');
  expect(decodeRubric(externalRubric)?.code).toBe('EXTERNAL_V1');
  expect(
    decodeRubric({
      ...coreRubric,
      criteria: [...coreRubric.criteria, coreRubric.criteria[0]],
    }),
  ).toBeNull();
  expect(
    decodeRubric({ ...externalRubric, levels: { en: ['Zero'], ar: ['صفر'] } }),
  ).toBeNull();
  expect(decodeRubric({})).toBeNull();
});
