import 'server-only';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
import type { createAccountMail } from './account-mail.js';
import type {
  ResolvedProjectPerson,
  GuidedProjectRecord,
  GuidedProjectList,
} from './project-onboarding-types.js';
const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface ProjectCreationReceipt {
  id: string;
  university: string;
  operation: 'create' | 'team';
  revision: number;
}
export function createProjectOnboarding(
  url: string,
  mail: ReturnType<typeof createAccountMail>,
) {
  const db = createRuntimeDatabase(url);
  const validateActor = (a: AccountView) => {
    if (a.role !== 'university_admin') throw Error('FORBIDDEN');
  };
  async function command(
    a: AccountView,
    cid: string,
    operation: 'create' | 'team',
    payload: Record<string, unknown>,
  ) {
    validateActor(a);
    if (!id.test(cid)) throw Error('INVALID_INPUT');
    const canonical = payload;
    return db.transactions.run(async (tx) => {
      const prepared = (
        await tx.query<{
          value: ProjectCreationReceipt & {
            targets: {
              id: string;
              university: string;
              name: string;
              email: string;
              locale: 'en' | 'ar';
              requiresMail: boolean;
              command: string;
              role: string;
            }[];
          };
        }>('SELECT app.project_task_prepare($1,$2,$3,$4,$5::jsonb) AS value', [
          a.id,
          a.sessionId,
          cid,
          operation,
          JSON.stringify(canonical),
        ])
      )[0]!.value;
      for (const person of prepared.targets)
        if (person.requiresMail)
          await mail.queueInTransaction(
            tx,
            person,
            'ACCOUNT_SETUP',
            a,
            person.command,
            `/${person.locale}/${person.role === 'student' ? 'projects/' : 'supervision/projects/'}${prepared.id}`,
          );
      return (
        await tx.query<{ value: ProjectCreationReceipt }>(
          'SELECT app.project_task_finish($1,$2,$3) AS value',
          [a.id, a.sessionId, cid],
        )
      )[0]!.value;
    });
  }
  return {
    command,
    async resolve(
      a: AccountView,
      department: string,
      person: Record<string, unknown>,
      role: string,
    ): Promise<ResolvedProjectPerson> {
      validateActor(a);
      if (
        !id.test(department) ||
        !['student', 'faculty_supervisor'].includes(role)
      )
        throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: ResolvedProjectPerson }>(
          'SELECT app.project_person_resolution($1,$2,$3,$4::jsonb,$5) AS value',
          [a.id, a.sessionId, department, JSON.stringify(person), role],
        )
      )[0]!.value;
    },
    async faculty(
      a: AccountView,
      department: string,
      q: string,
    ): Promise<
      {
        id: string;
        name: string;
        email: string;
        department: string;
        status: string;
      }[]
    > {
      validateActor(a);
      if (!id.test(department) || q.length > 200) throw Error('INVALID_INPUT');
      return (
        await db.query<{
          value: {
            id: string;
            name: string;
            email: string;
            department: string;
            status: string;
          }[];
        }>('SELECT app.project_faculty_search($1,$2,$3,$4) AS value', [
          a.id,
          a.sessionId,
          department,
          q,
        ])
      )[0]!.value;
    },
    async receipt(
      a: AccountView,
      cid: string,
    ): Promise<ProjectCreationReceipt | null> {
      validateActor(a);
      if (!id.test(cid)) throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: ProjectCreationReceipt | null }>(
          'SELECT app.project_task_receipt($1,$2,$3) AS value',
          [a.id, a.sessionId, cid],
        )
      )[0]!.value;
    },
    async record(a: AccountView, pid: string): Promise<GuidedProjectRecord> {
      if (!id.test(pid)) throw Error('INVALID_INPUT');
      return (
        await db.query<{ value: GuidedProjectRecord }>(
          'SELECT app.guided_project_record($1,$2,$3) AS value',
          [a.id, a.sessionId, pid],
        )
      )[0]!.value;
    },
    async list(
      a: AccountView,
      query: Record<string, string> = {},
    ): Promise<GuidedProjectList> {
      return (
        await db.query<{ value: GuidedProjectList }>(
          'SELECT app.guided_project_list($1,$2,$3,$4,$5,$6,$7) AS value',
          [
            a.id,
            a.sessionId,
            query['q'] ?? '',
            query['status'] ?? '',
            query['department'] ?? '',
            query['year'] ?? '',
            Number(query['page'] ?? 1),
          ],
        )
      )[0]!.value;
    },
    close: () => db.close(),
  };
}
