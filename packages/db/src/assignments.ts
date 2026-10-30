import 'server-only';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
export interface AssignmentPerson {
  id: string;
  name: string;
  department?: string;
  status?: string;
  order?: number;
  lead?: boolean;
}
export interface AssignmentGroup {
  id: string;
  code: string | null;
  department: string;
  used: boolean;
  members: AssignmentPerson[];
}
export interface ProjectShell {
  id: string;
  group: string | null;
  department: string;
  university: string;
  universityAr: string;
  row_version: number;
  status: string;
  version: string;
  locked: boolean;
  authored: boolean;
  lead: boolean;
  supervised: boolean;
  supervisor: AssignmentPerson;
  authors: AssignmentPerson[];
}
export interface AssignmentView {
  groups: AssignmentGroup[];
  students: AssignmentPerson[];
  faculty: AssignmentPerson[];
  projects: ProjectShell[];
}
export function createAssignments(url: string) {
  const db = createRuntimeDatabase(url);
  async function view(
    user: AccountView,
    target?: string,
  ): Promise<AssignmentView> {
    const rows = await db.query<{ value: AssignmentView }>(
      'SELECT app.assignment_view($1,$2,$3) AS value',
      [user.id, user.sessionId, target ?? null],
    );
    return rows[0]!.value;
  }
  async function command(
    user: AccountView,
    operation: string,
    fields: unknown,
  ) {
    if (user.role !== 'university_admin') throw Error('FORBIDDEN');
    return (
      await db.query<{ value: { id: string; row_version: number } }>(
        'SELECT app.assignment_command($1,$2,$3,$4::jsonb) AS value',
        [user.id, user.sessionId, operation, JSON.stringify(fields)],
      )
    )[0]!.value;
  }
  return { view, command, close: () => db.close() };
}
