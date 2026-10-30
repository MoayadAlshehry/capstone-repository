import { expect, it } from 'vitest';
import {
  commandAtLocation,
  governedReceipt,
  governedResult,
  validGovernedReason,
} from './command-model';
const command = '11111111-1111-4111-8111-111111111111';
const issue = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';
const logical = '44444444-4444-4444-8444-444444444444';
const receipt = {
  command,
  operation: 'issue',
  case: caseId,
  logical,
  layer: 'supervisor',
  result: { issue, state: 'open', revision: 0, assessment: logical, run: null },
};

it('governed prose follows server code-point bounds while allowing normal multiline input', () => {
  expect(validGovernedReason('🙂'.repeat(10))).toBe(false);
  expect(validGovernedReason('🙂'.repeat(20))).toBe(true);
  expect(validGovernedReason('🙂'.repeat(2000))).toBe(true);
  expect(validGovernedReason('🙂'.repeat(2001))).toBe(false);
  expect(validGovernedReason('Enough reason text\nwith a second line.')).toBe(
    true,
  );
  expect(validGovernedReason('Enough reason text\u202e hidden direction')).toBe(
    false,
  );
});

it('refresh binds the one original command to its exact document scope, excluding duplicate or unrelated query markers', () => {
  const scope = 'request.' + caseId + '.supervisor';
  expect(
    commandAtLocation(new URLSearchParams({ command, task: scope }), scope),
  ).toBe(command);
  expect(
    commandAtLocation(
      new URLSearchParams({ command, task: 'admin.collection' }),
      scope,
    ),
  ).toBeNull();
  expect(
    commandAtLocation(
      new URLSearchParams(
        'command=' + command + '&command=' + command + '&task=' + scope,
      ),
      scope,
    ),
  ).toBeNull();
  expect(
    commandAtLocation(
      new URLSearchParams({ command: 'not-a-command', task: scope }),
      scope,
    ),
  ).toBeNull();
});

it('owned receipt acknowledgment also matches operation, case and assessment layer before resolving an unknown request', () => {
  expect(governedResult(receipt.result)).toBe(true);
  expect(
    governedReceipt(receipt, command, 'request.' + caseId + '.supervisor'),
  ).toBe(true);
  expect(
    governedReceipt(receipt, command, 'request.' + caseId + '.committee'),
  ).toBe(false);
  expect(
    governedReceipt(receipt, command, 'request.' + logical + '.supervisor'),
  ).toBe(false);
  expect(
    governedReceipt(receipt, issue, 'request.' + caseId + '.supervisor'),
  ).toBe(false);
  expect(governedReceipt(receipt, command, 'correction.' + issue)).toBe(false);
  expect(
    governedReceipt(
      { ...receipt, operation: 'correct' },
      command,
      'correction.' + issue,
    ),
  ).toBe(true);
  expect(
    governedReceipt(
      { ...receipt, operation: 'correct' },
      command,
      'correction.' + logical,
    ),
  ).toBe(false);
  expect(governedReceipt(receipt, command, 'admin.' + caseId)).toBe(true);
  expect(governedReceipt(receipt, command, 'admin.' + issue)).toBe(true);
  expect(governedReceipt(receipt, command, 'admin.' + logical)).toBe(false);
  expect(governedResult({ ...receipt.result, issue: 'wrong' })).toBe(false);
});

it('recovers a completed evaluator concern by own logical identity without adding a case projection', () => {
  const head = '55555555-5555-4555-8555-555555555555';
  const own = {
    ...receipt,
    layer: 'external',
    result: { ...receipt.result, assessment: head },
  };
  const binding = { logical, layer: 'external' as const };
  expect(governedReceipt(own, command, 'request.' + logical, binding)).toBe(
    true,
  );
  expect(governedReceipt(own, command, 'request.' + head, binding)).toBe(true);
  expect(governedReceipt(own, command, 'request.' + head)).toBe(false);
  expect(
    governedReceipt(
      { ...own, logical: issue },
      command,
      'request.' + head,
      binding,
    ),
  ).toBe(false);
  expect(
    governedReceipt(
      { ...own, operation: 'correct' },
      command,
      'request.' + head,
      binding,
    ),
  ).toBe(false);
  expect(
    governedReceipt(
      { ...own, layer: 'committee' },
      command,
      'request.' + head,
      binding,
    ),
  ).toBe(false);
  expect(governedReceipt(own, command, 'request.' + issue, binding)).toBe(
    false,
  );
  expect(
    governedReceipt(own, command, 'request.' + issue + '.external', binding),
  ).toBe(false);
});
