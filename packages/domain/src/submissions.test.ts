import { it, expect } from 'vitest';
import { submissionUuid, decisionCommentValid } from './submissions.js';
it.each(['', 'ab', 'x'.repeat(2001), 'bad\u202e', 'token: unsafe', 'bad\x01'])(
  'invalid faculty comment %j is refused',
  (value) => expect(decisionCommentValid(value)).toBe(false),
);
it.each([
  'Synthetic revision reason',
  'سبب مراجعة تجريبي',
  'line one\nline two',
  'x'.repeat(2000),
])('valid comment %j is bounded and retained as prose', (value) =>
  expect(decisionCommentValid(value)).toBe(true),
);
it.each(['', '../file', 'not-a-uuid', null])(
  'invalid target %j is refused',
  (value) => expect(submissionUuid(value)).toBe(false),
);
it('valid opaque UUID target is admitted', () =>
  expect(submissionUuid('12345678-1234-1234-1234-123456789012')).toBe(true));
