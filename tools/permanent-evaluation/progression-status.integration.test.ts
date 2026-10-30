import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { independentFixture } from '../independent/fixture.js';
import { createPacketEngine } from '@capstone/domain/packets-engine';
import { createEvaluationEventWorker } from '@capstone/infrastructure/evaluation-events';
import {
  emptyExternalForm,
  declarationKeys,
} from '@capstone/domain/external-reviews';
import {
  databaseUrl,
  loadLocalDatabaseConfig,
} from '../local-infrastructure.js';

it('authorized packet status follows active initial tasks and quality pause without scores, peer identities or data writes', async () => {
  const f = await independentFixture(3673, 'http://127.0.0.1:3672');
  const packets = createPacketEngine(f.runtime, f.storage);
  const config = await loadLocalDatabaseConfig();
  const events = createEvaluationEventWorker(
    databaseUrl(config, 'jobs', true, f.f.database),
    (file) =>
      f.storage.verify(file.key, {
        size: Number(file.size),
        sha256: file.sha256,
      }),
    20000,
  );
  await events.ready();
  try {
    const project = await f.final('P5 complete status projection');
    async function status() {
      return (await packets.fullFinalView(
        f.lead.actor,
        project.project,
        project.version,
      )) as {
        allocation: {
          active: number;
          completed: number;
          progressionState: string;
          qualityPaused: boolean;
          progressionReasons: string[];
        };
      };
    }
    let assignments: { id: string; reviewer_id: string }[] = [];
    for (let i = 0; i < 100; i++) {
      await events.drain();
      assignments = await f.seed(
        'SELECT a.id,a.reviewer_id FROM app.external_review_assignments a JOIN app.evaluation_cases c ON c.id=a.case_id WHERE c.project_id=$1 ORDER BY a.slot',
        [project.project],
      );
      if (assignments.length === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(assignments).toHaveLength(2);
    expect((await status()).allocation).toMatchObject({
      active: 2,
      completed: 0,
      progressionState: 'reviewing_initial',
      qualityPaused: false,
    });
    await expect(
      packets.fullFinalView(
        f.people[0]!.actor,
        project.project,
        project.version,
      ),
    ).rejects.toThrow();
    await expect(
      packets.fullFinalView(f.lead.actor, project.project, randomUUID()),
    ).rejects.toThrow();
    const declarations = Object.fromEntries(
      declarationKeys.map((key) => [key, true]),
    );
    for (let i = 0; i < 2; i++) {
      const assignment = assignments[i]!,
        person = f.people.find((p) => p.actor.id === assignment.reviewer_id)!;
      const command = (operation: string, body: unknown, revision: number) => ({
        assignment: assignment.id,
        operation,
        body,
        revision,
        command: randomUUID(),
      });
      await f.reviews.command(person.actor, command('accept', declarations, 0));
      const form = emptyExternalForm();
      form.criteria.forEach((criterion) => {
        criterion.level = i === 0 ? 0 : 3;
      });
      await f.reviews.command(person.actor, command('save', form, 0));
      await f.reviews.command(person.actor, command('finalize', form, 1));
      await events.drain();
      if (i === 0)
        expect((await status()).allocation).toMatchObject({
          active: 1,
          completed: 1,
          qualityPaused: false,
        });
    }
    const started = Date.now();
    let value = await status();
    const observations = [{ elapsedMs: 0, ...value.allocation }];
    // Finalization commits the result before the event worker advances its
    // stored progression state. Observe that real boundary, as for admission
    // above, rather than treating drain() as a synchronous queue barrier.
    while (!value.allocation.qualityPaused && Date.now() - started < 5000) {
      expect(value.allocation).toMatchObject({ active: 0, completed: 2 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await events.drain();
      value = await status();
      observations.push({
        elapsedMs: Date.now() - started,
        ...value.allocation,
      });
    }
    const evidenceRoot = process.env['PERMANENT_EVALUATION_EVIDENCE_ROOT'];
    if (evidenceRoot) {
      await mkdir(evidenceRoot, { recursive: true });
      await writeFile(
        join(evidenceRoot, 'P5-PROGRESSION-WORKER-BOUNDARY-001.json'),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            method:
              'Real event-worker completion; no manual progression write or policy override',
            deadlineMs: 5000,
            observations,
          },
          null,
          2,
        ),
      );
    }
    expect(value.allocation, JSON.stringify(value.allocation)).toMatchObject({
      active: 0,
      completed: 2,
      progressionState: 'paused_quality',
      qualityPaused: true,
    });
    expect(value.allocation.progressionReasons).toContain(
      'quality_pause_latched',
    );
    for (const key of ['mean', 'range', 'reviewer', 'assessments'])
      expect(value.allocation).not.toHaveProperty(key);
    for (const assignment of assignments)
      expect(JSON.stringify(value.allocation)).not.toContain(
        assignment.reviewer_id,
      );
    const before = await f.seed(
      'SELECT id,md5(to_jsonb(t)::text) hash FROM app.committee_member_assessments t ORDER BY id',
    );
    await status();
    await status();
    expect(
      await f.seed(
        'SELECT id,md5(to_jsonb(t)::text) hash FROM app.committee_member_assessments t ORDER BY id',
      ),
    ).toEqual(before);
    const permissions = (
      await f.seed(
        "SELECT has_function_privilege('capstone_runtime','app.full_final_packet_state(uuid,uuid,uuid,uuid)','EXECUTE') current_runtime,has_function_privilege('capstone_runtime','app.full_final_packet_state_before_progression_status(uuid,uuid,uuid,uuid)','EXECUTE') wrapped_runtime,has_function_privilege('capstone_jobs','app.full_final_packet_state(uuid,uuid,uuid,uuid)','EXECUTE') jobs",
      )
    )[0]!;
    expect(permissions).toEqual({
      current_runtime: true,
      wrapped_runtime: false,
      jobs: false,
    });
  } finally {
    await events.close();
    await packets.close();
    await f.close();
  }
});
