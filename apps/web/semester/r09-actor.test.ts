import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { semesterFixture } from '../../../tools/semester/fixture.js';

it("an alternate authenticated author cannot attribute another author's frozen preparation to itself through the semester API", async () => {
  const f = await semesterFixture(3358, 'http://127.0.0.1:3357'),
    keys = [
      'APP_ENV',
      'WORKSPACE_ROOT',
      'DATABASE_URL',
      'AUTH_SECRET',
      'AUTH_BASE_URL',
      'PRIVATE_STORAGE_ROOT',
    ] as const,
    beforeEnvironment = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
  let close: (() => Promise<void>) | undefined;
  try {
    Object.assign(process.env, {
      APP_ENV: 'test',
      WORKSPACE_ROOT: process.cwd(),
      DATABASE_URL: f.runtime,
      AUTH_SECRET: f.f.secret,
      AUTH_BASE_URL: f.base,
      PRIVATE_STORAGE_ROOT: f.storageRoot,
    });
    const { semesterHandler, semester } = await import('./server'),
      { authentication } = await import('../auth/server');
    close = async () => {
      await (await semester()).close();
      await authentication().close();
    };
    const project = await f.project('Actor-bound semester preparation'),
      state = await f.semester.state(f.author.actor, project.id),
      original = (
        await f.seed(
          'SELECT title,row_version,updated_by FROM app.project_versions WHERE id=$1',
          [state.project.version],
        )
      )[0]!,
      body = {
        operation: 'metadata.save',
        project: project.id,
        version: state.project.version,
        revision: state.project.metadataRevision,
        fields: {
          ...state.project.metadata,
          title: 'Unsent preparation reviewed by author A',
        },
        command: randomUUID(),
      },
      request = (cookie: string, actor: string) =>
        new Request(f.base + '/api/semester', {
          method: 'POST',
          headers: {
            Cookie: cookie,
            Origin: f.base,
            'Content-Type': 'application/json',
            'X-Workspace-Actor': actor,
          },
          body: JSON.stringify(body),
        });
    // Both identities are real, active, same-project authors. Only the cookie
    // changes; the frozen command retains its original reviewed actor intent.
    const rejected = await semesterHandler(
      request(f.lead.cookie, f.author.actor.id),
    );
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({
      code: 'ACTOR_CHANGED',
      knownRejected: true,
    });
    expect(
      (
        await f.seed(
          'SELECT title,row_version,updated_by FROM app.project_versions WHERE id=$1',
          [state.project.version],
        )
      )[0],
    ).toEqual(original);
    expect(
      (
        await f.seed(
          'SELECT count(*)::int n FROM app.semester_command_receipts WHERE command_id=$1',
          [body.command],
        )
      )[0]!.n,
    ).toBe(0);
    const accepted = await semesterHandler(
      request(f.author.cookie, f.author.actor.id),
    );
    expect(accepted.status).toBe(200);
    expect(
      (
        await f.seed(
          'SELECT updated_by FROM app.project_versions WHERE id=$1',
          [state.project.version],
        )
      )[0]!.updated_by,
    ).toBe(f.author.actor.id);
    const receipt = await semesterHandler(
      new Request(f.base + '/api/semester?command=' + body.command, {
        headers: {
          Cookie: f.author.cookie,
          'X-Workspace-Actor': f.lead.actor.id,
        },
      }),
    );
    expect(receipt.status).toBe(409);
    const other = await f.semester.state(f.lead.actor, project.id);
    expect(other.project.metadata.title).toBe(
      'Unsent preparation reviewed by author A',
    );
  } finally {
    await close?.();
    await f.close();
    for (const key of keys) {
      const value = beforeEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}, 60000);
