import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { resetFixture } from '../auth/local.js';
import { root } from '../automation/core.js';
import {
  databaseUrl,
  loadLocalDatabaseConfig,
} from '../local-infrastructure.js';
import { createAuthentication, type AccountView } from '@capstone/db/auth';
import { createOnboarding } from '@capstone/db/onboarding';
import { createAccountMail } from '@capstone/db/account-mail';
import { decryptAccountMail } from '@capstone/db/account-mail-crypto';
import { createProjectOnboarding } from '@capstone/db/project-onboarding';
import { withMigrationConnection } from '@capstone/db/migration';
import { createNativeStorage } from '@capstone/storage/native';
import { createFileEngine } from '@capstone/domain/files-engine';
import { createSemesterEngine } from '@capstone/domain/semester-engine';
import { createUploadRuntime } from '@capstone/infrastructure/uploads';
export async function semesterFixture(
  uploadPort = 3194,
  baseURL = 'http://localhost:3193',
) {
  const f = {run:randomUUID(),database:'capstone_local',secret:(await readFile('.local/auth/secret','utf8')).trim(),accounts:{accounts:[JSON.parse(await readFile('.local/accounts/bootstrap-admin.json','utf8'))]}},
    config = await loadLocalDatabaseConfig(),
    runtime = databaseUrl(config, 'runtime', true, f.database),
    migration = databaseUrl(config, 'migration', true, f.database),
    base = baseURL,
    key = JSON.parse(await readFile('.local/runtime.json','utf8')).ACCOUNT_MAIL_ENCRYPTION_KEY,
    password = randomBytes(24).toString('base64url'),
    storageRoot = join(root, '.local/storage');
  await mkdir(storageRoot, { recursive: true, mode: 0o700 });
  const auth = createAuthentication({
      databaseUrl: runtime,
      secret: f.secret,
      baseURL: base,
      environment: 'test',
    }),
    mail = createAccountMail(runtime, {
      mode: 'capture',
      appOrigin: base,
      key,
      keyId: 'v1',
    }),
    on = createOnboarding(runtime, mail),
    projectService = createProjectOnboarding(runtime, mail),
    storage = await createNativeStorage(storageRoot, root, 'test'),
    files = createFileEngine(runtime, storage),
    semester = createSemesterEngine(runtime, storage);
  const seed = async (sql: string, args: unknown[] = []) =>
    withMigrationConnection(
      migration,
      async (c) => (await c.query(sql, args)).rows,
    );
  async function login(email: string, pw = password) {
    const response = await auth.handler(
      new Request(base + '/api/auth/sign-in/email', {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      }),
    );
    if (response.status !== 200) throw Error('REAL_LOGIN_FAILED');
    const cookie = response.headers
        .getSetCookie()
        .map((x) => x.split(';')[0])
        .join('; '),
      actor = await auth.account(new Headers({ Cookie: cookie }));
    if (!actor) throw Error('REAL_SESSION_FAILED');
    return { actor, cookie };
  }
  async function activate(id: string, email: string) {
    const m = (
      await seed(
        "SELECT * FROM app.account_email_outbox WHERE user_id=$1 AND purpose='ACCOUNT_SETUP' ORDER BY created_at DESC LIMIT 1",
        [id],
      )
    )[0]!;
    const content = decryptAccountMail(
      m.ciphertext,
      key,
      `${m.id}|ACCOUNT_SETUP|${id}`,
    ) as { link: string };
    const token = new URL(content.link).hash.slice(7);
    if (
      !(await mail.complete(token, 'ACCOUNT_SETUP', password, 'r05-' + id))
        .completed
    )
      throw Error('REAL_SETUP_FAILED');
    return login(email);
  }
  const bootstrap = f.accounts.accounts.find(
      (x) => x.role === 'platform_admin',
    )!,
    platform = (await login(bootstrap.email, bootstrap.password)).actor;
  const uni = (
    await on.command(platform, randomUUID(), 'university.create', {
      code: 'RELEASE_COMMITTEE',
      name_en: 'Academic Studio Semester University',
      name_ar: 'جامعة الاستوديو الأكاديمي للفصل',
    })
  ).id;
  const adminId = (
      await on.command(platform, randomUUID(), 'administrator.invite', {
        university: uni,
        name: 'Semester institutional administrator',
        email: 'admin.release.committee@capstone.local',
        locale: 'en',
      })
    ).id,
    admin = (await activate(adminId, 'admin.release.committee@capstone.local'))
      .actor;
  const dept = (
    await on.read<{ id: string; code: string }[]>(admin, 'departments')
  ).find((x) => x.code === 'CS')!.id;
  const supervisor = {
      name: 'Dr. Lina العبدالله — Semester Supervision',
      email: 'faculty.release.committee@capstone.local',
    },
    students = [
      {
        name: 'Omar منصور — Collaborative Systems',
        email: 'lead.release.committee@capstone.local',
        lead: true,
      },
      {
        name: 'Maha إبراهيم — Applied Research',
        email: 'author.release.committee@capstone.local',
        lead: false,
      },
    ];
  async function project(title = 'Connected Learning — نظم الحوسبة') {
    return projectService.command(admin, randomUUID(), 'create', {
      title,
      department: dept,
      year: '2026–2027',
      supervisor,
      students,
      locale: 'en',
    });
  }
  const made = await project();
  const ids = await seed(
    'SELECT id,email FROM app.users WHERE email=ANY($1::text[])',
    [[supervisor.email, ...students.map((x) => x.email)]],
  );
  const faculty = await activate(
      ids.find((x) => x.email === supervisor.email)!.id,
      supervisor.email,
    ),
    lead = await activate(
      ids.find((x) => x.email === students[0]!.email)!.id,
      students[0]!.email,
    ),
    author = await activate(
      ids.find((x) => x.email === students[1]!.email)!.id,
      students[1]!.email,
    );
  const upload = await createUploadRuntime({
      databaseUrl: runtime,
      secret: f.secret,
      baseURL: base,
      storageRoot,
      workspaceRoot: root,
      environment: 'test',
      origins: [base],
    }),
    server = createServer((req, res) => {
      void upload.handle(req, res);
    });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(uploadPort, '127.0.0.1', resolve);
  });
  async function add(
    actor: AccountView,
    pid: string,
    path: string,
    bytes: Uint8Array,
  ) {
    const state = await semester.state(actor, pid),
      r = await files.reserve(actor, {
        project: pid,
        version: state.project.version,
        path,
        expectedBytes: bytes.length,
        correlationId: randomUUID(),
      });
    return files.finalize(
      actor,
      r.id,
      (async function* () {
        yield bytes;
      })(),
    );
  }
  let disconnected = false;
  async function disconnect() {
    if (disconnected) return;
    disconnected = true;
    server.closeIdleConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await upload.close();
    await semester.close();
    await files.close();
    await projectService.close();
    await on.close();
    await mail.close();
    await auth.close();
  }
  return {
    f,
    runtime,
    migration,
    base,
    key,
    password,
    storageRoot,
    storage,
    auth,
    mail,
    on,
    projectService,
    files,
    semester,
    seed,
    login,
    activate,
    platform,
    admin,
    uni,
    dept,
    made,
    project,
    lead,
    author,
    faculty,
    supervisor,
    students,
    add,
    uploadBase: 'http://localhost:' + uploadPort,
    disconnect,
    async close() {
      await disconnect();
      await resetFixture(f.run);
      await rm(storageRoot, { recursive: true, force: true });
    },
  };
}
