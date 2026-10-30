import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permanentFixture } from './fixture.js';
import { createCorrectionsEngine } from '@capstone/domain/corrections-engine';

it('delivers an assessment review once to the responsible active institution, with atomic notice failure', async () => {
  const x = await permanentFixture(),
    corrections = createCorrectionsEngine(x.f.runtime, x.f.storage);
  try {
    const p = await x.prepare('P5 real assessment request delivery', 2);
    const assessment = (
      await x.f.seed(
        "SELECT id FROM app.internal_assessments WHERE submission_id=$1 AND layer='supervisor'",
        [p.submission],
      )
    )[0]!.id as string;
    const command = {
      operation: 'issue' as const,
      command: randomUUID(),
      body: {
        assessment,
        type: 'transcription_error' as const,
        reason:
          'Controlled original evaluator review of the declared synthetic methodology.',
        evidence: [],
      },
    };
    const a = (await corrections.command(x.f.faculty.actor, command)) as {
      issue: string;
    };
    expect(await corrections.command(x.f.faculty.actor, command)).toEqual(a);
    const notices = await x.f.seed(
      `SELECT n.id,u.role_code,u.university_id,n.payload
   FROM app.notifications n JOIN app.audit_logs a ON a.id=n.event_id JOIN app.users u ON u.id=n.recipient_id
   WHERE a.object_id=$1 AND a.action='evaluation.governance.issue'`,
      [a.issue],
    );
    expect(notices.length).toBeGreaterThan(0);
    const university = (
      await x.f.seed(
        'SELECT university_id FROM app.evaluation_cases WHERE submission_id=$1',
        [p.submission],
      )
    )[0]!.university_id;
    expect(
      notices.every(
        (n) =>
          n.role_code === 'university_admin' && n.university_id === university,
      ),
    ).toBe(true);
    expect(
      notices.every(
        (n) =>
          n.payload.link.kind === 'evaluation-governance' &&
          n.payload.link.id === a.issue,
      ),
    ).toBe(true);
    expect(
      (
        await x.f.seed(
          "SELECT count(*)::int n FROM app.audit_logs WHERE object_id=$1 AND action='evaluation.governance.issue'",
          [a.issue],
        )
      )[0]!.n,
    ).toBe(1);
    await expect(
      corrections.view(x.f.lead.actor, undefined, a.issue),
    ).rejects.toThrow();
    const count = (
      await x.f.seed('SELECT count(*)::int n FROM app.assessment_issues')
    )[0]!.n;
    await x.f
      .seed(`CREATE FUNCTION app.p5_notice_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.type='evaluation.governance.issue' THEN RAISE EXCEPTION 'Controlled required notice failure';END IF;RETURN NEW;END $$;
    CREATE TRIGGER p5_notice_fault BEFORE INSERT ON app.notifications FOR EACH ROW EXECUTE FUNCTION app.p5_notice_fault();`);
    await expect(
      corrections.command(x.f.faculty.actor, {
        ...command,
        command: randomUUID(),
      }),
    ).rejects.toThrow();
    expect(
      (await x.f.seed('SELECT count(*)::int n FROM app.assessment_issues'))[0]!
        .n,
    ).toBe(count);
  } finally {
    await corrections.close();
    await x.close();
  }
});
