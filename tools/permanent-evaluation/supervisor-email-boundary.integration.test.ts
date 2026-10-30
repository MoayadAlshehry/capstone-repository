import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permanentFixture } from './fixture.js';

it('prevents a supervisor mailbox from becoming a committee scorer, including legacy invitations', async () => {
  const x = await permanentFixture();
  try {
    const p = await x.prepare('P5 supervisor email identity boundary', 2);
    const [{ email }] = await x.f.seed(
      'SELECT email FROM app.users WHERE id=$1',
      [x.f.faculty.actor.id],
    );
    const before = await x.f.seed(
      'SELECT count(*)::int n FROM app.committee_invitations',
    );
    await expect(x.invite(p.submission, email!)).rejects.toThrow();
    await expect(
      x.invite(p.submission, '  ' + email!.toUpperCase() + '  '),
    ).rejects.toThrow();
    expect(
      await x.f.seed('SELECT count(*)::int n FROM app.committee_invitations'),
    ).toEqual(before);
    const normal = await x.invite(
      p.submission,
      'independent-' + randomUUID() + '@capstone.local',
    );
    // Explicit legacy-data fixture, not a workflow bypass: emulate an invitation
    // accepted before migration 0124 and verify the live capability fails closed.
    const legacy = randomUUID();
    await x.f
      .seed(
        `INSERT INTO app.committee_invitations
      (id,case_id,email,display_name,locale,token_hash,invited_by,created_at,expires_at,last_sent_at,active_supervisor_id)
      SELECT $1::uuid,case_id,$2,'Legacy conflict','en',encode(sha256(convert_to(($1::uuid)::text,'UTF8')),'hex'),invited_by,created_at,expires_at,last_sent_at,active_supervisor_id
      FROM app.committee_invitations WHERE id=$3`,
        [legacy, email!, normal.id],
      )
      .catch((e) => {
        throw Error('LEGACY_FIXTURE_SQLSTATE:' + e.sqlState);
      });
    await expect(
      x.f.seed('SELECT app.committee_live_invite($1)', [legacy]),
    ).rejects.toThrow();
    await x.committee.challenge(
      legacy,
      normal.token,
      email!,
      'legacy-conflict',
    );
    expect(
      (
        await x.f.seed(
          'SELECT count(*)::int n FROM app.committee_mail_outbox WHERE invite_id=$1',
          [legacy],
        )
      )[0]!.n,
    ).toBe(0);
    const verified = await x.verify(normal);
    expect(await x.committee.read(normal.id, verified.session)).toHaveProperty(
      'submission',
      p.submission,
    );
    const state = await x.committee.status(x.f.faculty.actor, p.submission);
    await x.committee.manage(x.f.faculty.actor, {
      submission: p.submission,
      revision: state.revision,
      operation: 'revoke',
      invitation: legacy,
      locale: 'en',
      reason: 'Revoke the controlled legacy supervisor conflict.',
      command: randomUUID(),
    });
    expect(
      (await x.committee.status(x.f.faculty.actor, p.submission)).members.find(
        (m) => m.id === legacy,
      )?.revokedAt,
    ).toBeTruthy();
  } finally {
    await x.close();
  }
});
