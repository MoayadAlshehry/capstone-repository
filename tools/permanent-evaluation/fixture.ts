import { randomBytes, randomUUID } from 'node:crypto';
import { semesterFixture } from '../semester/fixture.js';
import { createAcademicEngine } from '@capstone/domain/academic-engine';
import { createPacketEngine } from '@capstone/domain/packets-engine';
import { createCommitteeService } from '@capstone/domain/committee-engine';
import { createCommitteeMailWorker } from '@capstone/infrastructure/committee-mail';
import { createEvaluationEventWorker } from '@capstone/infrastructure/evaluation-events';
import {
  databaseUrl,
  loadLocalDatabaseConfig,
} from '../local-infrastructure.js';
import { parseAccountMailConfig } from '../../packages/config/src/account-mail.js';
import { emptyAcademicDraft } from '@capstone/domain';
import { createEditionEngine } from '@capstone/domain/editions-engine';
export async function permanentFixture() {
  const f = await semesterFixture(3631, 'http://127.0.0.1:3630'),
    config = await loadLocalDatabaseConfig(),
    jobs = databaseUrl(config, 'jobs', true, f.f.database),
    key = randomBytes(32).toString('base64url');
  process.env['COMMITTEE_MAIL_MODE'] = 'mailpit';
  process.env['MAILPIT_HOST'] = '127.0.0.1';
  process.env['MAILPIT_PORT'] =
    process.env['PERMANENT_QA_MAILPIT_SMTP_PORT'] ?? '16225';
  const mailConfig = parseAccountMailConfig(
    {
      ACCOUNT_MAIL_MODE: 'capture',
      ACCOUNT_MAIL_APP_ORIGIN: f.base,
      ACCOUNT_MAIL_ENCRYPTION_KEY: key,
      ACCOUNT_MAIL_KEY_ID: 'v1',
      ACCOUNT_MAIL_FROM_ADDRESS: 'accounts@capstone.local',
      ACCOUNT_MAIL_CAPTURE_ROOT: process.cwd() + '/.local/permanent-mail',
    },
    process.cwd(),
    'test',
  );
  const academic = createAcademicEngine(f.runtime, f.storage),
    packets = createPacketEngine(f.runtime, f.storage),
    committee = createCommitteeService(
      f.runtime,
      { mode: 'capture', appOrigin: f.base, key, keyId: 'v1' },
      (v) =>
        f.storage.verify(v.key, { size: Number(v.size), sha256: v.sha256 }),
    ),
    mailer = createCommitteeMailWorker(jobs, mailConfig, 1000000);
  const events = createEvaluationEventWorker(
    jobs,
    (v) => f.storage.verify(v.key, { size: Number(v.size), sha256: v.sha256 }),
    20000,
  );
  await events.ready();
  async function prepare(
    title: string,
    supervisorLevel = 3,
    finalizeSupervisor = true,
    checkpointCount = 0,
    artifacts: {
      path: string;
      bytes: Uint8Array;
      public?: boolean;
      legacyGenerated?: boolean;
    }[] = [],
    teamSize = 2,
  ) {
    if (![2, 3, 4, 5, 6].includes(teamSize))
      throw Error('INVALID_CONTROLLED_TEAM_SIZE');
    const students = [
      ...f.students,
      ...Array.from({ length: teamSize - 2 }, (_, i) => ({
        name: 'Controlled additional author ' + (i + 3),
        email: 'impr2-author-' + randomUUID() + '@capstone.local',
        lead: false,
      })),
    ];
    const p =
      teamSize === 2
        ? await f.project(title)
        : await f.projectService.command(f.admin, randomUUID(), 'create', {
            title,
            department: f.dept,
            year: '2026–2027',
            supervisor: f.supervisor,
            students,
            locale: 'en',
          });
    for (const student of students.slice(2)) {
      const row = (
        await f.seed('SELECT id FROM app.users WHERE email=$1', [student.email])
      )[0]!;
      await f.activate(row.id, student.email);
    }
    await f.add(
      f.author.actor,
      p.id,
      'report/research.md',
      Buffer.from(
        '# Controlled research\n\nInspect this frozen synthetic method, its validation protocol and explicit scope limitations.\n',
      ),
    );
    await f.add(
      f.author.actor,
      p.id,
      'src/original.ts',
      Buffer.from('export const originalEvidence = true;\n'),
    );
    for (const artifact of artifacts) {
      const file = await f.add(
        f.author.actor,
        p.id,
        artifact.path,
        artifact.bytes,
      );
      if (artifact.legacyGenerated)
        await f.seed(
          'INSERT INTO app.retired_generated_license_origins(file_id) VALUES($1)',
          [file.fileId],
        );
      if (artifact.public) {
        const editions = createEditionEngine(f.runtime, f.storage);
        try {
          const version = (await f.semester.state(f.lead.actor, p.id)).project
              .version,
            row = (await editions.history(f.lead.actor, p.id)).items
              .find((v) => v.id === version)!
              .files.find((v) => v.id === file.fileId)!;
          await editions.visibility(f.lead.actor, {
            project: p.id,
            version,
            file: file.fileId,
            revision: row.revision,
            visibility: 'public',
            command: randomUUID(),
          });
        } finally {
          await editions.close();
        }
      }
    }
    let ready = await academic.readiness(f.lead.actor, p.id);
    await f.semester.command(f.author.actor, {
      operation: 'metadata.save',
      project: p.id,
      version: ready.final.version,
      revision: ready.studio.project.metadataRevision,
      fields: {
        ...ready.studio.project.metadata,
        abstract:
          'A controlled academic software project provides frozen original evidence, a documented method, reproducible validation and explicit scope limitations for independent assessment.',
        keywords: ['validation'],
        domain: 'software',
      },
      command: randomUUID(),
    });
    for (let i = 0; i < checkpointCount; i++) {
      const state = await f.semester.state(f.lead.actor, p.id);
      const sent = await f.semester.command(f.lead.actor, {
        operation: 'checkpoint.send',
        project: p.id,
        version: state.project.version,
        revision: state.project.metadataRevision,
        assignmentRevision: state.project.row_version,
        manifestDigest: state.manifestDigest,
        command: randomUUID(),
      });
      const checkpoint = await f.semester.round(
        f.faculty.actor,
        sent.submission!,
      );
      await f.semester.command(f.faculty.actor, {
        operation: 'checkpoint.accept',
        submission: checkpoint.id,
        revision: checkpoint.revision,
        assignmentRevision: checkpoint.assignmentRevision,
        comment: 'Controlled checkpoint accepted for continued preparation.',
        command: randomUUID(),
      });
    }
    ready = await academic.readiness(f.lead.actor, p.id);
    await academic.command(f.faculty.actor, {
      operation: 'final.request',
      project: p.id,
      version: ready.final.version,
      assignmentRevision: ready.final.assignmentRevision,
      requestRevision: ready.flow.requestRevision,
      note: 'Submit the original evidence for independent assessment.',
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
    })) as { submission?: string; id?: string };
    let round = await academic.round(
      f.faculty.actor,
      sub.submission ?? sub.id!,
    );
    await academic.command(f.faculty.actor, {
      operation: 'final.screen',
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      outcome: 'accepted',
      reason: '',
      command: randomUUID(),
    });
    round = await academic.round(f.faculty.actor, round.id);
    const payload = emptyAcademicDraft('supervisor');
    payload.criteria.forEach((c) => {
      c.level = supervisorLevel;
      c.comment =
        'The frozen report supports this criterion within the explicitly declared scope.';
      c.locators = [
        {
          file: round.files[0]!.id,
          kind: 'section',
          reference: 'Research method',
        },
      ];
    });
    payload.overall =
      'This is an independently attributed supervisor assessment of the frozen synthetic research method, validation and practical limitations.';
    payload.calibration = true;
    const save = {
      operation: 'assessment.save' as const,
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      draftRevision: 0,
      payload,
      command: randomUUID(),
    };
    await academic.command(f.faculty.actor, save);
    if (finalizeSupervisor)
      await academic.command(f.faculty.actor, {
        ...save,
        operation: 'assessment.finalize',
        draftRevision: 1,
        command: randomUUID(),
      });
    const packet = await packets.fullFinalView(
      f.lead.actor,
      p.id,
      round.version,
    );
    if (!packet) throw Error('PREPUBLICATION_PACKET_REQUIRED');
    await packets.authorizeFinal(f.lead.actor, {
      project: p.id,
      version: round.version,
      revision: Number(packet.revision),
      hash: String(packet.manifestHash),
      acknowledged: true,
      command: randomUUID(),
    });
    return {
      project: p.id,
      version: round.version,
      submission: round.id,
      round,
    };
  }
  const mailpitOrigin =
    'http://127.0.0.1:' +
    (process.env['PERMANENT_QA_MAILPIT_HTTP_PORT'] ?? '16226');
  async function nextMail(
    to: string,
    purpose: string,
    seen = new Set<string>(),
  ) {
    for (let n = 0; n < 20; n++) {
      await mailer.drain();
      const list = (await (
        await fetch(mailpitOrigin + '/api/v1/messages')
      ).json()) as {
        messages: { ID: string; To: { Address: string }[]; Subject: string }[];
      };
      const found = list.messages.find(
        (m) =>
          !seen.has(m.ID) &&
          m.To.some((x) => x.Address === to) &&
          m.Subject.includes(purpose),
      );
      if (found) {
        seen.add(found.ID);
        const message = (await (
          await fetch(mailpitOrigin + '/api/v1/message/' + found.ID)
        ).json()) as { Text: string; HTML: string; ID: string };
        return message;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error('REAL_MAILPIT_DELIVERY_REQUIRED');
  }
  const seen = new Set<string>();
  async function invite(
    sub: string,
    address: string,
    name = 'Same allowed display name',
  ) {
    const state = await committee.status(f.faculty.actor, sub);
    await committee.manage(f.faculty.actor, {
      submission: sub,
      revision: state.revision,
      operation: 'invite',
      email: address,
      name,
      locale: 'en',
      reason: state.sealedAt
        ? 'Controlled explicit roster amendment before completion'
        : '',
      command: randomUUID(),
    });
    const m = await nextMail(address, 'Committee assessment invitation', seen),
      link = m.Text.match(
        /http:\/\/127\.0\.0\.1:3630\/(?:en|ar)\/committee\/[a-f0-9-]{36}#token=[A-Za-z0-9_-]{43}/,
      )?.[0];
    if (!link) throw Error('REAL_INVITATION_LINK_REQUIRED');
    const url = new URL(link);
    return {
      id: url.pathname.split('/').at(-1)!,
      token: url.hash.slice(7),
      email: address,
      seen,
    };
  }
  async function verify(g: { id: string; token: string; email: string }) {
    await committee.challenge(g.id, g.token, g.email, 'isolated-' + g.id);
    const message = await nextMail(g.email, 'Verification code', seen),
      code = message.Text.match(/\b\d{6}\b/)?.[0];
    if (!code) throw Error('EXACT_SIX_DIGITS_REQUIRED');
    const session = await committee.verify(
      g.id,
      g.token,
      g.email,
      code,
      'isolated-' + g.id,
    );
    if (!session) throw Error('REAL_OTP_VERIFICATION_REQUIRED');
    return { session, code, message };
  }
  const payload = (file: string, levels: number[]) => ({
    criteria: levels.map((level, i) => ({
      code: 'C' + (i + 1),
      level,
      comment:
        'The cited frozen evidence supports this independently chosen level within the controlled project scope.',
      locators: [
        { file, kind: 'section', reference: 'Research method and validation' },
      ],
    })),
    overall:
      'My individual assessment addresses only the frozen synthetic evidence, its documented research method, validation and explicit limitations.',
    calibration: true,
  });
  return {
    f,
    committeeKey: key,
    academic,
    packets,
    committee,
    mailer,
    events,
    prepare,
    invite,
    verify,
    nextMail,
    payload,
    seen,
    jobs,
    async close() {
      await events.close();
      await mailer.close();
      await committee.close();
      await packets.close();
      await academic.close();
      await f.close();
    },
  };
}
