import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permanentFixture } from './fixture.js';
import type { GuestView } from '../../apps/web/committee/types.js';
it('shows the assessed FINAL ordinal after two genuine preceding checkpoints', async () => {
  const x = await permanentFixture();
  try {
    const p = await x.prepare(
      'P5 checkpoint and final ordinal distinction',
      3,
      true,
      2,
    );
    const facts = await x.f.seed(
      'SELECT s.round_number,a.number FROM app.project_submissions s JOIN app.academic_finals a ON a.submission_id=s.id WHERE s.id=$1',
      [p.submission],
    );
    expect(facts[0]!.round_number).toBe(3);
    expect(facts[0]!.number).toBe(1);
    const g = await x.invite(
        p.submission,
        'ordinal-' + randomUUID() + '@capstone.local',
      ),
      v = await x.verify(g),
      view = await x.committee.read<GuestView>(g.id, v.session);
    expect(view.round).toBe(1);
    expect(view.submission).toBe(p.submission);
    expect(view.project).toBe(p.project);
    expect(view.version).toBe(p.version);
    expect(view.files).toHaveLength(2);
    expect(view).not.toHaveProperty('internal');
  } finally {
    await x.close();
  }
});
