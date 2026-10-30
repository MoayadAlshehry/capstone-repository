import type { AcademicFlow } from './academic-flow.js';
export type { AcademicFlow } from './academic-flow.js';
import { z } from 'zod';
import type { AssessmentInput, CriterionInput } from './evaluations.js';
import type { SemesterState } from './semester.js';
import type { SubmissionState, SubmissionRound } from './submissions.js';
import type { PublicationState } from './publications.js';
const uuid = z.string().uuid(),
  revision = z.number().int().nonnegative().max(2147483646),
  safe = (max: number) =>
    z
      .string()
      .refine((s) => [...s].length <= max)
      .refine(
        (s) =>
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(
            s,
          ),
      );
const locator = z
  .object({
    file: uuid,
    kind: z.enum(['page', 'section', 'figure', 'test', 'lines']),
    reference: safe(200).min(1),
  })
  .strict();
export const academicDraftSchema = z
  .object({
    inputContract: z.literal('SCORES_ONLY_V3').optional(),
    layer: z.enum(['supervisor', 'committee']),
    criteria: z
      .array(
        z
          .object({
            code: z.string().regex(/^C[1-7]$/),
            level: z.number().int().min(0).max(4).nullable(),
            comment: safe(1000).default(''),
            locators: z.array(locator).max(20).default([]),
          })
          .strict(),
      )
      .length(7)
      .refine((a) => new Set(a.map((x) => x.code)).size === 7),
    overall: safe(2000).default(''),
    calibration: z.boolean().default(false),
    members: z.array(safe(131072)).default([]),
    assessedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    attestation: z.boolean().default(false),
  })
  .strict();
export type AcademicDraft = z.infer<typeof academicDraftSchema>;
const guard = {
  submission: uuid,
  revision,
  assignmentRevision: revision,
  command: uuid,
};
export const academicCommandSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('final.request'),
      project: uuid,
      version: uuid,
      assignmentRevision: revision,
      requestRevision: revision,
      note: safe(500),
      command: uuid,
    })
    .strict(),
  z
    .object({
      operation: z.literal('final.screen'),
      ...guard,
      outcome: z.enum(['accepted', 'returned']),
      reason: safe(2000),
    })
    .strict(),
  z
    .object({
      operation: z.literal('final.submit'),
      project: uuid,
      version: uuid,
      revision,
      assignmentRevision: revision,
      manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
      command: uuid,
    })
    .strict(),
  z
    .object({
      operation: z.literal('assessment.save'),
      ...guard,
      draftRevision: revision,
      payload: academicDraftSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('assessment.finalize'),
      ...guard,
      draftRevision: revision,
      payload: academicDraftSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('final.decide'),
      ...guard,
      outcome: z.enum(['publish', 'revision', 'retain']),
      reason: safe(2000),
      publicManifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export type AcademicCommand = z.infer<typeof academicCommandSchema>;
export interface AcademicReadiness {
  studio: SemesterState;
  final: SubmissionState;
  manifestDigest: string;
  contract: string;
  flow: AcademicFlow;
}
export interface RubricCriterion {
  code: string;
  weight: number;
  label: { en: string; ar: string };
  description: { en: string; ar: string };
  anchors: { level: number; en: string; ar: string }[];
}
export interface AcademicAssessment {
  rubric: {
    code: string;
    hash: string;
    criteria: RubricCriterion[];
    levels: { en: string[]; ar: string[] };
    calibration: { en: string; ar: string };
  };
  assessments: {
    id: string;
    logical: string;
    headRevision: number;
    case_id: string;
    layer: string;
    total: number;
    criteria: CriterionInput[];
    overall_comment: string;
    member_names: string[];
    assessed_on: string | null;
    recorded_at: string;
    recorded_by: string;
  }[];
  drafts: {
    layer: string;
    payload: AcademicDraft;
    revision: number;
    savedAt: string;
    total?: number | null;
  }[];
  provenance: { assessment: string; name: string; recordedAt: string }[];
  supervisor: number | null;
  committee: number | null;
  internal: number | null;
  disagreement: boolean;
}
export interface AcademicRound extends SubmissionRound {
  committeeWorkflow?: boolean;
  evaluationCase: string | null;
  flow: AcademicFlow;
  canScreen: boolean;
  screening: AcademicFlow['screening'];
  contract: string;
  finalNumber?: number;
  manifestDigest?: string;
  publicManifestDigest?: string;
  assessment: AcademicAssessment | null;
  publication: PublicationState;
  canAssess?: boolean;
  decisionScope?: {
    actor_name: string;
    outcome: string;
    reason?: string;
    recorded_at: string;
  } | null;
}
export function finalizedInput(draft: AcademicDraft): AssessmentInput {
  if (draft.criteria.some((c) => c.level === null))
    throw Error('SEVEN_SCORES_REQUIRED');
  return { ...draft, criteria: draft.criteria as CriterionInput[] };
}
export function emptyAcademicDraft(
  layer: 'supervisor' | 'committee',
): AcademicDraft {
  return {
    inputContract: 'SCORES_ONLY_V3',
    layer,
    criteria: Array.from({ length: 7 }, (_, i) => ({
      code: 'C' + (i + 1),
      level: null,
      comment: '',
      locators: [],
    })),
    overall: '',
    calibration: false,
    members: layer === 'committee' ? ['', ''] : [],
    assessedOn: null,
    attestation: false,
  };
}
