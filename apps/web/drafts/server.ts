import 'server-only';
import { createDrafts, type DraftProject } from '@capstone/db/drafts';
import type { AccountView } from '@capstone/db/auth';
import { DatabaseError } from '@capstone/db';
import {
  authorize,
  roleCode,
  draftValidation,
  metadataReadiness,
} from '@capstone/domain';
import { currentAccount } from '../auth/server';
let service: ReturnType<typeof createDrafts> | undefined;
export function drafts() {
  service ??= createDrafts(process.env['DATABASE_URL'] ?? '');
  return service;
}
export function draftPresentation(user: AccountView, p: DraftProject) {
  const role = roleCode(user.role);
  return {
    ...p,
    editable:
      !!role &&
      authorize(
        {
          userId: user.id,
          role,
          universityId: user.universityId,
          active: user.status === 'active',
          partnerApproved: false,
          correlationId: 'draft',
        },
        'draft.edit',
        {
          kind: 'project',
          universityId: user.universityId,
          visible: true,
          authored: p.authored,
          supervised: p.supervised,
          versionState: p.status,
        },
      ) === 'allow',
    readiness: metadataReadiness(p.metadata, p.relations),
  };
}
export async function draftView(user: AccountView, project?: string) {
  const v = await drafts().view(user, project);
  return { ...v, projects: v.projects.map((p) => draftPresentation(user, p)) };
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
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function input(request: Request) {
  if (Number(request.headers.get('content-length')) > 100000)
    throw Error('BODY_LIMIT');
  const reader = request.body?.getReader();
  if (!reader) throw Error('INPUT');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 100000) {
        await reader.cancel();
        throw Error('BODY_LIMIT');
      }
      chunks.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(all),
  ) as Record<string, unknown>;
}
export async function draftHandler(request: Request, governance = false) {
  let user: AccountView | null = null,
    project: string | undefined;
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((k) => k !== 'project'))
      return reply(400, { code: 'INVALID_INPUT' });
    user = await currentAccount(request.headers);
    if (!user) return reply(401, { code: 'UNAUTHENTICATED' });
    if (
      request.headers.has('X-Workspace-Actor') &&
      request.headers.get('X-Workspace-Actor') !== user.id
    )
      return reply(404, { code: 'NOT_FOUND' });
    if (request.method === 'GET' && !governance) {
      if (
        !['student', 'faculty_supervisor', 'university_admin'].includes(
          user.role,
        )
      )
        return reply(403, { code: 'FORBIDDEN' });
      project = url.searchParams.get('project') ?? undefined;
      if (project && !uuid.test(project))
        return reply(404, { code: 'NOT_FOUND' });
      return reply(200, await draftView(user, project));
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      url.search ||
      request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    if (user.role !== (governance ? 'platform_admin' : 'student'))
      return reply(403, { code: 'FORBIDDEN' });
    const data = await input(request);
    if (!data || typeof data !== 'object' || Array.isArray(data))
      return reply(400, { code: 'INVALID_INPUT' });
    project = String(data['project']);
    if (governance) {
      if (
        Object.keys(data).some((k) => !['project', 'reason'].includes(k)) ||
        !uuid.test(project) ||
        typeof data['reason'] !== 'string' ||
        data['reason'].trim().length < 3 ||
        data['reason'].length > 400
      )
        return reply(400, { code: 'INVALID_INPUT' });
      const p = await drafts().governance(user, project, data['reason']);
      return reply(200, draftPresentation(user, p));
    }
    if (
      Object.keys(data).length !== 4 ||
      Object.keys(data).some(
        (k) => !['project', 'version', 'expected', 'fields'].includes(k),
      ) ||
      !uuid.test(project) ||
      !uuid.test(String(data['version'])) ||
      !Number.isSafeInteger(data['expected']) ||
      Number(data['expected']) < 0
    )
      return reply(400, { code: 'INVALID_INPUT' });
    const result = draftValidation(data['fields']);
    if (result.issues.length)
      return reply(400, { code: 'VALIDATION', issues: result.issues });
    const saved = await drafts().save(
      user,
      project,
      String(data['version']),
      Number(data['expected']),
      result.fields,
    );
    return reply(200, draftPresentation(user, saved.project));
  } catch (error) {
    const state = error instanceof DatabaseError ? error.sqlState : undefined;
    const message = error instanceof Error ? error.message : '';
    const status =
      message === 'BODY_LIMIT'
        ? 413
        : state === '40001'
          ? 409
          : state === 'P0002'
            ? 404
            : state === '42501'
              ? 403
              : 400;
    if (status === 409 && user && project) {
      try {
        const latest = (await draftView(user, project)).projects[0];
        return reply(409, {
          code: 'STALE',
          currentRevision: latest?.metadataRevision,
        });
      } catch {
        return reply(404, { code: 'NOT_FOUND' });
      }
    }
    return reply(status, {
      code:
        status === 404
          ? 'NOT_FOUND'
          : status === 403
            ? 'FORBIDDEN'
            : status === 413
              ? 'BODY_LIMIT'
              : 'INVALID_INPUT',
    });
  }
}
