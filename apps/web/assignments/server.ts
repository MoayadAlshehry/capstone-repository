import 'server-only';
import { createAssignments } from '@capstone/db/assignments';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
import type { AccountView } from '@capstone/db/auth';
import { authorize, roleCode, validAssignmentInput } from '@capstone/domain';
let service: ReturnType<typeof createAssignments> | undefined;
function assignments() {
  service ??= createAssignments(process.env['DATABASE_URL'] ?? '');
  return service;
}
export async function assignmentView(user: AccountView, target?: string) {
  const view = await assignments().view(user, target),
    role = roleCode(user.role);
  if (
    !role ||
    view.projects.some(
      (p) =>
        authorize(
          {
            userId: user.id,
            role,
            universityId: user.universityId,
            active: user.status === 'active',
            partnerApproved: false,
            correlationId: 'assignment-read',
          },
          'project.read',
          {
            kind: 'project',
            universityId: user.universityId,
            visible: true,
            authored: p.authored,
            supervised: p.supervised,
            lead: p.lead,
          },
        ) !== 'allow',
    )
  )
    throw Error('FORBIDDEN');
  return view;
}
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
async function boundedInput(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > 100000)
    throw Error('BODY_LIMIT');
  const reader = request.body?.getReader();
  if (!reader) throw Error('INVALID_INPUT');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 100000) {
        await reader.cancel();
        throw Error('BODY_LIMIT');
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function assignmentHandler(request: Request) {
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((k) => k !== 'project'))
      return reply(400, { code: 'INVALID_INPUT' });
    const user = await currentAccount(request.headers);
    if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
    if (
      !['university_admin', 'student', 'faculty_supervisor'].includes(user.role)
    )
      return reply(403, { code: 'FORBIDDEN' });
    if (request.method === 'GET')
      return reply(
        200,
        await assignmentView(
          user,
          url.searchParams.get('project') ?? undefined,
        ),
      );
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      url.search ||
      request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    if (Number(request.headers.get('content-length')) > 100000)
      return reply(413, { code: 'INVALID_INPUT' });
    const body: unknown = await boundedInput(request);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return reply(400, { code: 'INVALID_INPUT' });
    const data = body as Record<string, unknown>;
    if (Object.keys(data).some((k) => !['command', 'fields'].includes(k)))
      return reply(400, { code: 'INVALID_INPUT' });
    if (!validAssignmentInput(String(data['command']), data['fields']))
      return reply(400, { code: 'INVALID_INPUT' });
    return reply(
      200,
      await assignments().command(
        user,
        String(data['command']),
        data['fields'],
      ),
    );
  } catch (error) {
    const state = error instanceof DatabaseError ? error.sqlState : undefined;
    const message = error instanceof Error ? error.message : '';
    const status =
      message === 'BODY_LIMIT'
        ? 413
        : state === 'P0002'
          ? 404
          : state === '40001' || state === '23505'
            ? 409
            : state === '42501' || message === 'FORBIDDEN'
              ? 403
              : 400;
    return reply(status, {
      code:
        status === 409
          ? 'STALE'
          : status === 404
            ? 'NOT_FOUND'
            : status === 403
              ? 'FORBIDDEN'
              : 'INVALID_INPUT',
    });
  }
}
