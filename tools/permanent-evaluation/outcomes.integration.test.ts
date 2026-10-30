import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permanentFixture } from './fixture.js';
it('reasoned revision and internal retention do not invent or require missing committee results', async () => {
  const x = await permanentFixture();
  try {
    for (const outcome of ['revision', 'retain'] as const) {
      const p = await x.prepare(
          'Reasoned ' + outcome + ' before committee completion',
        ),
        r = await x.academic.round(x.f.faculty.actor, p.submission);
      expect(r.assessment!.committee).toBeNull();
      await x.academic.command(x.f.faculty.actor, {
        operation: 'final.decide',
        submission: p.submission,
        revision: r.revision,
        assignmentRevision: r.assignmentRevision,
        outcome,
        reason:
          'The frozen work requires documented academic changes; committee results are not invented.',
        publicManifestDigest: r.publicManifestDigest!,
        command: randomUUID(),
      });
      expect(
        (
          await x.f.seed(
            'SELECT status FROM app.project_versions WHERE id=$1',
            [p.version],
          )
        )[0]!.status,
      ).toBe(outcome === 'revision' ? 'revision_required' : 'rejected');
      expect(
        (
          await x.f.seed(
            'SELECT count(*)::int n FROM app.committee_results r JOIN app.evaluation_cases c ON c.id=r.case_id WHERE c.project_id=$1',
            [p.project],
          )
        )[0]!.n,
      ).toBe(0);
    }
  } finally {
    await x.close();
  }
});

it('an early lead-authorized case never admits committee invitations before supervisor finalization', async () => {
  const x = await permanentFixture();
  try {
    const p = await x.prepare(
      'Early packet cannot bypass independent supervisor stage',
      3,
      false,
    );
    const status = await x.committee.status(x.f.faculty.actor, p.submission);
    await expect(
      x.committee.manage(x.f.faculty.actor, {
        submission: p.submission,
        revision: status.revision,
        operation: 'invite',
        email: 'early-guest@capstone.local',
        name: 'Early recipient',
        locale: 'en',
        reason: '',
        command: randomUUID(),
      }),
    ).rejects.toThrow();
    expect(
      (
        await x.f.seed(
          'SELECT count(*)::int n FROM app.committee_invitations WHERE case_id=$1',
          [status.case],
        )
      )[0]!.n,
    ).toBe(0);
    expect(
      (await x.academic.round(x.f.faculty.actor, p.submission)).assessment!
        .assessments,
    ).toHaveLength(0);
  } finally {
    await x.close();
  }
});
