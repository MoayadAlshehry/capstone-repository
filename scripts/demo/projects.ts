import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { emptyAcademicDraft } from '@capstone/domain';
import type { AccountView } from '@capstone/db/auth';
import { demoContext } from './context.js';
import {
  credential,
  privateJson,
  savePrivate,
  type DemoIdentity,
} from './store.js';
import {
  internalLevels,
  personName,
  authorName,
  type ProjectSpec,
} from './scenarios.js';
type Context = Awaited<ReturnType<typeof demoContext>>;
type Tenant = {
  id: string;
  admin: string;
  departments: Record<string, string>;
  reviewers: string[];
};
export interface MadeProject {
  plan: string;
  project: string;
  version: string;
  submission?: string;
  lead: string;
  supervisor: string;
  authors: string[];
  files?: { id: string; path: string }[];
  published?: boolean;
}

export async function buildProject(
  x: Context,
  p: ProjectSpec,
  tenants: Record<string, Tenant>,
  stage:
    | 'draft'
    | 'requested'
    | 'screening'
    | 'supervisor'
    | 'committee'
    | 'decision'
    | 'publish' = 'publish',
) {
  const tenant = tenants[p.university.code]!,
    all = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => ({}),
    );
  const admin = await x.login(all['admin-' + p.university.code.toLowerCase()]!);
  const department = tenant.departments[p.department]!;
  const supervisor =
    all[
      `reviewer-${p.university.code.toLowerCase()}-${String(['CS', 'IS', 'CE'].indexOf(p.department) + 1).padStart(2, '0')}`
    ]!;
  const faculty = await x.login(supervisor);
  const students = [];
  for (let n = 0; n < p.teamSize; n++)
    students.push(
      await credential(
        `${p.id.toLowerCase()}-author-${n + 1}`,
        authorName(p, n),
        'student',
        p.university.code,
      ),
    );
  const prior = await x.sql(
    'SELECT v.project_id id,v.id version,v.status,v.approved_submission_id FROM app.project_versions v WHERE v.title=$1 AND v.university_id=$2',
    [p.title, tenant.id],
  );
  if (prior.length > 1) throw Error('DEMO_DUPLICATE_PROJECT');
  if (prior[0]?.status === 'archived') {
    const members = await x.sql(
      'SELECT user_id FROM app.project_authors WHERE project_id=$1 ORDER BY author_order',
      [prior[0].id],
    );
    return {
      plan: p.id,
      project: String(prior[0].id),
      version: String(prior[0].version),
      submission: String(prior[0].approved_submission_id),
      lead: String(members[0]!.user_id),
      supervisor: faculty.id,
      authors: members.map((m) => String(m.user_id)),
      published: true,
    };
  }
  const made =
    prior[0] ??
    (await x.projects.command(admin, randomUUID(), 'create', {
      title: p.title,
      department,
      year: p.year,
      supervisor: { name: supervisor.name, email: supervisor.email },
      students: students.map((s, n) => ({
        name: s.name,
        email: s.email,
        lead: n === 0,
      })),
      locale: 'en',
    }));
  const members: AccountView[] = [];
  for (const student of students) {
    const id = (
      await x.sql('SELECT id FROM app.users WHERE email=$1', [student.email])
    )[0]?.id as string | undefined;
    if (!id) throw Error('PROJECT_AUTHOR_REQUIRED');
    members.push(await x.activate(student, id));
    const saved = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => ({}),
    );
    saved[student.key] = { ...student, id };
    await savePrivate('identities.json', saved);
  }
  const lead = members[0]!,
    project = made.id as string;
  let ready = await x.academic.readiness(lead, project);
  const record: MadeProject = {
    plan: p.id,
    project,
    version: ready.final.version,
    lead: lead.id,
    supervisor: faculty.id,
    authors: members.map((a) => a.id),
  };
  const actual = (
    await x.sql(
      'SELECT status,approved_submission_id FROM app.project_versions WHERE id=$1',
      [record.version],
    )
  )[0]!;
  if (actual.status === 'archived')
    return {
      ...record,
      submission: actual.approved_submission_id as string,
      published: true,
    };
  if (actual.status === 'draft') {
    await x.semester.command(lead, {
      operation: 'metadata.save',
      project,
      version: record.version,
      revision: ready.studio.project.metadataRevision,
      fields: {
        ...ready.studio.project.metadata,
        abstract: p.problem + ' ' + p.method + ' ' + p.limitations,
        keywords: p.keywords,
        domain: p.domain,
      },
      command: randomUUID(),
    });
    const root = join(process.cwd(), 'demo/assets/content', p.id);
    async function walk(path: string): Promise<string[]> {
      const entries = await readdir(path, { withFileTypes: true });
      const out: string[] = [];
      for (const e of entries) {
        if (e.isSymbolicLink()) throw Error('CONTENT_LINK_FORBIDDEN');
        if (e.isDirectory()) out.push(...(await walk(join(path, e.name))));
        else if (e.isFile()) out.push(join(path, e.name));
      }
      return out.sort();
    }
    for (const path of await walk(root)) {
      const name = relative(root, path);
      let file = (
        await x.sql(
          'SELECT id,visibility FROM app.project_files WHERE version_id=$1 AND relative_path=$2 AND is_current',
          [record.version, name],
        )
      )[0];
      if (!file) {
        const added = await x.add(lead, project, name, await readFile(path));
        file = { id: added.fileId, visibility: 'restricted' };
      }
      if (!name.startsWith('annex/') && file.visibility !== 'public') {
        const policy = await x.editions.policy(lead, project, record.version);
        const state = await x.sql(
          'SELECT policy_revision FROM app.project_files WHERE id=$1',
          [file.id],
        );
        await x.editions.visibility(lead, {
          project,
          version: record.version,
          file: file.id as string,
          revision: Number(state[0]!.policy_revision),
          visibility: 'public',
          command: randomUUID(),
        });
        if (!policy.files.some((f) => f.file === file!.id))
          throw Error('REAL_FILE_POLICY_REQUIRED');
      }
    }
    const target = { kind: 'cover' as const, project, version: record.version },
      media = await x.media.read(lead, target);
    if (!media.image)
      await x.media.write(
        lead,
        { target, revision: media.revision, command: randomUUID() },
        await readFile(join(process.cwd(), 'demo/assets/covers', p.id + '.png')),
      );
    if (stage === 'draft') return record;
    ready = await x.academic.readiness(lead, project);
    if (!ready.flow.requestValid) {
      await x.academic.command(faculty, {
        operation: 'final.request',
        project,
        version: ready.final.version,
        assignmentRevision: ready.final.assignmentRevision,
        requestRevision: ready.flow.requestRevision,
        note: 'Please submit the documented research and immutable original evidence for the P53 demonstration assessment.',
        command: randomUUID(),
      });
    }
    if (stage === 'requested') return record;
    ready = await x.academic.readiness(lead, project);
    const sub = (await x.academic.command(lead, {
      operation: 'final.submit',
      project,
      version: ready.final.version,
      revision: ready.final.revision,
      assignmentRevision: ready.final.assignmentRevision,
      manifestDigest: ready.manifestDigest,
      command: randomUUID(),
    })) as { submission?: string; id?: string };
    record.submission = sub.submission ?? sub.id!;
  } else {
    record.submission = (
      await x.sql(
        'SELECT id FROM app.project_submissions WHERE version_id=$1 ORDER BY round_number DESC LIMIT 1',
        [record.version],
      )
    )[0]!.id as string;
  }
  if (!record.submission) throw Error('FINAL_SUBMISSION_REQUIRED');
  if (stage === 'screening') return record;
  let round = await x.academic.round(faculty, record.submission);
  const screening = (await x.academic.readiness(lead, project)).flow.screening;
  if (!screening) {
    await x.academic.command(faculty, {
      operation: 'final.screen',
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      outcome: 'accepted',
      reason: '',
      command: randomUUID(),
    });
    round = await x.academic.round(faculty, record.submission);
  }
  if (stage === 'supervisor') return record;
  record.files = round.files.map((f) => ({ id: f.id, path: f.path }));
  const hasSupervisor =
    (
      await x.sql(
        "SELECT id FROM app.effective_internal_assessments WHERE submission_id=$1 AND layer='supervisor'",
        [record.submission],
      )
    ).length > 0;
  if (!hasSupervisor) {
    const payload = emptyAcademicDraft('supervisor'),
      levels = internalLevels(p.index);
    payload.criteria.forEach((c, n) => {
      c.level = levels[n]!;
      c.comment = `The frozen ${p.title.split(':')[0]} method, comparison and disclosed limits support this level within the demonstration scope. See sections3 through8; no field deployment is asserted.`;
    });
    await x.academic.command(faculty, {
      operation: 'assessment.save',
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      draftRevision: 0,
      payload,
      command: randomUUID(),
    });
    await x.academic.command(faculty, {
      operation: 'assessment.finalize',
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      draftRevision: 1,
      payload,
      command: randomUUID(),
    });
  }
  const packet = await x.packets.fullFinalView(lead, project, record.version);
  if (!packet) throw Error('LEAD_PACKET_VIEW_REQUIRED');
  if (!packet.authorized)
    await x.packets.authorizeFinal(lead, {
      project,
      version: record.version,
      revision: Number(packet.revision),
      hash: String(packet.manifestHash),
      acknowledged: true,
      command: randomUUID(),
    });
  if (stage === 'committee') return record;
  const pendingGuests: { n: number; guest: { id: string; session: string } }[] =
    [];
  for (let n = 0; n < 2; n++) {
    const address = `${p.id.toLowerCase()}-committee-${n + 1}@capstone.local`;
    if (
      (
        await x.sql(
          'SELECT 1 FROM app.current_committee_members a JOIN app.committee_invitations i ON i.id=a.invite_id WHERE i.case_id=(SELECT id FROM app.evaluation_cases WHERE submission_id=$1) AND i.email=$2',
          [record.submission, address],
        )
      ).length
    )
      continue;
    const guest = await x.guest(
      faculty,
      record.submission,
      `${p.id.toLowerCase()}-committee-${n + 1}`,
      personName(2000 + p.index * 2 + n),
    );
    pendingGuests.push({ n, guest });
  }
  for (const { n, guest } of pendingGuests) {
    const levels = internalLevels(p.index, n);
    await x.committee.write(
      guest.id,
      guest.session,
      0,
      {
        inputContract: 'SCORES_ONLY_V3',
        criteria: levels.map((level, i) => ({
          code: 'C' + (i + 1),
          level,
          comment: `My individually attributed demonstration assessment of ${p.topic} follows the frozen comparison, method, validation and limitations. The selected level describes this bounded artifact only.`,
        })),
      },
      randomUUID(),
      true,
    );
  }
  round = await x.academic.round(faculty, record.submission);
  if (stage === 'decision') return record;
  await x.academic.command(faculty, {
    operation: 'final.decide',
    submission: round.id,
    revision: round.revision,
    assignmentRevision: round.assignmentRevision,
    outcome: 'publish',
    reason: p.eligible
      ? 'Publish this complete, internally assessed P53 demonstration research snapshot.'
      : 'Publish this bounded graduation demonstration with its moderate or low assessment and explicit limitations; publication is not external-review eligibility.',
    publicManifestDigest: round.publicManifestDigest!,
    command: randomUUID(),
  });
  return { ...record, published: true };
}

