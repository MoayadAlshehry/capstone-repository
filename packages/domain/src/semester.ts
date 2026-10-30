import type { AcademicFlow } from './academic-flow.js';
import { z } from 'zod';
import { draftValidation, type DraftFields } from './drafts.js';
import type { RoundMetadata, RoundAuthor } from './submissions.js';
const revision = z.number().int().nonnegative().max(2147483646);
const fields = z
  .object({
    title: z.string(),
    abstract: z.string(),
    keywords: z.array(z.string()),
    academic_year: z.string(),
    domain: z.string(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const issue of draftValidation(value).issues)
      context.addIssue({
        code: 'custom',
        path: [issue.field],
        message: issue.code,
      });
  })
  .transform((value) => draftValidation(value).fields);
export const semesterMetadataSchema = z
  .object({
    operation: z.literal('metadata.save'),
    project: z.uuid(),
    version: z.uuid(),
    revision,
    fields,
    command: z.uuid(),
  })
  .strict();
export const checkpointSendSchema = z
  .object({
    operation: z.literal('checkpoint.send'),
    project: z.uuid(),
    version: z.uuid(),
    revision,
    assignmentRevision: revision,
    manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    command: z.uuid(),
  })
  .strict();
export const checkpointDecisionSchema = z
  .object({
    operation: z.enum(['checkpoint.changes', 'checkpoint.accept']),
    submission: z.uuid(),
    revision,
    assignmentRevision: revision,
    comment: z.string().trim().max(2000),
    command: z.uuid(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      (v.operation === 'checkpoint.changes' &&
        (v.comment.length < 3 || !/[\p{L}\p{N}]/u.test(v.comment))) ||
      /[\p{Cf}\x00-\x1f\x7f]/u.test(v.comment) ||
      /(password|secret|token|cookie)\s*[:=]/i.test(v.comment)
    )
      c.addIssue({
        code: 'custom',
        path: ['comment'],
        message: 'SUBSTANTIVE_NOTE_REQUIRED',
      });
  });
export const semesterCommandSchema = z.union([
  semesterMetadataSchema,
  checkpointSendSchema,
  checkpointDecisionSchema,
]);
export type SemesterCommand = z.infer<typeof semesterCommandSchema>;
export interface SemesterReceipt {
  operation: string;
  project: string;
  version: string;
  revision: number;
  submission?: string;
  number?: number;
  state?: string;
}
export interface SemesterFile {
  id: string;
  path: string;
  size: number;
  sha256: string;
  mime: string;
  visibility: string;
  policyRevision?: number;
}
export interface CheckpointRound {
  id: string;
  purpose: 'CHECKPOINT';
  contract: 'CHECKPOINT_V1';
  project: string;
  version: string;
  number: number;
  submittedAt: string;
  metadata: RoundMetadata;
  authors: RoundAuthor[];
  files: SemesterFile[];
  state: 'awaiting_review' | 'changes_requested' | 'accepted';
  revision: number;
  assignmentRevision: number;
  canDecide: boolean;
  current: boolean;
  decision: {
    state: string;
    comment: string;
    actor: string;
    decidedAt: string;
  } | null;
}
export interface SemesterState {
  workflow?: AcademicFlow;
  project: {
    id: string;
    version: string;
    row_version: number;
    metadata: DraftFields;
    metadataRevision: number;
    updatedAt: string;
    status: string;
    department: string;
    university: string;
    universityAr: string;
    supervisor: { id: string; name: string };
    authors: RoundAuthor[];
    lead: boolean;
    authored: boolean;
    supervised: boolean;
  };
  versionNumber: number;
  role: 'lead' | 'author' | 'supervisor';
  editable: boolean;
  canSend: boolean;
  canResubmit?: boolean;
  manifestDigest: string;
  files: SemesterFile[];
  quota: { used: number; reserved: number; available: number; limit: number };
  issues: string[];
  latest: CheckpointRound | null;
  history: {
    id: string;
    purpose: 'CHECKPOINT' | 'FINAL';
    number: number | null;
    submittedAt: string;
    state: string;
    comment: string | null;
    actor: string | null;
    decidedAt: string | null;
  }[];
  final?: {
    id: string;
    number: number;
    state: string;
    comment: string | null;
    decidedAt: string | null;
  };
  legacyFinalPending: boolean;
  lifecycle: string;
}
export interface SemesterCollection {
  items: {
    id: string;
    title: string;
    department: string;
    year: string;
    supervisor: string;
    lead: string;
    role: string;
    lifecycle: string;
    checkpoint: string | null;
    number: string | null;
    submittedAt: string | null;
    updatedAt: string;
    final?: string | null;
    finalNumber?: number | null;
    finalSubmittedAt?: string | null;
    finalTask?: 'screening' | 'assessment' | 'committee' | 'decision';
    workflow?: AcademicFlow;
    feedback?: string | null;
    submitter?: string | null;
    authorCount?: number;
    finalReady?: boolean;
  }[];
}
