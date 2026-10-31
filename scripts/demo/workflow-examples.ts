import { randomUUID } from 'node:crypto';
import { createPartners } from '@capstone/db/partners';
import { demoContext } from './context.js';
import { buildProject, type MadeProject } from './projects.js';
import { extraSpecs, internalLevels, personName } from './scenarios.js';
import {
  privateJson,
  savePrivate,
  credential,
  type DemoIdentity,
} from './store.js';

export async function buildWorkflowExamples(x: Awaited<ReturnType<typeof demoContext>>) {
const partners = createPartners(process.env['DATABASE_URL']!);
try {
  // The initial-pair scenario intentionally enters the checkpoint before any
  // offer. A newly started real worker creates fresh offers after each restore.
  await x.events.close();
  const { tenants } = await privateJson<{
    tenants: Record<
      string,
      {
        id: string;
        admin: string;
        departments: Record<string, string>;
        reviewers: string[];
      }
    >;
  }>('tenants.json', () => {
    throw Error('TENANTS_REQUIRED');
  });
  const records = await privateJson<
    Record<string, MadeProject & { stage: string }>
  >('scenarios.json', () => ({}));
  const stages = [
    'draft',
    'requested',
    'screening',
    'supervisor',
    'committee',
    'decision',
    'decision',
    'decision',
    'publish',
    'committee',
  ] as const;
  for (const [i, p] of extraSpecs.entries()) {
    if (records[p.id]) continue;
    const record = await buildProject(x, p, tenants, stages[i]!);
    const identities = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => ({}),
    );
    const supervisor = Object.values(identities).find(
      (a) => a.id === record.supervisor,
    )!;
    const actor = await x.login(supervisor);
    if (i === 6 || i === 7) {
      const round = await x.academic.round(actor, record.submission!);
      await x.academic.command(actor, {
        operation: 'final.decide',
        submission: round.id,
        revision: round.revision,
        assignmentRevision: round.assignmentRevision,
        outcome: i === 6 ? 'revision' : 'retain',
        reason:
          i === 6
            ? 'Please address the explicitly documented validation limitations and submit a new frozen FINAL for reassessment.'
            : 'Retain this scoped demonstration internally because its evidence does not support public publication as a completed domain system.',
        publicManifestDigest: round.publicManifestDigest!,
        command: randomUUID(),
      });
    }
    if (i === 9) {
      const a = await x.guest(
        actor,
        record.submission!,
        's10-partial-committee-1',
        personName(3650),
      );
      await x.guest(
        actor,
        record.submission!,
        's10-partial-committee-2',
        personName(3651),
      );
      await x.committee.write(
        a.id,
        a.session,
        0,
        {
          inputContract: 'SCORES_ONLY_V3',
          criteria: internalLevels(p.index).map((level, n) => ({
            code: 'C' + (n + 1),
            level,
            comment:
              'Individually attributed P53 demonstration assessment of the frozen record-validation method and its explicit limitations.',
          })),
        },
        randomUUID(),
        true,
      );
    }
    records[p.id] = {
      ...record,
      stage:
        i === 6
          ? 'assessed_revision'
          : i === 7
            ? 'retained'
            : i === 9
              ? 'partial_committee'
              : stages[i]!,
    };
    await savePrivate('scenarios.json', records);
    console.log(
      JSON.stringify({
        scenario: p.id,
        stage: records[p.id]!.stage,
        project: record.project,
      }),
    );
  }
  const platform = await x.bootstrap();
  for (const [key, index, suspend] of [
    ['reviewer-pending', 950, false],
    ['reviewer-suspended', 951, true],
  ] as const) {
    const person = await credential(
      key,
      personName(index),
      'faculty_supervisor',
      'KKU',
    );
    const identities = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => ({}),
    );
    const admin = await x.login(identities['admin-kku']!);
    let id = (
      await x.sql('SELECT id FROM app.users WHERE email=$1', [person.email])
    )[0]?.id as string | undefined;
    id ??= (
      await x.on.command(admin, randomUUID(), 'person.invite', {
        department: tenants['KKU']!.departments['CS']!,
        role: 'faculty_supervisor',
        name: person.name,
        email: person.email,
        locale: 'en',
      })
    ).id;
    const actor = await x.activate(person, id);
    let profile = (await x.profiles.view(actor)).profiles[0];
    if (!profile) {
      await x.profiles.command(actor, {
        operation: 'save',
        target: id,
        revision: 0,
        command: randomUUID(),
        body: {
          qualification:
            'Fictional P53 computing faculty profile for a controlled approval or suspension scenario; no real academic degree or university employment is asserted.',
          domains: ['software'],
          tags: ['validation'],
          languages: ['en', 'ar'],
          available: true,
        },
      });
      profile = (await x.profiles.view(actor)).profiles[0]!;
    }
    if (suspend && profile.status === 'pending') {
      await x.profiles.command(platform, {
        operation: 'approve',
        target: id,
        revision: profile.revision,
        command: randomUUID(),
        body: {
          reason:
            'P53 controlled fictional approval before demonstrating suspension; no real academic accreditation is claimed.',
        },
      });
      profile = (await x.profiles.view(actor)).profiles[0]!;
    }
    if (suspend && profile.status === 'approved')
      await x.profiles.command(platform, {
        operation: 'suspend',
        target: id,
        revision: profile.revision,
        command: randomUUID(),
        body: {
          reason:
            'P53 fictional availability and eligibility suspension scenario; this identity is excluded from the sixty approved matchable reviewers.',
        },
      });
    const all = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => ({}),
    );
    all[key] = { ...person, id };
    await savePrivate('identities.json', all);
  }
  for (const [key, index, approve] of [
    ['partner-approved', 900, true],
    ['partner-pending', 901, false],
  ] as const) {
    const person = await credential(key, personName(index), 'partner');
    const prior = await x.sql('SELECT id FROM app.users WHERE email=$1', [
      person.email,
    ]);
    if (!prior.length)
      await partners.register({
        name: person.name,
        email: person.email,
        organization: 'Demonstration Applied Research Studio',
        password: person.password,
        confirmation: person.password,
        locale: 'en',
      });
    const actor = await x.login(person);
    const current = (await partners.view(actor))[0]!;
    if (approve && current.status === 'pending')
      await partners.command(platform, {
        command: 'approve',
        commandId: randomUUID(),
        target: actor.id,
        revision: current.revision,
        reason:
          'P53 fictional organization approved for controlled exact-version access demonstrations; no real partnership or institutional agreement is claimed.',
      });
    const all = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => ({}),
    );
    all[key] = { ...person, id: actor.id };
    await savePrivate('identities.json', all);
  }
  console.log(
    JSON.stringify({
      additionalScenarios: Object.keys(records).length,
      partners: 2,
      ordinaryPolicyPreserved: true,
    }),
  );
} finally {
  await partners.close();
  await x.close();
}

}
