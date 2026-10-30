import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permanentFixture } from './fixture.js';
import { createReviewers } from '@capstone/db/reviewers';
import { createExternalReviewEngine } from '@capstone/domain/external-reviews-engine';
import { createEvaluationEventWorker } from '@capstone/infrastructure/evaluation-events';
import type { AccountView } from '@capstone/db/auth';
it('committed-event first pair: honest zero/one-expert waits, availability recovery, concurrent workers, real policy provenance and capacity', async () => {
  const x = await permanentFixture(),
    profiles = createReviewers(x.f.runtime),
    reviews = createExternalReviewEngine(x.f.runtime, x.f.storage),
    second = createEvaluationEventWorker(
      x.jobs,
      (f) =>
        x.f.storage.verify(f.key, { size: Number(f.size), sha256: f.sha256 }),
      20000,
    );
  await second.ready();
  const evidence: { name: string; elapsedMs: number }[] = [];
  async function until<T>(read: () => Promise<T>, ready: (x: T) => boolean) {
    const start = Date.now();
    for (let n = 0; n < 150; n++) {
      const value = await read();
      if (ready(value)) return { value, elapsedMs: Date.now() - start };
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error('EVENT_CONDITION_NOT_OBSERVED');
  }
  async function offers(project: string) {
    return x.f.seed(
      'SELECT a.id,a.reviewer_id,a.slot,a.status,r.kind FROM app.external_review_assignments a JOIN app.evaluation_cases c ON c.id=a.case_id JOIN app.external_policy_runs r ON r.id=a.policy_run_id WHERE c.project_id=$1 ORDER BY a.offered_at',
      [project],
    ) as Promise<
      {
        id: string;
        reviewer_id: string;
        slot: number;
        status: string;
        kind: string;
      }[]
    >;
  }
  async function completeInternal(title: string) {
    const p = await x.prepare(title);
    const invited = [
      await x.invite(p.submission, randomUUID() + '@capstone.local'),
      await x.invite(p.submission, randomUUID() + '@capstone.local'),
    ];
    for (const g of invited) {
      const v = await x.verify(g);
      try {
        await x.committee.write(
          g.id,
          v.session,
          0,
          x.payload(p.round.files[0]!.id, [3, 3, 3, 3, 3, 3, 3]),
          randomUUID(),
          true,
        );
      } catch (error) {
        const e = error as { code?: string; sqlState?: string };
        throw Error(`GUEST_FINALIZE_${e.code}_${e.sqlState}`);
      }
    }
    const round = await x.academic.round(x.f.faculty.actor, p.submission);
    const time = Date.now();
    await x.academic.command(x.f.faculty.actor, {
      operation: 'final.decide',
      submission: p.submission,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      outcome: 'publish',
      reason: 'Verified synthetic event-driven evaluation publication.',
      publicManifestDigest: round.publicManifestDigest!,
      command: randomUUID(),
    });
    return { ...p, committedAt: time };
  }
  async function reviewer(n: number) {
    const uni = (
        await x.f.on.command(x.f.platform, randomUUID(), 'university.create', {
          code: 'EVENT_REVIEW_' + n,
          name_en: 'Synthetic External Review Institution ' + n,
          name_ar: 'مؤسسة التحكيم الاختبارية ' + n,
        })
      ).id,
      email = 'event-admin-' + n + '@capstone.local',
      aid = (
        await x.f.on.command(
          x.f.platform,
          randomUUID(),
          'administrator.invite',
          {
            university: uni,
            name: 'Synthetic external institution administrator ' + n,
            email,
            locale: 'en',
          },
        )
      ).id,
      admin = (await x.f.activate(aid, email)).actor,
      department = (
        await x.f.on.read<{ id: string; code: string }[]>(admin, 'departments')
      ).find((d) => d.code === 'CS')!.id,
      mail = 'event-reviewer-' + n + '@capstone.local',
      id = (
        await x.f.on.command(admin, randomUUID(), 'person.invite', {
          department,
          role: 'faculty_supervisor',
          name: 'Synthetic qualified independent academic ' + n,
          email: mail,
          locale: 'en',
        })
      ).id,
      person = await x.f.activate(id, mail);
    await profiles.command(person.actor, {
      operation: 'save',
      target: id,
      revision: 0,
      command: randomUUID(),
      body: {
        qualification:
          'Synthetic computing faculty qualification for controlled independent-review verification across university boundaries.',
        domains: ['software'],
        tags: ['validation'],
        languages: ['en', 'ar'],
        available: true,
      },
    });
    let p = (await profiles.view(person.actor)).profiles[0]!;
    await profiles.command(x.f.platform, {
      operation: 'approve',
      target: id,
      revision: p.revision,
      command: randomUUID(),
      body: {
        reason:
          'Verified controlled synthetic faculty institution and documented expertise.',
      },
    });
    p = (await profiles.view(person.actor)).profiles[0]!;
    await profiles.command(person.actor, {
      operation: 'calibrate',
      target: id,
      revision: p.revision,
      command: randomUUID(),
      body: { version: 'EXTERNAL_V1', acknowledged: true },
    });
    return person.actor;
  }
  try {
    const p = await completeInternal(
      'Automatic first-pair scarcity research case',
    );
    const wait = await until(
      () =>
        x.f.seed(
          'SELECT s.waiting,s.reasons FROM app.evaluation_pair_status s JOIN app.evaluation_cases c ON c.id=s.case_id WHERE c.project_id=$1',
          [p.project],
        ),
      (r) =>
        r.length > 0 &&
        r[0]!.waiting === 2 &&
        (r[0]!.reasons as string[]).includes('waiting_for_qualified_capacity'),
    );
    expect(await offers(p.project)).toHaveLength(0);
    expect(wait.value[0]!.reasons).toContain('waiting_for_qualified_capacity');
    const first = await reviewer(1),
      one = await until(
        () => offers(p.project),
        (r) =>
          r.filter((a) => ['offered', 'accepted'].includes(a.status)).length ===
          1,
      );
    expect(one.value[0]!.reviewer_id).toBe(first.id);
    expect(
      (
        await x.f.seed(
          'SELECT waiting FROM app.evaluation_pair_status s JOIN app.evaluation_cases c ON c.id=s.case_id WHERE c.project_id=$1',
          [p.project],
        )
      )[0]!.waiting,
    ).toBe(1);
    const secondReviewer = await reviewer(2),
      pair = await until(
        () => offers(p.project),
        (r) => r.length === 2,
      );
    expect(new Set(pair.value.map((a) => a.reviewer_id)).size).toBe(2);
    expect(pair.value.every((a) => a.kind === 'event-first-pair-v3')).toBe(
      true,
    );
    evidence.push({
      name: 'one-expert to lawful pair on profile/calibration event',
      elapsedMs: pair.elapsedMs,
    });
    const healthy = await completeInternal(
        'Healthy committed eligibility latency case',
      ),
      healthyPair = await until(
        () => offers(healthy.project),
        (r) => r.length === 2,
      ),
      elapsed = Date.now() - healthy.committedAt;
    expect(elapsed).toBeLessThan(60000);
    expect(new Set(healthyPair.value.map((a) => a.reviewer_id)).size).toBe(2);
    evidence.push({
      name: 'healthy committed eligibility to both persisted accessible offers',
      elapsedMs: elapsed,
    });
    const none = await completeInternal(
      'Honest full reviewer-capacity wait case',
    );
    await until(
      () =>
        x.f.seed(
          'SELECT waiting FROM app.evaluation_pair_status s JOIN app.evaluation_cases c ON c.id=s.case_id WHERE c.project_id=$1',
          [none.project],
        ),
      (r) => r.length > 0 && r[0]!.waiting === 2,
    );
    expect(await offers(none.project)).toHaveLength(0);
    const task = await reviews.view(
      first,
      pair.value.find((a) => a.reviewer_id === first.id)!.id,
    );
    if (!('revision' in task)) throw Error('REAL_REVIEW_TASK_REQUIRED');
    await reviews.command(first, {
      assignment: task.id,
      operation: 'decline',
      revision: task.revision,
      body: {
        reason:
          'Controlled synthetic capacity release; no assessment is submitted.',
      },
      command: randomUUID(),
    });
    await until(
      () => offers(none.project),
      (r) => r.length === 1,
    );
    // Ten more supported, approved and calibrated faculty produce a twelve-reviewer fixture.
    const actors: AccountView[] = [first, secondReviewer];
    for (let n = 3; n <= 12; n++) actors.push(await reviewer(n));
    await until(
      () => offers(none.project),
      (r) => r.length === 2,
    );
    expect(
      await x.f.seed(
        "SELECT reviewer_id,count(*)::int n FROM app.external_review_assignments WHERE status IN ('offered','accepted') GROUP BY reviewer_id HAVING count(*)>2",
      ),
    ).toHaveLength(0);
    expect(
      await x.f.seed(
        'SELECT case_id,reviewer_id,count(*)::int n FROM app.external_review_assignments GROUP BY case_id,reviewer_id HAVING count(*)>1',
      ),
    ).toHaveLength(0);
    expect(await offers(healthy.project)).toHaveLength(2);
    const own = await reviews.view(
      first,
      healthyPair.value.find((a) => a.reviewer_id === first.id)!.id,
    );
    expect(own).not.toHaveProperty('internal');
    expect(own).not.toHaveProperty('supervisor');
    expect(own).not.toHaveProperty('committee');
    expect(own).not.toHaveProperty('rank');
    // Advance only the marked disposable database clock. No user event or direct allocator call.
    const deadline = new Date(Date.now() + 8 * 86400000).toISOString();
    await x.f.seed(
      `CREATE OR REPLACE FUNCTION app.governance_now() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT '${deadline}'::timestamptz $$;`,
    );
    let deadlineRepaired = false;
    const repairStarted = Date.now();
    for (let n = 0; n < 400; n++) {
      const rows = await offers(healthy.project);
      if (
        rows.filter((a) => a.status === 'expired').length === 2 &&
        rows.filter((a) => a.status === 'offered').length === 2
      ) {
        deadlineRepaired = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(deadlineRepaired).toBe(true);
    evidence.push({
      name: 'deadline-only automatic expiry and replacement without manual allocation',
      elapsedMs: Date.now() - repairStarted,
    });
    const normalized = JSON.stringify(evidence);
    expect(normalized).toContain('healthy');
    const { writeFile, mkdir } = await import('node:fs/promises');
    const output =
      process.env['PERMANENT_EVALUATION_EVIDENCE_ROOT'] ??
      process.cwd() + '/.local/permanent-evaluation/evidence';
    await mkdir(output, { recursive: true, mode: 0o700 });
    await writeFile(
      output + '/EVENT_LATENCY_AND_SCARCITY.json',
      JSON.stringify(
        {
          at: new Date().toISOString(),
          database: x.f.f.database,
          qualifiedReviewers: actors.length,
          observations: evidence,
          manualAllocation: false,
          concurrentEventWorkers: 2,
          capacityViolations: 0,
          duplicateReviewers: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    await second.close();
    await profiles.close();
    await reviews.close();
    await x.close();
  }
});
