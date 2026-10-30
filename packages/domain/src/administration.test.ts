import { it, expect } from 'vitest';
import {
  authorize,
  validAdministrationInput,
  lifecycleValid,
  computingDomains,
} from './index.js';
const actor = {
  userId: 'self',
  role: 'university_admin' as const,
  universityId: 'A',
  active: true,
  partnerApproved: false,
  correlationId: 'test',
};
it('separates shared taxonomy from department codes', () =>
  expect(computingDomains.map((d) => d.code)).toEqual([
    'software',
    'data',
    'hardware',
  ]));
it('denies unknown commands and client authority overrides', () => {
  expect(validAdministrationInput('publish', {})).toBe(false);
  expect(
    validAdministrationInput('department.create', {
      code: 'CS',
      name_en: 'CS',
      name_ar: 'حوسبة',
      reason: 'Technical check',
      university: 'B',
    }),
  ).toBe(false);
});
it.each(['platform_admin', 'partner', 'university_admin'])(
  'manual form cannot create %s',
  (role) =>
    expect(
      validAdministrationInput('account.create', {
        name: 'Test',
        email: 'test@capstone.local',
        role,
        department: '12345678-1234-1234-1234-123456789abc',
        student_id: '',
        reason: 'Technical check',
      }),
    ).toBe(false),
);
it('tenant/platform permissions do not grant publication or elevation', () => {
  expect(
    authorize(actor, 'admin.platform', {
      kind: 'institution',
      universityId: null,
      visible: true,
    }),
  ).toBe('forbidden');
  expect(
    authorize(actor, 'admin.tenant', {
      kind: 'institution',
      universityId: 'B',
      visible: true,
    }),
  ).toBe('not_found');
  expect(
    authorize(actor, 'publish', {
      kind: 'institution',
      universityId: 'A',
      visible: true,
    }),
  ).toBe('forbidden');
});
it.each([24 * 3600000, 3600000])('exact lifecycle boundary %d', (duration) => {
  expect(lifecycleValid(duration, duration - 1, false, false)).toBe(true);
  expect(lifecycleValid(duration, duration, false, false)).toBe(false);
  expect(lifecycleValid(duration, duration + 1, false, false)).toBe(false);
  expect(lifecycleValid(duration, 0, true, false)).toBe(false);
  expect(lifecycleValid(duration, 0, false, true)).toBe(false);
});
