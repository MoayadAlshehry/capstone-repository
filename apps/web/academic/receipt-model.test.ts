import { expect, it } from 'vitest';
import { academicReceiptMatches } from './receipt-model';
const command = '11111111-1111-4111-8111-111111111111',
  project = '22222222-2222-4222-8222-222222222222',
  version = '33333333-3333-4333-8333-333333333333',
  submission = '44444444-4444-4444-8444-444444444444';
const context = {
  command,
  action: 'academic.final.requested',
  project,
  version,
};
it('a full-refresh acknowledgment belongs to the original command and exact edition, submission and layer', () => {
  expect(
    academicReceiptMatches(
      { receiptContext: context },
      command,
      'completion.' + version,
    ),
  ).toBe(true);
  expect(
    academicReceiptMatches(
      { receiptContext: context },
      command,
      'completion.' + project,
    ),
  ).toBe(false);
  expect(
    academicReceiptMatches(
      { receiptContext: context },
      project,
      'completion.' + version,
    ),
  ).toBe(false);
  expect(
    academicReceiptMatches(
      { receiptContext: context },
      command,
      'final.' + version,
    ),
  ).toBe(false);
  const draft = {
    submission,
    layer: 'supervisor',
    receiptContext: { ...context, action: 'academic.draft.supervisor' },
  };
  expect(
    academicReceiptMatches(
      draft,
      command,
      'academic.form.' + submission + '.supervisor',
    ),
  ).toBe(true);
  expect(
    academicReceiptMatches(
      draft,
      command,
      'academic.form.' + submission + '.committee',
    ),
  ).toBe(false);
  expect(
    academicReceiptMatches(
      draft,
      command,
      'academic.form.' + project + '.supervisor',
    ),
  ).toBe(false);
  const ownTask = { assignment: submission, status: 'completed', revision: 1 };
  expect(
    academicReceiptMatches(ownTask, command, 'independent.' + submission),
  ).toBe(true);
  expect(
    academicReceiptMatches(ownTask, command, 'independent.' + project),
  ).toBe(false);
  expect(
    academicReceiptMatches(
      { assignment: submission, status: 'withdrawn', revision: 2 },
      command,
      'independent.' + submission,
    ),
  ).toBe(true);
  expect(
    academicReceiptMatches(
      { receiptContext: context, assignment: submission },
      command,
      'independent.' + submission,
    ),
  ).toBe(false);
});
