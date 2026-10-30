import 'server-only';
import { z } from 'zod';
import { DatabaseError } from '@capstone/db';
import { createProjectOnboarding } from '@capstone/db/project-onboarding';
import {
  projectCreationSchema,
  projectTeamSchema,
  projectPersonSchema,
} from '@capstone/domain';
import { currentAccount } from '../auth/server';
import { accountMail } from '../account-entry/server';
let service: ReturnType<typeof createProjectOnboarding> | undefined;
export const projectOnboarding = () =>
  (service ??= createProjectOnboarding(
    process.env['DATABASE_URL'] ?? '',
    accountMail(),
  ));
const reply = (status: number, value: unknown) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Cookie',
    },
  });
async function boundedJson(req: Request) {
  if (Number(req.headers.get('content-length') ?? 0) > 1024 * 1024)
    throw Error('INVALID_INPUT');
  const reader = req.body?.getReader();
  if (!reader) throw Error('INVALID_INPUT');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const x = await reader.read();
    if (x.done) break;
    bytes += x.value.length;
    if (bytes > 1024 * 1024) {
      await reader.cancel();
      throw Error('INVALID_INPUT');
    }
    chunks.push(x.value);
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const x of chunks) {
    all.set(x, offset);
    offset += x.length;
  }
  return JSON.parse(new TextDecoder().decode(all)) as unknown;
}
const resolution = z
  .object({
    department: z.uuid(),
    role: z.enum(['student', 'faculty_supervisor']),
    person: projectPersonSchema,
  })
  .strict();
export async function projectOnboardingHandler(req: Request) {
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply(401, { code: 'UNAUTHENTICATED', knownRejected: true });
    if (a.role !== 'university_admin')
      return reply(403, { code: 'FORBIDDEN', knownRejected: true });
    const url = new URL(req.url);
    if (req.method === 'GET') {
      if (url.searchParams.has('command')) {
        if (
          [...url.searchParams].some(([k]) => k !== 'command') ||
          url.searchParams.getAll('command').length !== 1
        )
          return reply(400, { code: 'INVALID_INPUT' });
        return reply(200, {
          receipt: await projectOnboarding().receipt(
            a,
            url.searchParams.get('command')!,
          ),
        });
      }
      if (
        url.searchParams.get('faculty') === '1' &&
        [...url.searchParams].every(([k]) =>
          ['faculty', 'department', 'q'].includes(k),
        ) &&
        [...url.searchParams.keys()].every(
          (k) => url.searchParams.getAll(k).length === 1,
        )
      )
        return reply(200, {
          rows: await projectOnboarding().faculty(
            a,
            url.searchParams.get('department') ?? '',
            url.searchParams.get('q') ?? '',
          ),
        });
      return reply(400, { code: 'INVALID_INPUT' });
    }
    if (req.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      req.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !req.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN', knownRejected: true });
    const envelope = z
      .object({
        operation: z.enum([
          'resolve',
          'preview',
          'team.preview',
          'create',
          'team',
        ]),
        command: z.uuid().optional(),
        payload: z.unknown(),
      })
      .strict()
      .safeParse(await boundedJson(req));
    if (!envelope.success)
      return reply(400, { code: 'INVALID_INPUT', knownRejected: true });
    const b = envelope.data;
    if (b.operation === 'resolve') {
      const x = resolution.safeParse(b.payload);
      if (!x.success)
        return reply(400, { code: 'INVALID_INPUT', knownRejected: true });
      return reply(
        200,
        await projectOnboarding().resolve(
          a,
          x.data.department,
          x.data.person,
          x.data.role,
        ),
      );
    }
    const team = b.operation === 'team' || b.operation === 'team.preview',
      parsed = (team ? projectTeamSchema : projectCreationSchema).safeParse(
        b.payload,
      );
    if (!parsed.success)
      return reply(400, {
        code: 'INVALID_INPUT',
        knownRejected: true,
        fields: parsed.error.issues.map((x) => x.path.join('.')),
      });
    if (b.operation === 'preview' || b.operation === 'team.preview') {
      const data = parsed.data;
      const record =
        'project' in data
          ? await projectOnboarding().record(a, data.project)
          : null;
      const department =
        'department' in data ? data.department : record!.departmentId;
      let supervisor;
      try {
        supervisor = await projectOnboarding().resolve(
          a,
          department,
          data.supervisor,
          'faculty_supervisor',
        );
      } catch (e) {
        if (
          e instanceof DatabaseError &&
          ['40001', '42501'].includes(e.sqlState ?? '')
        )
          return reply(409, {
            code: 'IDENTITY_OR_STATE_CHANGED',
            knownRejected: true,
            fields: ['supervisor.email'],
          });
        throw e;
      }
      if (record?.locked && supervisor.status !== 'active')
        return reply(409, { code: 'FROZEN_TEAM', knownRejected: true });
      let students;
      if (record?.locked) {
        if (
          data.students.length !== record.authors.length ||
          data.students.some(
            (x, i) =>
              x.existingId !== record.authors[i]?.id ||
              x.email !== record.authors[i]?.email ||
              x.name !== record.authors[i]?.name ||
              (x.lead && record.authors[i]?.status !== 'active'),
          )
        )
          return reply(409, { code: 'FROZEN_TEAM', knownRejected: true });
        students = record.authors.map((x) => ({
          id: x.id,
          name: x.name,
          email: x.email,
          role: 'student',
          department: record.department,
          status: x.status,
          identity: 'existing-active',
          nameMatches: true,
        }));
      } else {
        const outcomes = await Promise.allSettled(
          data.students.map((x) =>
            projectOnboarding().resolve(
              a,
              department,
              {
                name: x.name,
                email: x.email,
                ...(x.existingId ? { existingId: x.existingId } : {}),
              },
              'student',
            ),
          ),
        );
        const fields: string[] = [];
        for (let i = 0; i < outcomes.length; i++) {
          const item = outcomes[i]!;
          if (item.status === 'rejected') {
            if (
              item.reason instanceof DatabaseError &&
              ['40001', '42501'].includes(item.reason.sqlState ?? '')
            )
              fields.push(`students.${i}.email`);
            else throw item.reason;
          }
        }
        if (fields.length)
          return reply(409, {
            code: 'IDENTITY_OR_STATE_CHANGED',
            knownRejected: true,
            fields,
          });
        students = outcomes.map((x) => {
          if (x.status !== 'fulfilled') throw Error('UNAVAILABLE');
          return x.value;
        });
      }
      return reply(200, { supervisor, students });
    }
    if (!b.command)
      return reply(400, { code: 'INVALID_INPUT', knownRejected: true });
    return reply(
      200,
      await projectOnboarding().command(
        a,
        b.command,
        team ? 'team' : 'create',
        parsed.data,
      ),
    );
  } catch (e) {
    const state = e instanceof DatabaseError ? e.sqlState : undefined;
    const rejected =
      ['22023', '22P02', '42501', '40001', '23505', '23514', '23503'].includes(
        state ?? '',
      ) ||
      e instanceof z.ZodError ||
      e instanceof SyntaxError ||
      (e instanceof Error &&
        ['INVALID_INPUT', 'FORBIDDEN'].includes(e.message));
    const status =
      state === '42501' || (e instanceof Error && e.message === 'FORBIDDEN')
        ? 403
        : state === '40001' || state === '23505'
          ? 409
          : rejected
            ? 400
            : 503;
    return reply(status, {
      code:
        status === 403
          ? 'FORBIDDEN'
          : status === 409
            ? 'IDENTITY_OR_STATE_CHANGED'
            : status === 400
              ? 'INVALID_INPUT'
              : 'OUTCOME_UNCERTAIN',
      knownRejected: rejected,
    });
  }
}
