import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permanentFixture } from './fixture.js';
import type { GuestView } from '../../apps/web/committee/types.js';
it('real SMTP/OTP, isolated guest identity, integer/evidence validation, full-roster mean, atomic finalization and original-guest amendment', async () => {
  const x = await permanentFixture();
  try {
    const a = await x.prepare('Permanent committee exact arithmetic case', 4),
      b = await x.prepare('Separate invitation isolation case', 3),
      address = 'same-guest-' + randomUUID() + '@capstone.local',
      g1 = await x.invite(a.submission, address),
      g2 = await x.invite(
        a.submission,
        'member-two-' + randomUUID() + '@capstone.local',
      ),
      other = await x.invite(b.submission, address);
    const initialUsers = (
      await x.f.seed('SELECT count(*)::int n FROM app.users')
    )[0]!.n;
    await expect(x.committee.read(g1.id, 'a'.repeat(43))).rejects.toThrow();
    await x.committee.challenge(
      g1.id,
      g1.token,
      'uninvited@capstone.local',
      'wrong-address',
    );
    const verified = await x.verify(g1);
    expect(verified.code).toMatch(/^\d{6}$/);
    expect(verified.message.HTML).toContain('lang="ar"');
    expect(
      await x.committee.verify(
        g1.id,
        g1.token,
        g1.email,
        verified.code,
        'reuse',
      ),
    ).toBeNull();
    await expect(x.committee.read(g2.id, verified.session)).rejects.toThrow();
    await expect(
      x.committee.read(other.id, verified.session),
    ).rejects.toThrow();
    const scope = await x.committee.read<GuestView>(g1.id, verified.session);
    expect(scope.submission).toBe(a.submission);
    expect(scope).not.toHaveProperty('internal');
    expect(scope).not.toHaveProperty('supervisor');
    const base = x.payload(scope.files[0]!.id, [3, 2, 3, 3, 3, 3, 3]);
    await expect(
      x.committee.write(
        g1.id,
        verified.session,
        0,
        {
          ...base,
          criteria: base.criteria.map((c, i) => (i ? c : { ...c, level: 2.5 })),
        },
        randomUUID(),
        true,
      ),
    ).rejects.toThrow();
    await expect(
      x.committee.write(
        g1.id,
        verified.session,
        0,
        {
          ...base,
          criteria: base.criteria.map((c) => ({ ...c, locators: [] })),
        },
        randomUUID(),
        true,
      ),
    ).rejects.toThrow();
    const draft = (await x.committee.write(
      g1.id,
      verified.session,
      0,
      base,
      randomUUID(),
      false,
    )) as { revision: number };
    await x.f.seed(
      `CREATE FUNCTION app.permanent_guest_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='system.committee.member_submitted' THEN RAISE EXCEPTION 'Controlled transactional audit failure';END IF;RETURN NEW;END $$;CREATE TRIGGER permanent_guest_audit_fault BEFORE INSERT ON app.audit_logs FOR EACH ROW EXECUTE FUNCTION app.permanent_guest_audit_fault();`,
    );
    await expect(
      x.committee.write(
        g1.id,
        verified.session,
        draft.revision,
        base,
        randomUUID(),
        true,
      ),
    ).rejects.toThrow();
    expect(
      (
        await x.f.seed(
          'SELECT count(*)::int n FROM app.committee_member_assessments WHERE invite_id=$1',
          [g1.id],
        )
      )[0]!.n,
    ).toBe(0);
    expect(
      (
        await x.f.seed(
          'SELECT submitted_at FROM app.committee_invitations WHERE id=$1',
          [g1.id],
        )
      )[0]!.submitted_at,
    ).toBeNull();
    await x.f.seed(
      'DROP TRIGGER permanent_guest_audit_fault ON app.audit_logs;DROP FUNCTION app.permanent_guest_audit_fault();',
    );
    const command = randomUUID();
    const race = await Promise.allSettled([
      x.committee.write(
        g1.id,
        verified.session,
        draft.revision,
        base,
        command,
        true,
      ),
      x.committee.write(
        g1.id,
        verified.session,
        draft.revision,
        base,
        randomUUID(),
        true,
      ),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await x.committee.write(
        g1.id,
        verified.session,
        draft.revision,
        base,
        command,
        true,
      ),
    ).toHaveProperty('receipt');
    expect(
      (await x.committee.status(x.f.faculty.actor, a.submission)).result,
    ).toBeNull();
    await expect(x.committee.files(g1.id, verified.session)).rejects.toThrow();
    const v2 = await x.verify(g2),
      p2 = x.payload(scope.files[0]!.id, [3, 4, 3, 3, 3, 3, 3]);
    await x.committee.write(g2.id, v2.session, 0, p2, randomUUID(), true);
    const result = await x.committee.status(x.f.faculty.actor, a.submission);
    expect(Number(result.result!.total)).toBe(75);
    const round = await x.academic.round(x.f.faculty.actor, a.submission);
    expect(Number(round.assessment!.supervisor)).toBe(100);
    expect(Number(round.assessment!.internal)).toBe(85);
    await expect(
      x.committee.manage(x.f.faculty.actor, {
        submission: a.submission,
        revision: result.revision,
        operation: 'revoke',
        invitation: g1.id,
        locale: 'en',
        reason: 'A supervisor must not remove a completed legitimate result.',
        command: randomUUID(),
      }),
    ).rejects.toThrow();
    await x.committee.endSession(g2.id, v2.session);
    await expect(x.committee.read(g2.id, v2.session)).rejects.toThrow();
    const receiptClock = new Date(Date.now() + 65000).toISOString();
    await x.f.seed(
      `CREATE OR REPLACE FUNCTION app.governance_now() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT '${receiptClock}'::timestamptz $$;`,
    );
    const returnSession = await x.verify(g2);
    const recoveredReceipt = await x.committee.read<GuestView>(
      g2.id,
      returnSession.session,
    );
    expect(recoveredReceipt.receipt?.total).toBe(80);
    await expect(
      x.committee.files(g2.id, returnSession.session),
    ).rejects.toThrow();
    const receipt = await x.committee.read<GuestView>(g1.id, verified.session);
    await expect(
      x.committee.authorizeAmendment(x.f.faculty.actor, {
        invitation: g1.id,
        head: receipt.receipt!.id,
        reason: 'Controlled evidence-linked transcription correction.',
        command: randomUUID(),
      }),
    ).rejects.toThrow();
    await x.committee.authorizeAmendment(x.f.admin, {
      invitation: g1.id,
      head: receipt.receipt!.id,
      reason:
        'Controlled evidence-linked transcription correction requested by the original member.',
      command: randomUUID(),
    });
    await expect(x.committee.read(g1.id, verified.session)).rejects.toThrow();
    const amendmentMail = await x.nextMail(
        g1.email,
        'Committee assessment invitation',
        x.seen,
      ),
      link = amendmentMail.Text.match(
        /http:\/\/127\.0\.0\.1:3630\/en\/committee\/[a-f0-9-]{36}#token=[A-Za-z0-9_-]{43}/,
      )![0],
      newToken = new URL(link).hash.slice(7),
      amend = await x.verify({ ...g1, token: newToken }),
      reopened = await x.committee.read<GuestView>(g1.id, amend.session);
    expect(reopened.amendment).toBeTruthy();
    expect(reopened.receipt).toBeNull();
    const changed = x.payload(scope.files[0]!.id, [3, 3, 3, 3, 3, 3, 3]);
    await x.committee.write(
      g1.id,
      amend.session,
      reopened.draft?.revision ?? 0,
      changed,
      randomUUID(),
      true,
    );
    const rows = await x.f.seed(
      'SELECT count(*)::int n FROM app.committee_member_assessments WHERE invite_id=$1',
      [g1.id],
    );
    expect(rows[0]!.n).toBe(2);
    expect(
      Number(
        (await x.committee.status(x.f.faculty.actor, a.submission)).result!
          .total,
      ),
    ).toBe(77.5);
    expect(
      (await x.f.seed('SELECT count(*)::int n FROM app.users'))[0]!.n,
    ).toBe(initialUsers);
    await expect(
      x.f.seed(
        'UPDATE app.committee_member_assessments SET quarter_points=0 WHERE invite_id=$1',
        [g1.id],
      ),
    ).rejects.toThrow();
  } finally {
    await x.close();
  }
});
