import { randomUUID, createHash } from 'node:crypto';
import {
  prepareDemoUploadIntent,
  resumableDemoStorage,
  type DemoUploadIntent,
  type DemoUploadReservation,
} from './upload-recovery.js';
import type { NativeDescriptor } from '@capstone/storage/native';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type pg from 'pg';
import { createAuthentication, type AccountView } from '@capstone/db/auth';
import { createAccountMail } from '@capstone/db/account-mail';
import { decryptAccountMail } from '@capstone/db/account-mail-crypto';
import { createOnboarding } from '@capstone/db/onboarding';
import { createProjectOnboarding } from '@capstone/db/project-onboarding';
import { createReviewers } from '@capstone/db/reviewers';
import { createSemesterEngine } from '@capstone/domain/semester-engine';
import { createAcademicEngine } from '@capstone/domain/academic-engine';
import { createPacketEngine } from '@capstone/domain/packets-engine';
import { createCommitteeService } from '@capstone/domain/committee-engine';
import { createExternalReviewEngine } from '@capstone/domain/external-reviews-engine';
import { createFileEngine } from '@capstone/domain/files-engine';
import { createEditionEngine } from '@capstone/domain/editions-engine';
import { createNativeStorage } from '@capstone/storage/native';
import { createEvaluationEventWorker } from '@capstone/infrastructure/evaluation-events';
import { createCommitteeMailWorker } from '@capstone/infrastructure/committee-mail';
import { createVisualMedia } from '@capstone/infrastructure/visual-media';
import { parseAccountMailConfig } from '../../packages/config/src/account-mail.js';
import { privateJson, savePrivate, type DemoIdentity } from './store.js';
import { readDemoState } from './read-retry.js';
import { ownedInstallation } from './ownership.js';
import { verifyAssetInputs } from './assets.js';
import { demoMailpitApi, capturedCommitteeLink } from './captured-mail.js';

export async function demoContext() {
  const owned = await ownedInstallation(true);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...owned.runtime,
    APP_ENV: 'test',
    ACCOUNT_MAIL_MODE: 'capture',
    COMMITTEE_MAIL_MODE: 'mailpit',
    ACCOUNT_MAIL_APP_ORIGIN: owned.runtime.AUTH_BASE_URL,
    ACCOUNT_MAIL_FROM_ADDRESS: 'accounts@capstone.local',
  };
  Object.assign(process.env, env);
  await verifyAssetInputs();
  const host = { mailpitPort: owned.state.ports.mail_ui };
  const migration = owned.migration;
  const pgRuntime = createRequire(
    new URL('../../packages/db/package.json', import.meta.url),
  )('pg') as typeof pg;
  const pool = new pgRuntime.Pool({ connectionString: migration, max: 1 });
  const sql = async (text: string, args: unknown[] = []) =>
    (await pool.query(text, args)).rows;
  const base = env['AUTH_BASE_URL']!,
    runtime = env['DATABASE_URL']!,
    jobs = env['JOB_DATABASE_URL']!;
  const mailConfig = parseAccountMailConfig(env, process.cwd(), 'test');
  const auth = createAuthentication({
    databaseUrl: runtime,
    secret: env['AUTH_SECRET']!,
    baseURL: base,
    environment: 'test',
  });
  const mail = createAccountMail(runtime, mailConfig),
    on = createOnboarding(runtime, mail),
    projects = createProjectOnboarding(runtime, mail);
  const storage = await createNativeStorage(
    env['PRIVATE_STORAGE_ROOT']!,
    process.cwd(),
    'test',
  );
  const expectedWrites = new Map<string, NativeDescriptor>();
  const uploadIntents = await privateJson<Record<string, DemoUploadIntent>>(
    'file-upload-intents.json',
    () => ({}),
  );
  const files = createFileEngine(
      runtime,
      resumableDemoStorage(storage, expectedWrites),
    ),
    semester = createSemesterEngine(runtime, storage),
    academic = createAcademicEngine(runtime, storage),
    packets = createPacketEngine(runtime, storage);
  const profiles = createReviewers(runtime),
    reviewService = createExternalReviewEngine(runtime, storage),
    editions = createEditionEngine(runtime, storage);
  const committeeService = createCommitteeService(runtime, mailConfig, (f) =>
    storage.verify(f.key, { size: Number(f.size), sha256: f.sha256 }),
  );
  const readState = <T>(label: string, read: () => Promise<T>) =>
    readDemoState(read, (failure) => {
      console.error(failure);
      console.log(
        'DEMO_READ_RETRY | ' +
          label +
          ' | Database busy; retrying this state read once. Saved progress and query limits are unchanged.',
      );
    });
  const reviews = {
    ...reviewService,
    view: (...args: Parameters<typeof reviewService.view>) =>
      readState('external-review-state', () => reviewService.view(...args)),
  };
  const committee = {
    ...committeeService,
    status: (...args: Parameters<typeof committeeService.status>) =>
      readState('committee-status', () => committeeService.status(...args)),
  };
  const media = createVisualMedia({
    databaseUrl: runtime,
    storageRoot: env['PRIVATE_STORAGE_ROOT']!,
    workspaceRoot: process.cwd(),
    environment: 'test',
  });
  const mailer = createCommitteeMailWorker(jobs, mailConfig, 1000000);
  const events = createEvaluationEventWorker(
    jobs,
    (f) => storage.verify(f.key, { size: Number(f.size), sha256: f.sha256 }),
    1000000,
  );
  await events.ready();
  const cache = new Map<string, AccountView>();
  async function login(person: DemoIdentity): Promise<AccountView> {
    if (cache.has(person.email)) return cache.get(person.email)!;
    let r: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await auth.handler(
        new Request(base + '/api/auth/sign-in/email', {
          method: 'POST',
          headers: { Origin: base, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: person.email,
            password: person.password,
          }),
        }),
      );
      if (r.status !== 429) break;
      let remaining =
        Math.max(60, Number(r.headers.get('retry-after') ?? 60)) * 1000;
      console.log(
        JSON.stringify({
          stage: 'respecting-auth-rate-limit',
          waitSeconds: remaining / 1000,
        }),
      );
      while (remaining > 0) {
        const ms = Math.min(remaining, 30000);
        await new Promise((resolve) => setTimeout(resolve, ms));
        remaining -= ms;
      }
    }
    if (!r) throw Error('DEMO_LOGIN_UNAVAILABLE');
    if (r.status !== 200) throw Error('DEMO_REAL_LOGIN_FAILED_' + person.key);
    const cookie = r.headers
      .getSetCookie()
      .map((x) => x.split(';')[0])
      .join('; ');
    const actor = await auth.account(new Headers({ Cookie: cookie }));
    if (!actor) throw Error('DEMO_SESSION_REQUIRED');
    cache.set(person.email, actor);
    return actor;
  }
  async function activate(person: DemoIdentity, id: string) {
    const user = (await sql('SELECT id FROM app.users WHERE id=$1', [id]))[0];
    if (!user) throw Error('DEMO_USER_REQUIRED');
    const accounts = await sql(
      "SELECT id FROM app.auth_accounts WHERE user_id=$1 AND provider_id='credential'",
      [id],
    );
    if (!accounts.length) {
      const m = (
        await sql(
          "SELECT * FROM app.account_email_outbox WHERE user_id=$1 AND purpose='ACCOUNT_SETUP' ORDER BY created_at DESC LIMIT 1",
          [id],
        )
      )[0];
      if (!m) throw Error('REAL_SETUP_INTENT_REQUIRED');
      const content = decryptAccountMail(
        m.ciphertext,
        mailConfig.key,
        `${m.id}|ACCOUNT_SETUP|${id}`,
      ) as { link: string };
      if (
        !(
          await mail.complete(
            new URL(content.link).hash.slice(7),
            'ACCOUNT_SETUP',
            person.password,
            'p53-' + id,
          )
        ).completed
      )
        throw Error('DEMO_SETUP_FAILED');
    }
    return login(person);
  }
  async function bootstrap() {
    const bootstrap = JSON.parse(
      await readFile(
        new URL('../../.local/accounts/bootstrap-admin.json', import.meta.url),
        'utf8',
      ),
    ) as { email: string; password: string };
    const found = await sql(
      "SELECT id,email,full_name FROM app.users WHERE role_code='platform_admin'",
    );
    if (
      found.length !== 1 ||
      found[0]!.email !== owned.state.admin_email ||
      bootstrap.email !== owned.state.admin_email
    )
      throw Error('INSTALLER_INITIAL_ADMIN_REQUIRED');
    const person: DemoIdentity = {
      key: 'platform',
      email: bootstrap.email,
      password: bootstrap.password,
      name: found[0]!.full_name,
      role: 'platform_admin',
      id: found[0]!.id,
    };
    const identities = await privateJson<Record<string, DemoIdentity>>(
      'identities.json',
      () => ({}),
    );
    identities.platform = person;
    await savePrivate('identities.json', identities);
    return login(person);
  }
  async function add(
    actor: AccountView,
    project: string,
    path: string,
    data: Uint8Array,
  ) {
    const state = await semester.state(actor, project);
    const identity = {
      project,
      version: state.project.version,
      uploader: actor.id,
      path,
      bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
    const reservationColumns =
      'id,project_id AS project,version_id AS version,uploader_id AS uploader,relative_path AS path,expected_bytes AS bytes,correlation_id AS correlation,staging_key AS "stagingKey",status';
    const intent = await prepareDemoUploadIntent(identity, uploadIntents, {
      save: () => savePrivate('file-upload-intents.json', uploadIntents),
      known: async (correlation) =>
        (
          await sql(
            `SELECT ${reservationColumns} FROM app.file_reservations WHERE uploader_id=$1 AND correlation_id=$2`,
            [actor.id, correlation],
          )
        )[0] as DemoUploadReservation | undefined,
      pending: async () =>
        (
          await sql(
            `SELECT ${reservationColumns} FROM app.file_reservations WHERE project_id=$1 AND version_id=$2 AND uploader_id=$3 AND canonical_path=lower(normalize($4,NFC)) AND status='active'`,
            [project, state.project.version, actor.id, path],
          )
        )[0] as DemoUploadReservation | undefined,
      verify: storage.verify,
    });
    const r = await files.reserve(actor, {
      project,
      version: state.project.version,
      path,
      expectedBytes: data.length,
      correlationId: intent.correlation,
    });
    const reservation = (
      await sql(
        'SELECT staging_key FROM app.file_reservations WHERE id=$1 AND uploader_id=$2 AND project_id=$3 AND version_id=$4',
        [r.id, actor.id, project, state.project.version],
      )
    )[0];
    if (!reservation) throw Error('DEMO_UPLOAD_RESERVATION_REQUIRED');
    const key = String(reservation.staging_key);
    expectedWrites.set(key, { size: identity.bytes, sha256: identity.sha256 });
    try {
      return await files.finalize(
        actor,
        r.id,
        (async function* () {
          yield data;
        })(),
      );
    } finally {
      expectedWrites.delete(key);
    }
  }

  const seen = new Set<string>();
  async function rememberCaptured(address: string, subject: string) {
    const list = (await (
      await fetch(
        demoMailpitApi(host.mailpitPort) + '/api/v1/messages?limit=100',
      )
    ).json()) as {
      messages: { ID: string; To: { Address: string }[]; Subject: string }[];
    };
    for (const m of list.messages)
      if (
        m.To.some((t) => t.Address === address) &&
        m.Subject.includes(subject)
      )
        seen.add(m.ID);
  }
  async function receive(address: string, subject: string) {
    for (let n = 0; n < 30; n++) {
      await mailer.drain();
      const list = (await (
        await fetch(
          demoMailpitApi(host.mailpitPort) + '/api/v1/messages?limit=100',
        )
      ).json()) as {
        messages: { ID: string; To: { Address: string }[]; Subject: string }[];
      };
      const m = list.messages.find(
        (m) =>
          !seen.has(m.ID) &&
          m.To.some((t) => t.Address === address) &&
          m.Subject.includes(subject),
      );
      if (m) {
        seen.add(m.ID);
        return (await (
          await fetch(
            demoMailpitApi(host.mailpitPort) + '/api/v1/message/' + m.ID,
          )
        ).json()) as { Text: string };
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error('DEMO_SMTP_CAPTURE_REQUIRED');
  }
  async function guest(
    actor: AccountView,
    submission: string,
    key: string,
    name: string,
  ) {
    const email = key + '@capstone.local',
      state = await committee.status(actor, submission);
    const member = state.members.find((m) => m.email === email);
    await rememberCaptured(email, 'Committee assessment invitation');
    await committee.manage(actor, {
      submission,
      revision: state.revision,
      operation: member ? 'resend' : 'invite',
      ...(member ? { invitation: member.id } : {}),
      email,
      name,
      locale: 'en',
      reason: state.sealedAt
        ? 'P53 explicit demonstration committee roster amendment'
        : '',
      command: randomUUID(),
    });
    const m = await receive(email, 'Committee assessment invitation');
    const link = capturedCommitteeLink(m.Text, base),
      id = link.pathname.split('/').at(-1)!,
      secret = link.hash.slice(7);
    await rememberCaptured(email, 'Verification code');
    await committee.challenge(id, secret, email, 'p53-' + id);
    const otp = (await receive(email, 'Verification code')).Text.match(
      /\b\d{6}\b/,
    )?.[0];
    if (!otp) throw Error('DEMO_OTP_MISSING');
    const session = await committee.verify(id, secret, email, otp, 'p53-' + id);
    if (!session) throw Error('DEMO_OTP_VERIFY_FAILED');
    return { id, session };
  }
  return {
    sql,
    pool,
    auth,
    mail,
    on,
    projects,
    storage,
    files,
    semester,
    academic,
    packets,
    profiles,
    reviews,
    editions,
    committee,
    media,
    events,
    login,
    activate,
    bootstrap,
    add,
    guest,
    async close() {
      await events.close();
      await mailer.close();
      await Promise.all([
        auth.close(),
        mail.close(),
        on.close(),
        projects.close(),
        files.close(),
        semester.close(),
        academic.close(),
        packets.close(),
        profiles.close(),
        reviews.close(),
        editions.close(),
        committee.close(),
        media.close(),
      ]);
      await pool.end();
    },
  };
}
