import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { permanentFixture } from './fixture.js';
import { createReviewers } from '@capstone/db/reviewers';
import { createExternalReviewEngine } from '@capstone/domain/external-reviews-engine';
import { createEvaluationEventWorker } from '@capstone/infrastructure/evaluation-events';
import {
  withMigrationConnection,
} from '@capstone/db/migration';
import {
  emptyExternalForm,
  declarationKeys,
} from '@capstone/domain/external-reviews';

it('release exact-70 committee, independent allocation, strict below-floor and privacy (operator rollback excluded)', async () => {
  const x = await permanentFixture(),
    profiles = createReviewers(x.f.runtime),
    reviews = createExternalReviewEngine(x.f.runtime, x.f.storage),
    second = createEvaluationEventWorker(
      x.jobs,
      (f) =>
        x.f.storage.verify(f.key, { size: Number(f.size), sha256: f.sha256 }),
      20000,
    );
  const records: { id: string; observed: string }[] = [];
  const output =
    (process.env['EXACT70_EVIDENCE_ROOT'] ??
      process.cwd() + '/.local/exact70-evidence') +
    '/exact70-integrated-observations.json';
  const mark = async (id: string, observed: string) => {
    records.push({ id, observed });
    await mkdir(output.slice(0, output.lastIndexOf('/')), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(output, JSON.stringify(records, null, 2), { mode: 0o600 });
  };
  async function until<T>(
    read: () => Promise<T>,
    ready: (value: T) => boolean,
  ) {
    for (let n = 0; n < 300; n++) {
      const value = await read();
      if (ready(value)) return value;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error('STAGING_EVENT_NOT_OBSERVED');
  }
  async function offers(project: string) {
    return x.f.seed(
      'SELECT a.id,a.reviewer_id,a.slot,a.status,r.kind FROM app.external_review_assignments a JOIN app.evaluation_cases c ON c.id=a.case_id JOIN app.external_policy_runs r ON r.id=a.policy_run_id WHERE c.project_id=$1 ORDER BY a.slot',
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
  async function reasons(project: string) {
    const rows = await x.f.seed(
      'SELECT app.first_pair_reasons(c.id) reasons FROM app.evaluation_cases c WHERE c.project_id=$1',
      [project],
    );
    return rows[0]!.reasons as string[];
  }
  async function reviewer(n: number, overrideEmail?: string) {
    const uni = (
        await x.f.on.command(x.f.platform, randomUUID(), 'university.create', {
          code: 'EXACT70_U_' + n,
          name_en: 'Synthetic Review Institution ' + n,
          name_ar: 'مؤسسة تحكيم اختبارية ' + n,
        })
      ).id,
      adminEmail = 'exact70-admin-' + n + '@capstone.local',
      aid = (
        await x.f.on.command(
          x.f.platform,
          randomUUID(),
          'administrator.invite',
          {
            university: uni,
            name: 'Synthetic Administrator ' + n,
            email: adminEmail,
            locale: 'en',
          },
        )
      ).id,
      admin = (await x.f.activate(aid, adminEmail)).actor,
      department = (
        await x.f.on.read<{ id: string; code: string }[]>(admin, 'departments')
      ).find((d) => d.code === 'CS')!.id,
      email = overrideEmail ?? 'exact70-reviewer-' + n + '@capstone.local',
      id = (
        await x.f.on.command(admin, randomUUID(), 'person.invite', {
          department,
          role: 'faculty_supervisor',
          name: 'Synthetic Academic ' + n,
          email,
          locale: 'en',
        })
      ).id,
      person = await x.f.activate(id, email);
    await profiles.command(person.actor, {
      operation: 'save',
      target: id,
      revision: 0,
      command: randomUUID(),
      body: {
        qualification:
          'Synthetic computing faculty qualification for an independent review in a controlled test.',
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
          'Controlled synthetic independent reviewer qualification verified.',
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
  async function complete(
    title: string,
    supervisor: number[],
    members: number[][],
    outcome: 'publish' | 'retain' = 'publish',
  ) {
    const p = await x.prepare(title, 3, false);
    let round = await x.academic.round(x.f.faculty.actor, p.submission);
    let draft = round.assessment!.drafts.find((d) => d.layer === 'supervisor')!;
    const payload = structuredClone(draft.payload);
    payload.criteria.forEach((c, i) => {
      c.level = supervisor[i]!;
    });
    await x.academic.command(x.f.faculty.actor, {
      operation: 'assessment.save',
      submission: p.submission,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      draftRevision: draft.revision,
      payload,
      command: randomUUID(),
    });
    round = await x.academic.round(x.f.faculty.actor, p.submission);
    draft = round.assessment!.drafts.find((d) => d.layer === 'supervisor')!;
    await x.academic.command(x.f.faculty.actor, {
      operation: 'assessment.finalize',
      submission: p.submission,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      draftRevision: draft.revision,
      payload: draft.payload,
      command: randomUUID(),
    });
    const invited = [];
    for (let i = 0; i < members.length; i++)
      invited.push(
        await x.invite(p.submission, randomUUID() + '@capstone.local'),
      );
    for (let i = 0; i < invited.length; i++) {
      const g = invited[i]!,
        session = await x.verify(g);
      await x.committee.write(
        g.id,
        session.session,
        0,
        x.payload(p.round.files[0]!.id, members[i]!),
        randomUUID(),
        true,
      );
    }
    const before = await reasons(p.project);
    expect(before).toContain('not_current_published');
    round = await x.academic.round(x.f.faculty.actor, p.submission);
    await x.academic.command(x.f.faculty.actor, {
      operation: 'final.decide',
      submission: p.submission,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      outcome,
      reason:
        'Controlled synthetic final decision for frozen assessed evidence.',
      publicManifestDigest: round.publicManifestDigest!,
      command: randomUUID(),
    });
    return { ...p, guests: invited };
  }
  try {
    await second.ready();
    const rows = await x.f.seed(
      'SELECT count(*)::int n FROM drizzle.__drizzle_migrations',
    );
    expect(rows[0]!.n).toBe(140);
    const high = [3, 3, 3, 3, 2, 2, 2];
    const close260 = [4, 3, 2, 2, 3, 2, 3],
      close265 = [4, 4, 2, 2, 2, 2, 3];
    const exact = await complete(
      'Exact seventy synthetic evaluation',
      [3, 3, 3, 3, 3, 3, 4],
      [close260, close265, close265],
    );
    const scored = await x.f.seed(
      "SELECT s.quarter_points::text sq,r.sum_quarter_points::int sumq,r.member_count::int n,r.mean_quarter_points::text meanq FROM app.evaluation_cases c JOIN app.effective_internal_assessments s ON s.case_id=c.id AND s.layer='supervisor' JOIN app.current_committee_results r ON r.case_id=c.id WHERE c.project_id=$1",
      [exact.project],
    );
    expect(scored[0]).toMatchObject({ sq: '305', sumq: 790, n: 3 });
    expect(await reasons(exact.project)).not.toContain('internal_floor');
    expect(await reasons(exact.project)).not.toContain('committee_floor');
    expect(await reasons(exact.project)).toEqual([]);
    await mark(
      '70-01',
      'Actual finalized supervisor 305, three finalized committee members sum 790: no internal-floor reason.',
    );
    await mark(
      '70-03',
      'Exact rational 70 passed on the actual first-pair function; above-boundary pending separate proof.',
    );
    await mark(
      '70-04',
      'Three real valid member forms produced current committee result, member count and original sum.',
    );
    await mark(
      '70-07',
      'Before explicit supervisor publication the same valid case was rejected as not current published.',
    );
    const first = await reviewer(1),
      next = await reviewer(2);
    const pair = await until(
      () => offers(exact.project),
      (v) =>
        v.filter((a) => ['offered', 'accepted'].includes(a.status)).length ===
        2,
    );
    expect(new Set(pair.map((a) => a.reviewer_id)).size).toBe(2);
    expect(pair.every((a) => a.kind === 'event-first-pair-v3')).toBe(true);
    await mark(
      '70-09',
      'Two distinct, approved, calibrated external reviewers received actual automatic offers after explicit publication and packet authorization.',
    );
    const own = await reviews.view(
      first,
      pair.find((a) => a.reviewer_id === first.id)!.id,
    );
    expect(own).not.toHaveProperty('internal');
    expect(own).not.toHaveProperty('supervisor');
    expect(own).not.toHaveProperty('committee');
    expect(own).not.toHaveProperty('rank');
    expect(JSON.stringify(own)).not.toContain(next.id);
    await mark(
      '70-11',
      'Real assigned reviewer view omitted internal, supervisor, committee, rank, and peer reviewer identity.',
    );
    const offerCounts = async () =>
      x.f.seed(
        "SELECT (SELECT count(*)::int FROM app.audit_logs WHERE project_id=$1 AND object_type='external_assignment') audits,(SELECT count(*)::int FROM app.notifications WHERE project_id=$1 AND recipient_id=ANY($2::uuid[])) notices",
        [exact.project, pair.map((a) => a.reviewer_id)],
      );
    const beforeRetry = await offerCounts();
    await Promise.all([x.events.drain(true), second.drain(true)]);
    await Promise.all([x.events.drain(true), second.drain(true)]);
    const replayed = await offers(exact.project);
    expect(replayed.map((a) => a.id)).toEqual(pair.map((a) => a.id));
    expect(await offerCounts()).toEqual(beforeRetry);
    await mark(
      '70-10',
      'Concurrent workers and forced reruns retained the same two assignments and did not duplicate assignment audits or reviewer notifications.',
    );
    const actors = [first, next];
    async function submitOne(
      assignment: (typeof pair)[number],
      levels: number[],
    ) {
      const declarations = Object.fromEntries(
        declarationKeys.map((k) => [k, true]),
      );
      const actor = actors.find((a) => a.id === assignment.reviewer_id)!;
      expect(actor).toBeTruthy();
      await reviews.command(actor, {
        assignment: assignment.id,
        operation: 'accept',
        body: declarations,
        revision: 0,
        command: randomUUID(),
      });
      const form = emptyExternalForm();
      form.criteria.forEach((c, j) => {
        c.level = levels[j]!;
      });
      await reviews.command(actor, {
        assignment: assignment.id,
        operation: 'save',
        body: form,
        revision: 0,
        command: randomUUID(),
      });
      await reviews.command(actor, {
        assignment: assignment.id,
        operation: 'finalize',
        body: form,
        revision: 1,
        command: randomUUID(),
      });
    }
    async function submitExternal(
      assignments: typeof pair,
      levels: number[][],
    ) {
      for (let i = 0; i < 2; i++) {
        await submitOne(assignments[i]!, levels[i]!);
      }
    }
    const progression = async (project: string) =>
      x.f.seed(
        'SELECT p.n,p.threshold,p.sum_quarter_points,p.min_quarter_points,p.max_quarter_points,p.state,p.reasons FROM app.evaluation_progression p JOIN app.evaluation_cases c ON c.id=p.case_id WHERE c.project_id=$1',
        [project],
      );
    await submitOne(pair[0]!, [3, 3, 3, 3]);
    const remainingActor = actors.find((a) => a.id === pair[1]!.reviewer_id)!;
    const beforeOwn = await reviews.view(remainingActor, pair[1]!.id);
    expect(JSON.stringify(beforeOwn)).not.toContain(pair[0]!.reviewer_id);
    expect(beforeOwn).not.toHaveProperty('internal');
    expect(beforeOwn).not.toHaveProperty('committee');
    expect(beforeOwn).not.toHaveProperty('peerAssessments');
    await submitOne(pair[1]!, [2, 4, 4, 4]);
    await mark(
      '70-11',
      'After one real reviewer finalized, the other reviewer before submitting still could not see peer identity, internal/committee data, or peer assessments.',
    );
    const initialProgress = await until(
      () => progression(exact.project),
      (v) => v.length > 0 && v[0]!.n === 2,
    );
    expect(initialProgress[0]).toMatchObject({
      n: 2,
      threshold: 80,
      sum_quarter_points: 640,
      min_quarter_points: 300,
      max_quarter_points: 340,
    });
    expect(initialProgress[0]!.state).toBe('queued_expansion');
    const conflicted = await reviewer(3, exact.guests[0]!.email);
    actors.push(conflicted);
    const context = await x.f.seed(
      'SELECT c.id,w.current_packet_id FROM app.evaluation_cases c JOIN app.academic_packet_workspaces w ON w.case_id=c.id WHERE c.project_id=$1',
      [exact.project],
    );
    await expect(
      x.f.seed('SELECT app.external_candidate($1,$2,true)', [
        conflicted.id,
        context[0]!.current_packet_id,
      ]),
    ).rejects.toThrow();
    const snapshot = await x.f.seed(
      'SELECT app.first_pair_snapshot(true) value',
    );
    const caseView = (
      snapshot[0]!.value as {
        cases: {
          id: string;
          reviewers: { id: string; committeeConflict: boolean }[];
        }[];
      }
    ).cases.find((c) => c.id === context[0]!.id);
    expect(
      caseView?.reviewers.find((r) => r.id === conflicted.id)
        ?.committeeConflict,
    ).toBe(true);
    const rangeExact = await complete(
      'External range exactly twenty',
      [3, 3, 3, 3, 3, 3, 4],
      [close260, close265, close265],
    );
    const rangePair = await until(
      () => offers(rangeExact.project),
      (v) =>
        v.filter((a) => ['offered', 'accepted'].includes(a.status)).length ===
        2,
    );
    await submitExternal(rangePair, [
      [0, 4, 4, 4],
      [4, 4, 4, 2],
    ]);
    const rangeOK = await until(
      () => progression(rangeExact.project),
      (v) => v.length > 0 && v[0]!.n === 2,
    );
    expect(rangeOK[0]).toMatchObject({
      threshold: 80,
      sum_quarter_points: 640,
      min_quarter_points: 280,
      max_quarter_points: 360,
    });
    expect(['queued_expansion', 'reviewing_expansion']).toContain(
      rangeOK[0]!.state,
    );
    const rangeBad = await complete(
      'External range above twenty',
      [3, 3, 3, 3, 3, 3, 4],
      [close260, close265, close265],
    );
    const rangeBadPair = await until(
      () => offers(rangeBad.project),
      (v) =>
        v.filter((a) => ['offered', 'accepted'].includes(a.status)).length ===
        2,
    );
    await submitExternal(rangeBadPair, [
      [0, 4, 4, 4],
      [3, 4, 4, 4],
    ]);
    const rangeFailed = await until(
      () => progression(rangeBad.project),
      (v) => v.length > 0 && v[0]!.n === 2,
    );
    expect(rangeFailed[0]!.state).toBe('paused_quality');
    expect(rangeFailed[0]!.reasons).toContain('external_range_exceeded');
    const floorBad = await complete(
      'External score below seventy',
      [3, 3, 3, 3, 3, 3, 4],
      [close260, close265, close265],
    );
    const floorPair = await until(
      () => offers(floorBad.project),
      (v) =>
        v.filter((a) => ['offered', 'accepted'].includes(a.status)).length ===
        2,
    );
    await submitExternal(floorPair, [
      [2, 3, 4, 2],
      [3, 4, 4, 4],
    ]);
    const floorFailed = await until(
      () => progression(floorBad.project),
      (v) => v.length > 0 && v[0]!.n === 2,
    );
    expect(floorFailed[0]!.state).toBe('paused_quality');
    expect(floorFailed[0]!.reasons).toContain('external_score_floor');
    const third = await reviewer(4);
    actors.push(third);
    const expanded = await until(
      () => offers(exact.project),
      (v) => v.some((a) => a.slot === 3 && a.status === 'offered'),
    );
    await submitOne(
      expanded.find((a) => a.slot === 3 && a.status === 'offered')!,
      [3, 3, 4, 4],
    );
    const nextProgress = await until(
      () => progression(exact.project),
      (v) => v.length > 0 && v[0]!.n === 3,
    );
    expect(nextProgress[0]).toMatchObject({
      n: 3,
      threshold: 82,
      sum_quarter_points: 985,
      min_quarter_points: 300,
      max_quarter_points: 345,
    });
    expect(['queued_expansion', 'reviewing_expansion']).toContain(
      nextProgress[0]!.state,
    );
    await mark(
      '70-13',
      'Actual submitted external reviews: n=2 threshold 80 equality passed; n=3 threshold 82 passed with the next representable score; individual 70 and range 20 equality passed; below-70 and range-over-20 cases paused. The separate event integration covers deadline expiry and replacement.',
    );
    const mid = [2, 3, 3, 3, 2, 2, 3];
    const below = await complete(
      'Below seventy rounds to seventy display',
      [3, 3, 3, 3, 3, 3, 3],
      [mid, mid, mid, mid, mid, high, high],
    );
    const q = await x.f.seed(
      "SELECT s.quarter_points::numeric sq,r.sum_quarter_points::numeric sumq,r.member_count::numeric n,round((2*s.quarter_points+3*r.mean_quarter_points)/20,1)::text displayed FROM app.evaluation_cases c JOIN app.effective_internal_assessments s ON s.case_id=c.id AND s.layer='supervisor' JOIN app.current_committee_results r ON r.case_id=c.id WHERE c.project_id=$1",
      [below.project],
    );
    expect(q[0]!.displayed).toBe('70.0');
    expect(Number(q[0]!.sq)).toBe(300);
    expect(Number(q[0]!.sumq)).toBe(1865);
    expect(Number(q[0]!.n)).toBe(7);
    expect(await reasons(below.project)).toContain('internal_floor');
    expect(await offers(below.project)).toHaveLength(0);
    const capped = await x.prepare('Controlled committee roster cap', 3, true);
    for (let i = 0; i < 20; i++)
      await x.invite(capped.submission, randomUUID() + '@capstone.local');
    await expect(
      x.invite(capped.submission, randomUUID() + '@capstone.local'),
    ).rejects.toMatchObject({ sqlState: '22023' });
    let exact6999Representable = false;
    for (let n = 2; n <= 20; n++)
      for (let sq = 0; sq <= 400; sq += 5)
        for (let sumq = 0; sumq <= 400 * n; sumq += 5)
          if (100 * (2 * n * sq + 3 * sumq) === 139980 * n)
            exact6999Representable = true;
    expect(exact6999Representable).toBe(false);
    const literals = await x.f.seed(
      'SELECT 69.99::numeric>=70::numeric below,70.00::numeric>=70::numeric exact,70.01::numeric>=70::numeric above',
    );
    expect(literals[0]).toMatchObject({
      below: false,
      exact: true,
      above: true,
    });
    await mark(
      '70-02',
      'Real 7-member 69.964285... displays 70.0 but is rejected; exact literal 69.99 fails. The real committee roster rejects a 21st member, so 25-member 69.99 is outside the supported policy.',
    );
    const above = await complete(
      'Above seventy synthetic evaluation',
      [3, 3, 3, 3, 3, 3, 4],
      [close260, close265, [2, 2, 2, 3, 4, 3, 4]],
    );
    const aboveScore = await x.f.seed(
      'SELECT r.sum_quarter_points::int sumq FROM app.evaluation_cases c JOIN app.current_committee_results r ON r.case_id=c.id WHERE c.project_id=$1',
      [above.project],
    );
    expect(aboveScore[0]!.sumq).toBe(795);
    expect(await reasons(above.project)).not.toContain('internal_floor');
    await mark(
      '70-03',
      'Actual exact-70 and above-70 finalized cases passed the numeric gate; PostgreSQL 70.01 literal passed.',
    );
    const c260 = [4, 3, 2, 2, 2, 4, 2],
      c255 = [4, 3, 2, 2, 2, 3, 3];
    const at65 = await complete(
      'Committee exactly sixty five',
      [3, 3, 3, 3, 3, 4, 3],
      [c260, c260],
    );
    expect(await reasons(at65.project)).not.toContain('committee_floor');
    expect(await reasons(at65.project)).not.toContain('internal_floor');
    const under65 = await complete(
      'Committee below sixty five',
      [4, 4, 4, 4, 4, 4, 4],
      [c260, c255],
    );
    expect(await reasons(under65.project)).toContain('committee_floor');
    expect(await reasons(under65.project)).not.toContain('internal_floor');
    await mark(
      '70-05',
      'Real 2-member finalized committee sums 520 and 515 passed and failed the exact 65 gate respectively.',
    );
    const criteriaBad = [3, 3, 1, 4, 4, 4, 4];
    const bad = await complete(
      'High score with disqualifying C3',
      [4, 4, 4, 4, 4, 4, 4],
      [criteriaBad, criteriaBad],
    );
    expect(await reasons(bad.project)).toContain('individual_criterion_floor');
    expect(await offers(bad.project)).toHaveLength(0);
    const c4Bad = [3, 3, 4, 1, 4, 4, 4];
    const badC4 = await complete(
      'High score with disqualifying C4',
      [4, 4, 4, 4, 4, 4, 4],
      [c4Bad, c4Bad],
    );
    expect(await reasons(badC4.project)).toContain(
      'individual_criterion_floor',
    );
    expect(await offers(badC4.project)).toHaveLength(0);
    await mark(
      '70-06',
      'Actual high-scoring committee cases with C3=1 and C4=1 retained individual criterion-floor rejection.',
    );
    const retained = await complete(
      'Exact seventy retained internally',
      [3, 3, 3, 3, 3, 3, 4],
      [close260, close265, close265],
      'retain',
    );
    const retainedState = await x.f.seed(
      'SELECT status FROM app.project_versions WHERE id=$1',
      [retained.version],
    );
    expect(retainedState[0]!.status).toBe('rejected');
    expect(await reasons(retained.project)).toContain('not_current_published');
    expect(await offers(retained.project)).toHaveLength(0);
    await mark(
      '70-07',
      'Real unpublished and rejected exact-score cases remained ineligible; wrong/superseded version tested separately where supported.',
    );
    const caseRows = await x.f.seed(
      'SELECT c.id,w.current_packet_id FROM app.evaluation_cases c JOIN app.academic_packet_workspaces w ON w.case_id=c.id WHERE c.project_id=$1',
      [exact.project],
    );
    const caseId = caseRows[0]!.id,
      packet = caseRows[0]!.current_packet_id;
    await x.events.close();
    await second.close();
    await expect(
      x.f.seed('UPDATE app.evaluation_cases SET submission_id=$2 WHERE id=$1', [
        caseId,
        below.submission,
      ]),
    ).rejects.toThrow();
    await expect(
      x.f.seed('UPDATE app.evaluation_cases SET version_id=$2 WHERE id=$1', [
        caseId,
        below.version,
      ]),
    ).rejects.toThrow();
    const currentBinding = await x.f.seed(
      'SELECT version_id,submission_id FROM app.evaluation_cases WHERE id=$1',
      [caseId],
    );
    expect(currentBinding[0]).toMatchObject({
      version_id: exact.version,
      submission_id: exact.submission,
    });
    await withMigrationConnection(x.f.migration, async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          'UPDATE app.projects SET published_version_id=NULL WHERE id=$1',
          [exact.project],
        );
        const gate = (
          await c.query('SELECT app.first_pair_reasons($1) reasons', [caseId])
        ).rows[0].reasons as string[];
        expect(gate).toContain('not_current_published');
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(await reasons(exact.project)).not.toContain('not_current_published');
    await withMigrationConnection(x.f.migration, async (c) => {
      await c.query('BEGIN');
      try {
        const alternate = randomUUID();
        await c.query(
          "INSERT INTO app.project_versions SELECT (jsonb_populate_record(NULL::app.project_versions,to_jsonb(v)||jsonb_build_object('id',$2::uuid,'version_number',v.version_number+1,'status','draft','base_version_id',NULL,'approved_submission_id',NULL,'archived_at',NULL,'submitted_at',NULL,'retained_at',NULL))).* FROM app.project_versions v WHERE v.id=$1",
          [exact.version, alternate],
        );
        await expect(
          c.query(
            'UPDATE app.projects SET published_version_id=$2 WHERE id=$1',
            [exact.project, alternate],
          ),
        ).rejects.toMatchObject({
          code: '23514',
          message: 'Published pointer must identify archived edition',
        });
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(await reasons(exact.project)).not.toContain('not_current_published');
    await withMigrationConnection(x.f.migration, async (c) => {
      await c.query('BEGIN');
      try {
        const alternate = randomUUID(),
          alternateSubmission = randomUUID();
        const columnLists = async (name: string) => {
          const row = (
            await c.query(
              "SELECT string_agg(format('%I',attname),',' ORDER BY attnum) cols,string_agg(format('r.%I',attname),',' ORDER BY attnum) selected FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''",
              ['app.' + name],
            )
          ).rows[0];
          return row as { cols: string; selected: string };
        };
        const versionColumns = await columnLists('project_versions'),
          submissionColumns = await columnLists('project_submissions');
        await c.query(
          `INSERT INTO app.project_versions (${versionColumns.cols}) SELECT ${versionColumns.selected} FROM app.project_versions v CROSS JOIN LATERAL jsonb_populate_record(NULL::app.project_versions,to_jsonb(v)||jsonb_build_object('id',$2::uuid,'version_number',v.version_number+1,'status','draft','base_version_id',NULL,'approved_submission_id',NULL,'archived_at',NULL)) r WHERE v.id=$1`,
          [exact.version, alternate],
        );
        await expect(
          c.query(
            `INSERT INTO app.project_submissions (${submissionColumns.cols}) SELECT ${submissionColumns.selected} FROM app.project_submissions s CROSS JOIN LATERAL jsonb_populate_record(NULL::app.project_submissions,to_jsonb(s)||jsonb_build_object('id',$2::uuid,'version_id',$3::uuid)) r WHERE s.id=$1`,
            [exact.submission, alternateSubmission, alternate],
          ),
        ).rejects.toMatchObject({
          code: '40001',
          message: 'FINAL_REQUEST_REQUIRED',
        });
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(await reasons(exact.project)).not.toContain('not_current_published');
    await withMigrationConnection(x.f.migration, async (c) => {
      await c.query('BEGIN');
      try {
        const version = randomUUID(),
          submission = randomUUID(),
          request = randomUUID();
        const cols = async (name: string) => {
          const q = (
            await c.query(
              "SELECT string_agg(format('%I',attname),',' ORDER BY attnum) cols,string_agg(format('r.%I',attname),',' ORDER BY attnum) selected FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped AND attgenerated=''",
              ['app.' + name],
            )
          ).rows[0];
          return q as { cols: string; selected: string };
        };
        const v = await cols('project_versions'),
          a = await cols('academic_completion_requests'),
          s = await cols('project_submissions');
        await c.query(
          `INSERT INTO app.project_versions (${v.cols}) SELECT ${v.selected} FROM app.project_versions p CROSS JOIN LATERAL jsonb_populate_record(NULL::app.project_versions,to_jsonb(p)||jsonb_build_object('id',$2::uuid,'version_number',p.version_number+1,'status','draft','base_version_id',NULL,'approved_submission_id',NULL,'archived_at',NULL)) r WHERE p.id=$1`,
          [exact.version, version],
        );
        await c.query(
          `INSERT INTO app.academic_completion_requests (${a.cols}) SELECT ${a.selected} FROM app.academic_completion_requests p CROSS JOIN LATERAL jsonb_populate_record(NULL::app.academic_completion_requests,to_jsonb(p)||jsonb_build_object('id',$2::uuid,'version_id',$3::uuid)) r WHERE p.id=(SELECT request_id FROM app.academic_final_requests WHERE submission_id=$1)`,
          [exact.submission, request, version],
        );
        await c.query(
          `INSERT INTO app.project_submissions (${s.cols}) SELECT ${s.selected} FROM app.project_submissions p CROSS JOIN LATERAL jsonb_populate_record(NULL::app.project_submissions,to_jsonb(p)||jsonb_build_object('id',$2::uuid,'version_id',$3::uuid)) r WHERE p.id=$1`,
          [exact.submission, submission, version],
        );
        await c.query(
          "UPDATE app.project_versions SET status='archived',approved_submission_id=$2,archived_at=clock_timestamp() WHERE id=$1",
          [version, submission],
        );
        await c.query(
          'UPDATE app.projects SET published_version_id=$2 WHERE id=$1',
          [exact.project, version],
        );
        const gate = (
          await c.query('SELECT app.first_pair_reasons($1) reasons', [caseId])
        ).rows[0].reasons as string[];
        expect(gate).toContain('not_current_published');
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(await reasons(exact.project)).not.toContain('not_current_published');
    await mark(
      '70-07',
      'Wrong-project submission/version and a nonarchived pointer were rejected; a simulated historical archived successor with matching final request/submission caused the old case to be blocked, then was rolled back; unpublished/rejected cases stayed ineligible. An unauthorized successor submission was independently denied FINAL_REQUEST_REQUIRED.',
    );
    await x.f.seed(
      'UPDATE app.academic_packet_workspaces SET current_packet_id=NULL WHERE case_id=$1',
      [caseId],
    );
    expect(await reasons(exact.project)).toContain('lead_packet_required');
    await expect(
      x.f.seed('SELECT app.first_pair_offer($1,$2,$3,1,false)', [
        randomUUID(),
        first.id,
        packet,
      ]),
    ).rejects.toThrow();
    await x.f.seed(
      'UPDATE app.academic_packet_workspaces SET current_packet_id=$2 WHERE case_id=$1',
      [caseId, packet],
    );
    await x.f.seed(
      'INSERT INTO app.evaluation_allocation_prerequisites(case_id,hold) VALUES($1,true) ON CONFLICT(case_id) DO UPDATE SET hold=true',
      [caseId],
    );
    expect(await reasons(exact.project)).toContain('governance_hold');
    await expect(
      x.f.seed('SELECT app.first_pair_offer($1,$2,$3,1,false)', [
        randomUUID(),
        first.id,
        packet,
      ]),
    ).rejects.toThrow();
    await x.f.seed(
      'UPDATE app.evaluation_allocation_prerequisites SET hold=false WHERE case_id=$1',
      [caseId],
    );
    await expect(
      x.f.seed('SELECT app.external_candidate($1,$2,true)', [
        x.f.faculty.actor.id,
        packet,
      ]),
    ).rejects.toThrow();
    await expect(
      x.f.seed('SELECT app.external_candidate($1,$2,true)', [
        randomUUID(),
        packet,
      ]),
    ).rejects.toThrow();
    await mark(
      '70-08',
      'Actual first-pair offer refused missing packet and governance hold; same-university supervisor, nonexistent reviewer and approved former committee participant were refused; existing event integration separately exercised approved reviewer capacity.',
    );
    // The batched SQL projection must retain the original per-case policy and
    // guest-identity oracle, including a faculty reviewer who was a guest.
    await second.close();
    await x.events.close();
    await withMigrationConnection(x.f.migration, async (c) => {
      await c.query('BEGIN');
      try {
        const snapshot = (await c.query('SELECT app.first_pair_snapshot(true) value')).rows[0].value as {
          cases: { id: string; project: string; eventLane: string | null; gateReasons: string[]; reviewers: { id: string; committeeConflict: boolean }[] }[];
        };
        expect(snapshot.cases.length).toBeGreaterThan(0);
        let compared = 0;
        for (const item of snapshot.cases) {
          const expected = (await c.query(
            'SELECT app.event_allocation_lane($1) lane,app.first_pair_reasons($1) reasons', [item.id],
          )).rows[0];
          expect(item.eventLane).toBe(expected.lane);
          expect(item.gateReasons).toEqual(expected.reasons);
          for (const reviewer of item.reviewers) {
            const oracle = (await c.query(
              `SELECT coalesce((SELECT committee_conflict FROM app.evaluation_reviewer_relations WHERE case_id=$1 AND reviewer_id=$2),false)
                OR EXISTS(SELECT 1 FROM app.committee_invitations i JOIN app.evaluation_cases ec ON ec.id=i.case_id
                  JOIN app.users u ON lower(u.email)=i.email WHERE ec.project_id=$3 AND u.id=$2) excluded`,
              [item.id, reviewer.id, item.project],
            )).rows[0];
            expect(reviewer.committeeConflict).toBe(oracle.excluded);
            compared++;
          }
        }
        expect(compared).toBeGreaterThan(0);
        expect(snapshot.cases.find(item => item.project === exact.project)?.reviewers
          .find(reviewer => reviewer.id === conflicted.id)?.committeeConflict).toBe(true);
      } finally {
        await c.query('ROLLBACK');
      }
      expect((await c.query('SELECT 1 value')).rows[0].value).toBe(1);
    });
    await mark('SNAPSHOT-01',
      'Batched snapshot matched original lane, eligibility and guest-identity oracles for every fixture case/reviewer; the known guest-faculty conflict remained excluded; the diagnostic transaction rolled back and its connection remained usable.');
    const gradeTables = await x.f.seed(
      "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='app' AND table_name IN ('official_grades','course_grades')",
    );
    expect(gradeTables[0]!.n).toBe(0);
  } finally {
    await second.close();
    await profiles.close();
    await reviews.close();
    await x.close();
  }
}, 300000);
