import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createCommitteeService } from '@capstone/domain/committee-engine';
import { createCommitteeMailWorker } from '@capstone/infrastructure/committee-mail';
import { parseAccountMailConfig } from '../../packages/config/src/account-mail.js';
import { semesterFixture } from '../semester/fixture.js';
import { createAcademicEngine } from '@capstone/domain/academic-engine';
import { createEditionEngine } from '@capstone/domain/editions-engine';
import { createReviewers } from '@capstone/db/reviewers';
import { createExternalReviewEngine } from '@capstone/domain/external-reviews-engine';
import { createAllocationEngine } from '@capstone/domain/allocation-engine';
import { createNativeFileReader } from '@capstone/infrastructure/native-files';
import { createPacketEngine } from '@capstone/domain/packets-engine';
import {
  databaseUrl,
  loadLocalDatabaseConfig,
} from '../local-infrastructure.js';
import { emptyAcademicDraft } from '@capstone/domain';
import { previewFixtures } from '../native-files/formats.js';
export async function independentFixture(
  port = 3250,
  base = 'http://localhost:3197',
) {
  const f = await semesterFixture(port, base),
    academic = createAcademicEngine(f.runtime, f.storage),
    editions = createEditionEngine(f.runtime, f.storage),
    profiles = createReviewers(f.runtime),
    packets = createPacketEngine(f.runtime, f.storage),
    reviews = createExternalReviewEngine(f.runtime, f.storage),
    config = await loadLocalDatabaseConfig(),
    jobs = createAllocationEngine(
      databaseUrl(config, 'jobs', true, f.f.database),
      (file) =>
        f.storage.verify(file.key, {
          size: Number(file.size),
          sha256: file.sha256,
        }),
    ),
    native = await createNativeFileReader({
      databaseUrl: f.runtime,
      workspaceRoot: process.cwd(),
      storageRoot: f.storageRoot,
      environment: 'test',
    });
  await mkdir(process.cwd() + '/.local/handoff/workspace-v2/r07', {
    recursive: true,
    mode: 0o700,
  });
  const people = [];
  const committeeKey = randomBytes(32).toString('base64url'),
    committee = createCommitteeService(
      f.runtime,
      { mode: 'capture', appOrigin: base, key: committeeKey, keyId: 'v1' },
      (file) =>
        f.storage.verify(file.key, {
          size: Number(file.size),
          sha256: file.sha256,
        }),
    );
  process.env['COMMITTEE_MAIL_MODE'] = 'mailpit';
  process.env['MAILPIT_HOST'] = '127.0.0.1';
  process.env['MAILPIT_PORT'] =
    process.env['PERMANENT_QA_MAILPIT_SMTP_PORT'] ?? '16225';
  const committeeMailer = createCommitteeMailWorker(
    databaseUrl(config, 'jobs', true, f.f.database),
    parseAccountMailConfig(
      {
        ACCOUNT_MAIL_MODE: 'capture',
        ACCOUNT_MAIL_APP_ORIGIN: base,
        ACCOUNT_MAIL_ENCRYPTION_KEY: committeeKey,
        ACCOUNT_MAIL_KEY_ID: 'v1',
        ACCOUNT_MAIL_FROM_ADDRESS: 'accounts@capstone.local',
        ACCOUNT_MAIL_CAPTURE_ROOT:
          process.cwd() + '/.local/independent-committee',
      },
      process.cwd(),
      'test',
    ),
    1000000,
  );
  const seenMessages = new Set<string>();
  const mailpitOrigin =
    'http://127.0.0.1:' +
    (process.env['PERMANENT_QA_MAILPIT_HTTP_PORT'] ?? '16226');
  async function receive(address: string, subject: string) {
    for (let n = 0; n < 40; n++) {
      await committeeMailer.drain();
      const list = (await (
        await fetch(mailpitOrigin + '/api/v1/messages')
      ).json()) as {
        messages: { ID: string; To: { Address: string }[]; Subject: string }[];
      };
      const found = list.messages.find(
        (m) =>
          !seenMessages.has(m.ID) &&
          m.To.some((x) => x.Address === address) &&
          m.Subject.includes(subject),
      );
      if (found) {
        seenMessages.add(found.ID);
        return (await (
          await fetch(mailpitOrigin + '/api/v1/message/' + found.ID)
        ).json()) as { Text: string };
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error('REAL_COMMITTEE_MAILPIT_DELIVERY_REQUIRED');
  }
  for (let i = 0; i < 3; i++) {
    const uni = (
      await f.on.command(f.platform, randomUUID(), 'university.create', {
        code: 'REVIEW_R07_' + i,
        name_en: 'Independent Review University ' + i,
        name_ar: 'جامعة التحكيم المستقل ' + i,
      })
    ).id;
    const adminId = (
      await f.on.command(f.platform, randomUUID(), 'administrator.invite', {
        university: uni,
        name: 'Independent institution administrator ' + i,
        email: `admin.independent.${i}@capstone.local`,
        locale: 'en',
      })
    ).id;
    const admin = (
        await f.activate(adminId, `admin.independent.${i}@capstone.local`)
      ).actor,
      department = (
        await f.on.read<{ id: string; code: string }[]>(admin, 'departments')
      ).find((x) => x.code === 'CS')!.id,
      email = `faculty.independent.${i}@capstone.local`,
      id = (
        await f.on.command(admin, randomUUID(), 'person.invite', {
          department,
          role: 'faculty_supervisor',
          name: ['Dr. Sara Haddad', 'Dr. Khalid منصور', 'Dr. Amal Faris'][i],
          email,
          locale: 'en',
        })
      ).id,
      person = await f.activate(id, email);
    await profiles.command(person.actor, {
      command: randomUUID(),
      target: id,
      operation: 'save',
      revision: 0,
      body: {
        qualification:
          'Controlled synthetic faculty computing researcher with documented academic research and teaching experience.',
        domains: ['software'],
        tags: ['validation'],
        languages: ['en', 'ar'],
        available: true,
      },
    });
    let profile = (await profiles.view(person.actor)).profiles[0]!;
    await profiles.command(f.platform, {
      command: randomUUID(),
      target: id,
      operation: 'approve',
      revision: profile.revision,
      body: {
        reason: 'Controlled independent-review engineering test capability',
      },
    });
    profile = (await profiles.view(person.actor)).profiles[0]!;
    await profiles.command(person.actor, {
      command: randomUUID(),
      target: id,
      operation: 'calibrate',
      revision: profile.revision,
      body: { version: 'EXTERNAL_V1', acknowledged: true },
    });
    people.push({ ...person, email });
  }
  async function final(
    title: string,
    decision: 'publish' | 'retain' = 'publish',
    extra = 0,
    authorizePacket = true,
  ) {
    const p = await f.project(title),
      report = (await previewFixtures()).find((x) => x.path.endsWith('.pdf'))!;
    await f.add(f.author.actor, p.id, 'report/final-study.pdf', report.bytes);
    await f.add(
      f.author.actor,
      p.id,
      'src/analysis.ts',
      Buffer.from(
        'export function difference(a: number, b: number) {\n  return a - b;\n}\n',
      ),
    );
    await f.add(
      f.author.actor,
      p.id,
      'data/validation.csv',
      Buffer.from('case,expected,actual\nfirst,3,3\nsecond,4,4\n'),
    );
    for (let i = 0; i < extra; i++)
      await f.add(
        f.author.actor,
        p.id,
        `research/semester/analysis/repeatability/batches/batch-${String(i).padStart(3, '0')}/record.txt`,
        Buffer.from('Controlled bounded performance record ' + i + '\n'),
      );
    let ready = await academic.readiness(f.lead.actor, p.id);
    await f.semester.command(f.author.actor, {
      operation: 'metadata.save',
      project: p.id,
      version: ready.final.version,
      revision: ready.studio.project.metadataRevision,
      fields: {
        ...ready.studio.project.metadata,
        abstract:
          'This controlled academic research project documents an original method, reproducible validation records and practical limits. Every original remains in the frozen final submission.',
        keywords: ['validation'],
        domain: 'software',
      },
      command: randomUUID(),
    });
    ready = await academic.readiness(f.lead.actor, p.id);
    const publicFile = ready.studio.files.find((x) => x.path.endsWith('.csv'))!;
    await editions.visibility(f.lead.actor, {
      project: p.id,
      version: ready.final.version,
      file: publicFile.id,
      revision: publicFile.policyRevision!,
      visibility: 'public',
      command: randomUUID(),
    });
    ready = await academic.readiness(f.lead.actor, p.id);
    await academic.command(f.faculty.actor, {
      operation: 'final.request',
      project: p.id,
      version: ready.final.version,
      assignmentRevision: ready.final.assignmentRevision,
      requestRevision: ready.flow.requestRevision,
      note: 'Submit the documented method and validation originals for final assessment.',
      command: randomUUID(),
    });
    ready = await academic.readiness(f.lead.actor, p.id);
    const sub = (await academic.command(f.lead.actor, {
      operation: 'final.submit',
      project: p.id,
      version: ready.final.version,
      revision: ready.final.revision,
      assignmentRevision: ready.final.assignmentRevision,
      manifestDigest: ready.manifestDigest,
      command: randomUUID(),
    })) as { id: string };
    let round = await academic.round(f.faculty.actor, sub.id);
    await academic.command(f.faculty.actor, {
      operation: 'final.screen',
      submission: sub.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      outcome: 'accepted',
      reason: '',
      command: randomUUID(),
    });
    await completeAssessment(sub.id);
    if (decision === 'publish' && authorizePacket) {
      const consent = await packets.fullFinalView(
        f.lead.actor,
        p.id,
        ready.final.version,
      );
      await packets.authorizeFinal(f.lead.actor, {
        project: p.id,
        version: ready.final.version,
        revision: Number(consent!.revision),
        hash: String(consent!.manifestHash),
        acknowledged: true,
        command: randomUUID(),
      });
    }
    round = await academic.round(f.faculty.actor, sub.id);
    await academic.command(f.faculty.actor, {
      operation: 'final.decide',
      submission: sub.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      outcome: decision,
      reason:
        decision === 'retain' ? 'Controlled internally retained final.' : '',
      publicManifestDigest: round.publicManifestDigest!,
      command: randomUUID(),
    });
    return {
      project: p.id,
      version: ready.final.version,
      submission: sub.id,
      files: round.files,
    };
  }
  async function completeAssessment(submission: string) {
    let round = await academic.round(f.faculty.actor, submission);
    for (const layer of ['supervisor'] as const) {
      round = await academic.round(f.faculty.actor, submission);
      const payload = emptyAcademicDraft(layer);
      payload.criteria.forEach((c) => {
        c.level = 3;
        c.comment =
          'The exact frozen original supports the criterion within its controlled scope.';
        c.locators = [
          {
            file: round.files[0]!.id,
            kind: 'section',
            reference: 'Frozen method and validation',
          },
        ];
      });
      payload.overall =
        'Controlled original supervisor assessment of the frozen academic study, its documented method, validation evidence and scope limitations.';
      payload.calibration = true;
      await academic.command(f.faculty.actor, {
        operation: 'assessment.save',
        submission: submission,
        revision: round.revision,
        assignmentRevision: round.assignmentRevision,
        draftRevision: 0,
        payload,
        command: randomUUID(),
      });
      await academic.command(f.faculty.actor, {
        operation: 'assessment.finalize',
        submission: submission,
        revision: round.revision,
        assignmentRevision: round.assignmentRevision,
        draftRevision: 1,
        payload,
        command: randomUUID(),
      });
    }
    const invitations = [];
    for (let i = 0; i < 2; i++) {
      const address = randomUUID() + '@capstone.local',
        roster = await committee.status(f.faculty.actor, submission);
      await committee.manage(f.faculty.actor, {
        submission: submission,
        revision: roster.revision,
        operation: 'invite',
        email: address,
        name: 'Controlled committee member ' + (i ? 'B' : 'A'),
        locale: 'en',
        reason: '',
        command: randomUUID(),
      });
      const message = await receive(address, 'Committee assessment invitation'),
        link = message.Text.match(
          /https?:\/\/[^\s]+\/committee\/[a-f0-9-]{36}#token=[A-Za-z0-9_-]{43}/,
        )?.[0];
      if (!link) throw Error('REAL_MEMBER_INVITATION_REQUIRED');
      const url = new URL(link);
      invitations.push({
        id: url.pathname.split('/').at(-1)!,
        token: url.hash.slice(7),
        email: address,
      });
    }
    for (const member of invitations) {
      await committee.challenge(
        member.id,
        member.token,
        member.email,
        member.id,
      );
      const message = await receive(member.email, 'Verification code'),
        code = message.Text.match(/\b\d{6}\b/)?.[0];
      if (!code) throw Error('REAL_SIX_DIGIT_CODE_REQUIRED');
      const session = await committee.verify(
        member.id,
        member.token,
        member.email,
        code,
        member.id,
      );
      if (!session) throw Error('VERIFIED_GUEST_REQUIRED');
      await committee.write(
        member.id,
        session,
        0,
        {
          criteria: Array.from({ length: 7 }, (_, i) => ({
            code: 'C' + (i + 1),
            level: 3,
            comment:
              'The frozen evidence supports this independently recorded criterion.',
            locators: [
              {
                file: round.files[0]!.id,
                kind: 'section',
                reference: 'Frozen method and validation',
              },
            ],
          })),
          overall:
            'Independent synthetic committee assessment of the exact frozen study and its documented validation, reproducibility and scope limitations.',
          calibration: true,
        },
        randomUUID(),
        true,
      );
    }
  }
  async function allocate() {
    return jobs.run(randomUUID());
  }
  async function disconnect() {
    await Promise.all([
      academic.close(),
      editions.close(),
      profiles.close(),
      packets.close(),
      reviews.close(),
      jobs.close(),
      native.close(),
      committee.close(),
      committeeMailer.close(),
    ]);
    await f.disconnect();
  }
  async function close() {
    await disconnect();
    await f.close();
  }
  return {
    ...f,
    academic,
    editions,
    profiles,
    reviews,
    jobs,
    native,
    people,
    final,
    completeAssessment,
    allocate,
    disconnect,
    close,
  };
}
export type IndependentFixture = Awaited<ReturnType<typeof independentFixture>>;
