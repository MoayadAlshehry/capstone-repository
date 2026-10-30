export interface RoundAuthor {
  id: string;
  name: string;
  order: number;
  lead: boolean;
}
export interface RoundFile {
  id: string;
  path: string;
  sha256: string;
  visibility: string;
  size: number;
  mime: string;
}
export interface RoundMetadata {
  title: string;
  abstract: string;
  keywords: string[];
  academicYear: string;
  domain: string;
  university: { id: string; nameEn: string; nameAr: string };
  department: { id: string; code: string; nameEn: string; nameAr: string };
  supervisor: { id: string; name: string };
  version: { id: string; number: number };
  license: { identifier: string | null; state: string; noticeKey: string };
}
export interface ReviewDecision {
  id: string;
  decision: 'revision_required' | 'rejected' | 'archived';
  comment: string;
  actor: string;
  decidedAt: string;
}
export interface SubmissionRound {
  id: string;
  project: string;
  version: string;
  round: number;
  submittedAt: string;
  metadata: RoundMetadata;
  authors: RoundAuthor[];
  files: RoundFile[];
  status: string;
  revision: number;
  assignmentRevision: number;
  firstSubmittedAt: string;
  retainedAt: string | null;
  currentRound: boolean;
  canDecide: boolean;
  decision: ReviewDecision | null;
}
export interface SubmissionState {
  project: string;
  version: string;
  status: string;
  revision: number;
  assignmentRevision: number;
  issues: string[];
  canSubmit: boolean;
  history: {
    id: string;
    round: number;
    submittedAt: string;
    decision: string | null;
    comment: string | null;
  }[];
  latest: string | null;
}
export interface SubmissionResult {
  id: string;
  round: number;
  state: string;
  revision: number;
  project?: string;
  version?: string;
  submission?: string;
}
export interface SubmitCommand {
  project: string;
  version: string;
  revision: number;
  assignmentRevision: number;
  command: string;
}
export interface DecisionCommand {
  submission: string;
  revision: number;
  assignmentRevision: number;
  operation: 'revision' | 'reject';
  comment: string;
  command: string;
}
export const submissionUuid = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
export function decisionCommentValid(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    s.trim().length >= 3 &&
    s.trim().length <= 2000 &&
    !/[\p{Cf}\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(s) &&
    !/(password|secret|token|cookie)\s*[:=]/i.test(s)
  );
}
