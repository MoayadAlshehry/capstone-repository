import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { independentFixture } from '../independent/fixture.js';
import { createEvaluationEventWorker } from '@capstone/infrastructure/evaluation-events';
import {
  databaseUrl,
  loadLocalDatabaseConfig,
} from '../local-infrastructure.js';
import {
  declarationKeys,
  emptyExternalForm,
} from '@capstone/domain/external-reviews';
import type { AccountView } from '@capstone/db/auth';
it('P5 actual event workers expand lawful independently verified reviews to ten and deny an eleventh despite available capacity', async () => {
  const f = await independentFixture(3677, 'http://127.0.0.1:3676'),
    config = await loadLocalDatabaseConfig(),
    reviewers = f.people.map((p) => p.actor),
    workers: ReturnType<typeof createEvaluationEventWorker>[] = [];
  async function until<T>(
    read: () => Promise<T>,
    ready: (value: T) => boolean,
  ) {
    for (let i = 0; i < 150; i++) {
      const value = await read();
      if (ready(value)) return value;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error('CURRENT_LIFECYCLE_STATE_NOT_OBSERVED');
  }
  async function addReviewer(n: number): Promise<AccountView> {
    const university = (
      await f.on.command(f.platform, randomUUID(), 'university.create', {
        code: 'P5_TEN_' + n,
        name_en: 'P5 Independent Institution ' + n,
        name_ar: 'مؤسسة المراجعة المستقلة ' + n,
      })
    ).id;
    const adminEmail = `p5.ten.admin.${n}@capstone.local`,
      adminId = (
        await f.on.command(f.platform, randomUUID(), 'administrator.invite', {
          university,
          name: 'P5 independent administrator ' + n,
          email: adminEmail,
          locale: 'en',
        })
      ).id,
      admin = (await f.activate(adminId, adminEmail)).actor;
    const department = (
        await f.on.read<{ id: string; code: string }[]>(admin, 'departments')
      ).find((d) => d.code === 'CS')!.id,
      email = `p5.ten.reviewer.${n}@capstone.local`,
      id = (
        await f.on.command(admin, randomUUID(), 'person.invite', {
          department,
          role: 'faculty_supervisor',
          name: 'P5 qualified independent reviewer ' + n,
          email,
          locale: 'en',
        })
      ).id,
      actor = (await f.activate(id, email)).actor;
    await f.profiles.command(actor, {
      operation: 'save',
      target: id,
      revision: 0,
      command: randomUUID(),
      body: {
        qualification:
          'Controlled synthetic computing faculty expertise in reproducible software research and accessible research repositories.',
        domains: ['software'],
        tags: ['validation'],
        languages: ['en', 'ar'],
        available: true,
      },
    });
    let profile = (await f.profiles.view(actor)).profiles[0]!;
    await f.profiles.command(f.platform, {
      operation: 'approve',
      target: id,
      revision: profile.revision,
      command: randomUUID(),
      body: {
        reason:
          'Controlled P5 verification of documented synthetic faculty qualifications and independent institutional affiliation.',
      },
    });
    profile = (await f.profiles.view(actor)).profiles[0]!;
    await f.profiles.command(actor, {
      operation: 'calibrate',
      target: id,
      revision: profile.revision,
      command: randomUUID(),
      body: { version: 'EXTERNAL_V1', acknowledged: true },
    });
    return actor;
  }
  try {
    for (let n = 3; n < 11; n++) reviewers.push(await addReviewer(n));
    const final = await f.final(
      'P5 current ten-review lifecycle — verified event-driven allocation',
    );
    const offers = () =>
      f.seed(
        'SELECT a.id,a.reviewer_id,a.slot,a.status,r.kind FROM app.external_review_assignments a JOIN app.evaluation_cases c ON c.id=a.case_id JOIN app.external_policy_runs r ON r.id=a.policy_run_id WHERE c.project_id=$1 ORDER BY a.slot,a.id',
        [final.project],
      );
    for (let n = 0; n < 2; n++) {
      const w = createEvaluationEventWorker(
        databaseUrl(config, 'jobs', true, f.f.database),
        (file) =>
          f.storage.verify(file.key, {
            size: Number(file.size),
            sha256: file.sha256,
          }),
        100,
      );
      await w.ready();
      workers.push(w);
    }
    const first = await until(
      offers,
      (r) => r.filter((a) => a.status === 'offered').length === 2,
    );
    expect(first).toHaveLength(2);
    expect(new Set(first.map((a) => a.reviewer_id)).size).toBe(2);
    expect(first.every((a) => a.kind === 'event-first-pair-v3')).toBe(true);
    const checkpoints: { completed: number; offers: number; active: number }[] =
      [];
    for (let completed = 0; completed < 10; completed++) {
      const rows = await until(offers, (r) =>
          r.some((a) => a.status === 'offered'),
        ),
        offer = rows.find((a) => a.status === 'offered')!,
        actor = reviewers.find((a) => a.id === offer.reviewer_id)!;
      expect(actor).toBeDefined();
      const offered = await f.reviews.view(actor, String(offer.id));
      expect('project' in offered && offered.project).toBeTruthy();
      await f.reviews.command(actor, {
        assignment: String(offer.id),
        operation: 'accept',
        revision: 'revision' in offered ? Number(offered.revision) : 0,
        body: Object.fromEntries(declarationKeys.map((key) => [key, true])),
        command: randomUUID(),
      });
      const accepted = await f.reviews.view(actor, String(offer.id));
      expect('status' in accepted && accepted.status).toBe('accepted');
      const form = emptyExternalForm();
      form.calibration = true;
      form.overall =
        'Controlled synthetic lifecycle assessment of the exact immutable research evidence. No human study or official academic grade is claimed.';
      form.criteria.forEach((c) => {
        c.level = 4;
        c.comment =
          'Controlled frozen method and validation evidence supports this selected criterion within its declared scope.';
        c.locators = [
          {
            file: final.files[0]!.id,
            kind: 'section',
            reference: 'Frozen method and validation',
          },
        ];
      });
      await f.reviews.command(actor, {
        assignment: String(offer.id),
        operation: 'finalize',
        revision: 'revision' in accepted ? Number(accepted.revision) : 1,
        body: form,
        command: randomUUID(),
      });
      const receipt = await f.reviews.view(actor, String(offer.id));
      expect('status' in receipt && receipt.status).toBe('completed');
      expect('usable' in receipt && receipt.usable).not.toBe(true);
      const current = await until(
        offers,
        (r) =>
          r.filter((a) => a.status === 'completed').length === completed + 1,
      );
      checkpoints.push({
        completed: completed + 1,
        offers: current.length,
        active: current.filter((a) =>
          ['offered', 'accepted'].includes(String(a.status)),
        ).length,
      });
    }
    const end = await until(
      () =>
        f.seed(
          'SELECT p.n,p.state FROM app.evaluation_progression p JOIN app.evaluation_cases c ON c.id=p.case_id WHERE c.project_id=$1',
          [final.project],
        ),
      (r) => r[0]?.state === 'completed_limit',
    );
    expect(end[0]!.n).toBe(10);
    await Promise.all(workers.map((w) => w.drain(true)));
    const finalOffers = await offers();
    expect(finalOffers).toHaveLength(10);
    expect(finalOffers.every((a) => a.status === 'completed')).toBe(true);
    expect(reviewers).toHaveLength(11);
    const directory = process.env['PERMANENT_EVALUATION_EVIDENCE_ROOT'];
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(
        directory + '/P5_TEN_REVIEW_LIFECYCLE.json',
        JSON.stringify(
          {
            at: new Date().toISOString(),
            method:
              'Genuine account onboarding/setup, qualification approval/calibration, supervisor and two SMTP/OTP-verified guest forms, real lead consent and publication, two concurrent actual committed-event workers, independent acceptance/finalization services. No seeded assignments or score rows.',
            qualifiedReviewers: reviewers.length,
            checkpoints,
            final: end,
            assignments: finalOffers,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    await Promise.all(workers.map((w) => w.close()));
    await f.close();
  }
}, 180000);
