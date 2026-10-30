import { it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { permanentFixture } from './fixture.js';
import { createNativeFileReader } from '@capstone/infrastructure/native-files';
it('real SMTP failure/retry, exact OTP expiry, attempt lock, generation resend, single-use session and concurrent roster controls', async () => {
  const x = await permanentFixture();
  try {
    const p = await x.prepare(
        'Guest security and transactional mail failure case',
      ),
      address = randomUUID() + '@capstone.local',
      state = await x.committee.status(x.f.faculty.actor, p.submission);
    process.env['MAILPIT_PORT'] = '16229';
    await x.committee.manage(x.f.faculty.actor, {
      submission: p.submission,
      revision: state.revision,
      operation: 'invite',
      email: address,
      name: 'Synthetic security recipient',
      locale: 'ar',
      reason: '',
      command: randomUUID(),
    });
    await x.mailer.drain();
    let mail = (
      await x.f.seed(
        'SELECT state,attempts FROM app.committee_mail_outbox ORDER BY created_at DESC LIMIT 1',
      )
    )[0]!;
    expect(mail.state).toBe('failed');
    expect(mail.attempts).toBe(1);
    const setClock = async (value: string) => {
      if (!/^[0-9T: .+Z-]+$/.test(value)) throw Error('UNSAFE_TEST_CLOCK');
      await x.f.seed(
        `CREATE OR REPLACE FUNCTION app.governance_now() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT '${value}'::timestamptz $$;CREATE OR REPLACE FUNCTION app.lifecycle_now() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT '${value}'::timestamptz $$;`,
      );
    };
    const now = Date.now();
    await setClock(new Date(now + 20000).toISOString());
    process.env['MAILPIT_PORT'] =
      process.env['PERMANENT_QA_MAILPIT_SMTP_PORT'] ?? '16225';
    const invitation = await x.nextMail(
      address,
      'Committee assessment invitation',
      x.seen,
    );
    expect(invitation.HTML).toContain('lang="ar"');
    mail = (
      await x.f.seed(
        'SELECT state,attempts,ciphertext FROM app.committee_mail_outbox ORDER BY created_at DESC LIMIT 1',
      )
    )[0]!;
    expect(mail.state).toBe('mailpit_accepted');
    expect(mail.attempts).toBe(2);
    expect(mail.ciphertext).toBeNull();
    const link = invitation.Text.match(
        /http:\/\/127\.0\.0\.1:3630\/ar\/committee\/[a-f0-9-]{36}#token=[A-Za-z0-9_-]{43}/,
      )![0],
      u = new URL(link),
      g = {
        id: u.pathname.split('/').at(-1)!,
        token: u.hash.slice(7),
        email: address,
      };
    await x.committee.challenge(g.id, g.token, g.email, 'security-otp');
    const m = await x.nextMail(address, 'Verification code', x.seen),
      code = m.Text.match(/\b\d{6}\b/)![0],
      expiry = (
        await x.f.seed(
          'SELECT expires_at::text t FROM app.committee_challenges WHERE invite_id=$1',
          [g.id],
        )
      )[0]!.t as string;
    await setClock(expiry);
    expect(
      await x.committee.verify(g.id, g.token, g.email, code, 'exact-expiry'),
    ).toBeNull();
    await setClock(new Date(now + 700000).toISOString());
    await x.committee.challenge(g.id, g.token, g.email, 'new-otp');
    const next = await x.nextMail(address, 'Verification code', x.seen),
      newCode = next.Text.match(/\b\d{6}\b/)![0];
    for (let n = 0; n < 6; n++)
      expect(
        await x.committee.verify(
          g.id,
          g.token,
          g.email,
          newCode === '000000' ? '999999' : '000000',
          'attempt-' + n,
        ),
      ).toBeNull();
    expect(
      await x.committee.verify(
        g.id,
        g.token,
        g.email,
        newCode,
        'locked-correct',
      ),
    ).toBeNull();
    expect(
      (
        await x.f.seed(
          'SELECT attempts FROM app.committee_challenges WHERE invite_id=$1',
          [g.id],
        )
      )[0]!.attempts,
    ).toBe(6);
    await setClock(new Date(now + 770000).toISOString());
    await x.committee.challenge(g.id, g.token, g.email, 'new-generation-code');
    const recovery = await x.nextMail(address, 'Verification code', x.seen),
      recoveryCode = recovery.Text.match(/\b\d{6}\b/)![0],
      session = await x.committee.verify(
        g.id,
        g.token,
        g.email,
        recoveryCode,
        'recovery',
      );
    expect(session).toBeTruthy();
    expect(
      await x.committee.verify(
        g.id,
        g.token,
        g.email,
        recoveryCode,
        'recovery-replay',
      ),
    ).toBeNull();
    const sessionExpiry = (
      await x.f.seed(
        'SELECT expires_at::text t FROM app.committee_guest_sessions WHERE invite_id=$1 ORDER BY verified_at DESC LIMIT 1',
        [g.id],
      )
    )[0]!.t as string;
    await setClock(sessionExpiry);
    await expect(x.committee.read(g.id, session!)).rejects.toThrow();
    await setClock(new Date(now + 770000).toISOString());
    const r = await x.committee.status(x.f.faculty.actor, p.submission);
    const edits = await Promise.allSettled(
      [1, 2].map((n) =>
        x.committee.manage(x.f.faculty.actor, {
          submission: p.submission,
          revision: r.revision,
          operation: 'invite',
          email: randomUUID() + '@capstone.local',
          name: 'Parallel recipient ' + n,
          locale: 'en',
          reason: 'Controlled bounded concurrent roster addition',
          command: randomUUID(),
        }),
      ),
    );
    expect(edits.filter((e) => e.status === 'fulfilled')).toHaveLength(1);
    const latest = await x.committee.status(x.f.faculty.actor, p.submission);
    await x.committee.manage(x.f.faculty.actor, {
      submission: p.submission,
      revision: latest.revision,
      operation: 'revoke',
      invitation: g.id,
      locale: 'en',
      reason: 'Controlled authorization revocation before assessment.',
      command: randomUUID(),
    });
    await expect(x.committee.read(g.id, session!)).rejects.toThrow();
    await expect(
      x.committee.write(
        g.id,
        session!,
        0,
        x.payload(p.round.files[0]!.id, [3, 3, 3, 3, 3, 3, 3]),
        randomUUID(),
        true,
      ),
    ).rejects.toThrow();
  } finally {
    process.env['MAILPIT_PORT'] =
      process.env['PERMANENT_QA_MAILPIT_SMTP_PORT'] ?? '16225';
    await x.close();
  }
});
it('same exact guest scope on native tree, preview, range and streamed ZIP; wrong project/version and terminal reads return no evidence', async () => {
  const x = await permanentFixture(),
    native = await createNativeFileReader({
      databaseUrl: x.f.runtime,
      workspaceRoot: process.cwd(),
      storageRoot: x.f.storageRoot,
      environment: 'test',
    });
  try {
    const p = await x.prepare('Scoped committee native evidence case'),
      other = await x.prepare('Unrelated evidence case'),
      g = await x.invite(p.submission, randomUUID() + '@capstone.local'),
      v = await x.verify(g),
      actor = {
        kind: 'committee-guest' as const,
        invitation: g.id,
        sessionHash: createHash('sha256').update(v.session).digest('hex'),
      };
    const files = await native.list(actor, p.project, p.version, p.submission);
    expect(files).toHaveLength(2);
    await expect(
      native.list(actor, other.project, other.version, other.submission),
    ).rejects.toThrow();
    const file = files.find((f) => f.path.endsWith('.ts'))!,
      preview = await native.preview(
        actor,
        p.project,
        p.version,
        file.id,
        p.submission,
      );
    expect(preview.text).toContain('originalEvidence');
    const bytes = await native.bytes(
      actor,
      p.project,
      p.version,
      file.id,
      'original',
      'bytes=0-5',
      p.submission,
    );
    expect(bytes.range?.length).toBe(6);
    let n = 0;
    for await (const chunk of bytes.stream) n += chunk.byteLength;
    expect(n).toBe(6);
    const zip = await native.zip(
        actor,
        p.project,
        p.version,
        undefined,
        p.submission,
      ),
      buffer = Buffer.from(await new Response(zip).arrayBuffer());
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const { writeFile } = await import('node:fs/promises'),
      { join } = await import('node:path'),
      { execFileSync } = await import('node:child_process'),
      path = join(x.f.storageRoot, 'guest-scope-export.zip');
    await writeFile(path, buffer);
    const entries = execFileSync(
      'python3',
      [
        '-c',
        'import zipfile,sys; print(chr(10).join(zipfile.ZipFile(sys.argv[1]).namelist()))',
        path,
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter((x) => !x.endsWith('/'));
    expect(entries.sort()).toEqual(files.map((f) => f.path).sort());
    const current = await x.committee.status(x.f.faculty.actor, p.submission);
    await x.committee.manage(x.f.faculty.actor, {
      submission: p.submission,
      revision: current.revision,
      operation: 'revoke',
      invitation: g.id,
      locale: 'en',
      reason: 'Controlled native evidence authorization revocation.',
      command: randomUUID(),
    });
    await expect(
      native.list(actor, p.project, p.version, p.submission),
    ).rejects.toThrow();
    await expect(
      native.bytes(
        actor,
        p.project,
        p.version,
        file.id,
        'original',
        'bytes=0-5',
        p.submission,
      ),
    ).rejects.toThrow();
    await expect(
      native.zip(actor, p.project, p.version, undefined, p.submission),
    ).rejects.toThrow();
  } finally {
    await native.close();
    await x.close();
  }
});
it('three-member unrounded rational result, every member required, and no derived fractional level represented as an individual form', async () => {
  const x = await permanentFixture();
  try {
    const p = await x.prepare('Three-member rational aggregate case'),
      members = [];
    for (let i = 0; i < 3; i++)
      members.push(
        await x.invite(p.submission, randomUUID() + '@capstone.local'),
      );
    for (let i = 0; i < 3; i++) {
      const g = members[i]!,
        v = await x.verify(g),
        levels = [3, 3, 3, 3, 3, 3, i === 2 ? 4 : 3];
      await x.committee.write(
        g.id,
        v.session,
        0,
        x.payload(p.round.files[0]!.id, levels),
        randomUUID(),
        true,
      );
      if (i < 2)
        expect(
          (await x.committee.status(x.f.faculty.actor, p.submission)).result,
        ).toBeNull();
    }
    const r = await x.academic.round(x.f.faculty.actor, p.submission);
    expect(Number(r.assessment!.committee)).toBeCloseTo(75.41666666666667, 12);
    expect(Number(r.assessment!.internal)).toBe(75.25);
    const rows = await x.f.seed(
      'SELECT sum_quarter_points,member_count,mean_quarter_points,criterion_means FROM app.committee_results r JOIN app.evaluation_cases c ON c.id=r.case_id WHERE c.project_id=$1',
      [p.project],
    );
    expect(rows[0]!.sum_quarter_points).toBe(905);
    expect(rows[0]!.member_count).toBe(3);
    expect(
      Number((rows[0]!.criterion_means as Record<string, number>)['C7']),
    ).toBeCloseTo(10 / 3, 12);
    expect(
      (
        await x.f.seed(
          "SELECT count(*)::int n FROM app.internal_assessments WHERE submission_id=$1 AND layer='committee'",
          [p.submission],
        )
      )[0]!.n,
    ).toBe(0);
  } finally {
    await x.close();
  }
});

it('a real post-DATA SMTP disconnect is UNKNOWN and never automatically resent', async () => {
  const { createServer } = await import('node:net');
  const x = await permanentFixture();
  let connections = 0;
  const server = createServer((socket) => {
    connections++;
    socket.write('220 controlled SMTP failure endpoint\r\n');
    let data = false,
      buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === '.') socket.destroy();
          continue;
        }
        if (line === 'DATA') {
          data = true;
          socket.write('354 Send message\r\n');
        } else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address();
    if (!port || typeof port === 'string') throw Error('TEST_SMTP_REQUIRED');
    const p = await x.prepare('Ambiguous delivery must not duplicate messages'),
      state = await x.committee.status(x.f.faculty.actor, p.submission);
    process.env['MAILPIT_PORT'] = String(port.port);
    await x.committee.manage(x.f.faculty.actor, {
      submission: p.submission,
      revision: state.revision,
      operation: 'invite',
      email: 'ambiguous@capstone.local',
      name: 'Synthetic ambiguous recipient',
      locale: 'en',
      reason: '',
      command: randomUUID(),
    });
    await x.mailer.drain();
    expect(
      (
        await x.f.seed(
          'SELECT state FROM app.committee_mail_outbox ORDER BY created_at DESC LIMIT 1',
        )
      )[0]!.state,
    ).toBe('unknown');
    await x.mailer.drain();
    expect(connections).toBe(1);
  } finally {
    process.env['MAILPIT_PORT'] =
      process.env['PERMANENT_QA_MAILPIT_SMTP_PORT'] ?? '16225';
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await x.close();
  }
});
