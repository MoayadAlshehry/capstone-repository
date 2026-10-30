export interface EditionFile {
  id: string;
  path: string;
  size: number;
  sha256: string;
  visibility: 'public' | 'restricted';
  revision: number;
  submittedVisibility: string | null;
  externallyPublic: boolean;
  canChange: boolean;
}
export interface Edition {
  id: string;
  number: number;
  status: string;
  base: string | null;
  createdAt: string;
  submittedAt: string | null;
  archivedAt: string | null;
  retainedAt: string | null;
  current: boolean;
  published: boolean;
  approvedSubmission: string | null;
  submission: string | null;
  canCreate: boolean;
  license: string | null;
  files: EditionFile[];
}
export interface EditionHistory {
  project: string;
  assignmentRevision: number;
  currentVersion: string;
  publishedVersion: string | null;
  lead: boolean;
  items: Edition[];
}
export interface SuccessorCommand {
  project: string;
  base: string;
  assignmentRevision: number;
  command: string;
}
export interface VisibilityCommand {
  project: string;
  version: string;
  file: string;
  revision: number;
  visibility: 'public' | 'restricted';
  command: string;
}
export interface SuccessorResult {
  project: string;
  version: string;
  number: number;
  base: string;
  state: 'draft';
  publishedVersion: string | null;
}
