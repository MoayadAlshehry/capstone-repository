import 'server-only';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
import type { AssignmentView, ProjectShell } from './assignments.js';
export interface DraftFields {
  title: string;
  abstract: string;
  keywords: string[];
  academic_year: string;
  domain: string;
}
export interface DraftProject extends ProjectShell {
  metadata: DraftFields;
  metadataRevision: number;
  updatedAt: string;
  relations: {
    scope: boolean;
    authors: boolean;
    lead: boolean;
    supervisor: boolean;
  };
}
export interface DraftView extends Omit<AssignmentView, 'projects'> {
  projects: DraftProject[];
}
export function createDrafts(url: string) {
  const db = createRuntimeDatabase(url);
  async function view(user: AccountView, project?: string): Promise<DraftView> {
    return (
      await db.query<{ value: DraftView }>(
        'SELECT app.draft_view($1,$2,$3) AS value',
        [user.id, user.sessionId, project ?? null],
      )
    )[0]!.value;
  }
  async function save(
    user: AccountView,
    project: string,
    version: string,
    expected: number,
    fields: DraftFields,
  ) {
    return (
      await db.query<{ value: { project: DraftProject } }>(
        'SELECT app.draft_save($1,$2,$3,$4,$5,$6::jsonb) AS value',
        [
          user.id,
          user.sessionId,
          project,
          version,
          expected,
          JSON.stringify(fields),
        ],
      )
    )[0]!.value;
  }
  async function governance(
    user: AccountView,
    project: string,
    reason: string,
  ): Promise<DraftProject> {
    return (
      await db.query<{ value: DraftProject }>(
        'SELECT app.draft_governance($1,$2,$3,$4) AS value',
        [user.id, user.sessionId, project, reason],
      )
    )[0]!.value;
  }
  return { view, save, governance, close: () => db.close() };
}
