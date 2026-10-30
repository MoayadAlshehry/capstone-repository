import { beforeEach, expect, it, vi } from 'vitest';
import { DatabaseError } from '@capstone/db';
const read = vi.hoisted(() => vi.fn());
const round = vi.hoisted(() => vi.fn());
const legacyRead = vi.hoisted(() => vi.fn());
vi.mock('../corrections/server', () => ({
  corrections: async () => ({ view: read }),
}));
vi.mock('../semester/server', () => ({ semester: async () => ({ round }) }));
vi.mock('../submissions/server', () => ({
  submissions: async () => ({ read: legacyRead }),
}));
import { personalNavigation } from './navigation-context-server';
const issue = '12ba3bc4-6457-4815-9d71-aab8ec97df03';
const actor = {
  id: 'controlled-faculty',
  name: 'Controlled faculty',
  email: 'faculty@capstone.local',
  role: 'faculty_supervisor',
  universityId: null,
  university: null,
  universityAr: null,
  department: null,
  status: 'active',
  locale: 'en' as const,
  partnerStatus: null,
  sessionId: 'controlled-session',
  sessionExpiresAt: '2100-01-01T00:00:00Z',
};
const identity = { ...actor, universityEn: null, reviewerCapable: true };
const query = {
  context: 'independent',
  returnTo: '/en/evaluation/corrections/' + issue,
};
beforeEach(() => {
  read.mockReset();
  round.mockReset();
  legacyRead.mockReset();
});

it('derives correction context from the authorized original evaluator and layer', async () => {
  read.mockResolvedValue({
    issues: [{ id: issue, logical: 'own-logical' }],
    assessments: [
      { logical: 'own-logical', evaluator: actor.id, layer: 'external' },
    ],
  });
  expect(await personalNavigation(actor, identity, 'en', query)).toEqual({
    ...query,
    warning: false,
  });
  expect(read).toHaveBeenCalledWith(actor, undefined, issue);
});

it('keeps transient return-validation failure recoverable rather than replacing the task', async () => {
  const error = new DatabaseError('READ_UNAVAILABLE', '08006');
  read.mockRejectedValue(error);
  await expect(personalNavigation(actor, identity, 'en', query)).rejects.toBe(
    error,
  );
});

it('confirmed denial falls back safely without retaining a forbidden entity', async () => {
  read.mockRejectedValue(new DatabaseError('FORBIDDEN', '42501'));
  expect(await personalNavigation(actor, identity, 'en', query)).toEqual({
    context: 'independent',
    returnTo: '/en/reviewer',
    warning: true,
  });
});

it('an unrelated assessment cannot validate the return entity', async () => {
  read.mockResolvedValue({
    issues: [{ id: issue, logical: 'other-logical' }],
    assessments: [
      {
        logical: 'other-logical',
        evaluator: 'another-faculty',
        layer: 'external',
      },
    ],
  });
  expect((await personalNavigation(actor, identity, 'en', query)).warning).toBe(
    true,
  );
});

it('validates an owned checkpoint using the same frozen reader as the destination', async () => {
  round.mockResolvedValue({ id: issue, purpose: 'CHECKPOINT' });
  const task = {
    context: 'supervision',
    returnTo: '/en/supervision/rounds/' + issue,
  };
  expect(await personalNavigation(actor, identity, 'en', task)).toEqual({
    ...task,
    warning: false,
  });
  expect(round).toHaveBeenCalledWith(actor, issue);
  expect(legacyRead).not.toHaveBeenCalled();
});

it('preserves legacy frozen submission returns only after an absent modern record', async () => {
  round.mockRejectedValue(new DatabaseError('NOT_FOUND', 'P0002'));
  legacyRead.mockResolvedValue({ id: issue });
  const task = { context: 'supervision', returnTo: '/en/submissions/' + issue };
  expect((await personalNavigation(actor, identity, 'en', task)).warning).toBe(
    false,
  );
  expect(legacyRead).toHaveBeenCalledWith(actor, issue);
});

it.each(['42501', '08006'])(
  'does not use a legacy read to bypass modern %s',
  async (sqlState) => {
    const error = new DatabaseError('READ_UNAVAILABLE', sqlState);
    round.mockRejectedValue(error);
    const task = {
      context: 'supervision',
      returnTo: '/en/supervision/rounds/' + issue,
    };
    if (sqlState === '08006')
      await expect(
        personalNavigation(actor, identity, 'en', task),
      ).rejects.toBe(error);
    else
      expect(
        (await personalNavigation(actor, identity, 'en', task)).warning,
      ).toBe(true);
    expect(legacyRead).not.toHaveBeenCalled();
  },
);
