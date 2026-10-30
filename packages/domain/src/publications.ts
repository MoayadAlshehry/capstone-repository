export interface PublicationCommand {
  submission: string;
  revision: number;
  assignmentRevision: number;
  command: string;
}
export interface PublicationState {
  submission: string;
  issues: string[];
  canPublish: boolean;
  published: boolean;
  approvedSubmission: string | null;
  archivedAt: string | null;
  publishedVersion: string | null;
  internal: number | null;
  rubric: string;
  supervisor: number | null;
  committee: number | null;
  disagreement: boolean;
}
export interface PublicationResult {
  submission: string;
  version: string;
  project: string;
  state: 'archived';
  archivedAt: string;
}
export interface ArchiveItem {
  project: string;
  version: string;
  submission: string;
  title: string;
  state: 'archived' | 'rejected';
  authors: { name: string; order: number }[];
  supervisor: string;
  retainedAt: string | null;
  archivedAt: string | null;
  decisionAt: string;
  reason: string | null;
}
export interface PublicationProjection {
  project: string;
  version: string;
  versionNumber: number;
  title: string;
  abstract: string;
  keywords: string[];
  university: { nameEn: string; nameAr: string };
  department: { code: string; nameEn: string; nameAr: string };
  academicYear: string;
  domain: string;
  authors: { name: string; order: number }[];
  supervisor: { name: string };
  publishedAt: string;
  internal?: number | null;
  rubric?: string;
  evaluation?: import('./evaluation-summary.js').EvaluationSummary;
  /** Historical projection compatibility only; active projections omit declaration metadata. */
  license?: { identifier: string | null; state: string; noticeKey: string };
}
export interface AuditFilter {
  project?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
export interface AuditItem {
  id: string;
  actor_id: string | null;
  actor_role: string;
  action: string;
  object_type: string;
  object_id: string;
  project_id: string | null;
  version_id: string | null;
  occurred_at: string;
}
