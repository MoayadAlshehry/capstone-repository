import type { AssessmentInput, AcademicAssessment } from '@capstone/domain';
import type { ExternalForm } from '@capstone/domain/external-reviews';

export type AssessmentForm = AssessmentInput | ExternalForm;
type GovernanceContext = {
  title: string;
  project: string;
  version: string;
  submission?: string;
  versionNumber?: number;
  submittedAt?: string;
};
export type GovAssessment = {
  logical: string;
  head: string;
  revision: number;
  case: string;
  layer: 'supervisor' | 'committee' | 'external';
  evaluator: string;
  invalidated: boolean;
  rubric: string;
  rubricDefinition: unknown;
  score: number;
  correctionPolicy: 'ASSESSMENT_UX_V2' | 'REFERENCED_ASSESSMENT_V1';
  payload: unknown;
  original: unknown;
  evidenceChoices: { id: string; path: string }[] | null;
  context?: GovernanceContext;
  history: {
    id: string;
    supersedes_id: string;
    issue: string;
    finalizedAt: string;
    quarterPoints: number;
    payload: unknown;
  }[];
};
export type GovIssue = {
  id: string;
  case: string;
  logical: string;
  layer: GovAssessment['layer'];
  type:
    | 'transcription_error'
    | 'missing_evidence'
    | 'identity_integrity'
    | 'undeclared_conflict'
    | 'internal_disagreement'
    | 'access_integrity';
  state:
    | 'open'
    | 'amendment_authorized'
    | 'corrected'
    | 'invalidated'
    | 'explained'
    | 'resolved_retained';
  reason: string;
  evidence: unknown;
  createdBy: string | null;
  createdKind: string;
  createdAt: string;
  authorizedBy: string | null;
  authorizedAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  resolutionKind: string | null;
  revision: number;
  expectedHead: string;
  hold: {
    state: string;
    type: string;
    reason: string;
    created_at: string;
    resolved_at: string | null;
  } | null;
  history:
    | {
        id: string;
        actor_id: string | null;
        operation: string;
        reason: string;
        occurred_at: string;
        evidence: unknown;
      }[]
    | null;
};
type GovCase = {
  case: string;
  project: string;
  version: string;
  title: string;
  current: boolean;
  projection: unknown;
  run: string | null;
  progression: string | null;
};
export type GovernanceView = {
  cases: GovCase[];
  assessments: GovAssessment[];
  issues: GovIssue[];
};
type FeedbackForm = {
  kind?: 'committee_aggregate';
  memberCount?: number;
  criteria: {
    code: string;
    level: number;
    comment: string;
    locators: { kind: string; reference: string }[] | null;
  }[];
  overall: string;
};
export type FeedbackAssessment = {
  layer?: 'supervisor' | 'committee';
  label?: number;
  score: number;
  form: FeedbackForm;
  corrected: boolean;
  finalizedAt: string;
};
export type AuthorFeedback = {
  case: string;
  version: string;
  internal: FeedbackAssessment[];
  external: FeedbackAssessment[];
  externalReleased: boolean;
  corrected: boolean;
  context?: GovernanceContext;
};
export type RubricDefinition = Omit<
  AcademicAssessment['rubric'],
  'hash' | 'levels'
> & {
  hash?: string;
  levels?: { en: string[]; ar: string[] };
};

/** Decode stored rubric descriptors; never substitute a different rubric for a finalized record. */
export function decodeRubric(value: unknown): RubricDefinition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.code !== 'string' ||
    !Array.isArray(v.criteria) ||
    !v.criteria.length ||
    v.criteria.length > 10
  )
    return null;
  const levels = v.levels as Record<string, unknown> | undefined;
  if (
    levels !== undefined &&
    (!levels ||
      typeof levels !== 'object' ||
      Array.isArray(levels) ||
      !['en', 'ar'].every(
        (locale) =>
          Array.isArray(levels[locale]) &&
          (levels[locale] as unknown[]).length === 5 &&
          (levels[locale] as unknown[]).every(
            (item) => typeof item === 'string',
          ),
      ))
  )
    return null;
  const bilingual = (text: unknown) =>
    !!text &&
    typeof text === 'object' &&
    !Array.isArray(text) &&
    ['en', 'ar'].every(
      (locale) => typeof (text as Record<string, unknown>)[locale] === 'string',
    );
  if (
    !v.criteria.every((criterion) => {
      if (
        !criterion ||
        typeof criterion !== 'object' ||
        Array.isArray(criterion)
      )
        return false;
      const c = criterion as Record<string, unknown>;
      return (
        typeof c.code === 'string' &&
        Number.isFinite(c.weight) &&
        bilingual(c.label) &&
        bilingual(c.description) &&
        Array.isArray(c.anchors) &&
        c.anchors.length === 5 &&
        c.anchors.every((anchor, index) => {
          if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor))
            return false;
          const a = anchor as Record<string, unknown>;
          return a.level === index && bilingual(a);
        })
      );
    }) ||
    new Set(
      v.criteria.map(
        (criterion) => (criterion as Record<string, unknown>).code,
      ),
    ).size !== v.criteria.length
  )
    return null;
  return value as RubricDefinition;
}

/** Nullable empty SQL locator aggregates become editable empty arrays, without invented evidence. */
export function correctionForm(
  value: unknown,
  layer: GovAssessment['layer'],
): AssessmentForm | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const allowed =
    layer === 'external'
      ? ['criteria', 'overall', 'calibration', 'inputContract']
      : [
          'layer',
          'criteria',
          'overall',
          'calibration',
          'members',
          'assessedOn',
          'attestation',
          'inputContract',
        ];
  if (Object.keys(v).some((key) => !allowed.includes(key))) return null;
  if (v.inputContract !== undefined && v.inputContract !== 'SCORES_ONLY_V3')
    return null;
  if (
    !Array.isArray(v.criteria) ||
    v.criteria.length !== (layer === 'external' ? 4 : 7) ||
    typeof v.overall !== 'string' ||
    typeof v.calibration !== 'boolean'
  )
    return null;
  const form = structuredClone(v);
  const criteria = form.criteria as Record<string, unknown>[];
  const codes = Array.from(
    { length: layer === 'external' ? 4 : 7 },
    (_, index) => (layer === 'external' ? 'E' : 'C') + (index + 1),
  );
  if (
    !criteria.every(
      (c) =>
        !!c &&
        typeof c === 'object' &&
        typeof c.code === 'string' &&
        codes.includes(c.code) &&
        Number.isInteger(c.level) &&
        Number(c.level) >= 0 &&
        Number(c.level) <= 4 &&
        typeof c.comment === 'string' &&
        (c.locators === null ||
          (Array.isArray(c.locators) &&
            c.locators.every((value) => {
              if (!value || typeof value !== 'object' || Array.isArray(value))
                return false;
              const locator = value as Record<string, unknown>;
              return (
                Object.keys(locator).every((key) =>
                  ['file', 'kind', 'reference'].includes(key),
                ) &&
                typeof locator.file === 'string' &&
                typeof locator.kind === 'string' &&
                ['page', 'section', 'figure', 'test', 'lines'].includes(
                  locator.kind,
                ) &&
                typeof locator.reference === 'string'
              );
            }))),
    ) ||
    new Set(criteria.map((criterion) => criterion.code)).size !== codes.length
  )
    return null;
  criteria.forEach((c) => {
    c.locators ??= [];
  });
  if (
    layer !== 'external' &&
    (v.layer !== layer ||
      !Array.isArray(v.members) ||
      !v.members.every((name) => typeof name === 'string') ||
      !(v.assessedOn === null || typeof v.assessedOn === 'string') ||
      typeof v.attestation !== 'boolean')
  )
    return null;
  return form as unknown as AssessmentForm;
}
