import { expect, it } from 'vitest';
import { reviewReasonValid } from './reason';

it('keeps closure explanations within the installed code-point and control-character bounds', () => {
  expect(reviewReasonValid('  A conflict prevents completion.  ')).toBe(true);
  expect(reviewReasonValid('😀'.repeat(400))).toBe(true);
  expect(reviewReasonValid('😀'.repeat(401))).toBe(false);
  expect(reviewReasonValid('😀😀')).toBe(false);
  expect(reviewReasonValid('سبب')).toBe(true);
  for (const control of ['\n', '\t', '\u007f', '\u0085', '\u202e', '\u2067'])
    expect(reviewReasonValid('Reason' + control + 'detail')).toBe(false);
});
