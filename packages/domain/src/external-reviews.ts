import rubric from './external-v1.json' with { type: 'json' };
import { assessmentEntryPayload } from './assessment-entry.js';
export const externalRubric = rubric;
export const assignmentStates = [
  'offered',
  'accepted',
  'completed',
  'declined',
  'expired',
  'withdrawn',
  'cancelled',
] as const;
export type AssignmentStatus = (typeof assignmentStates)[number];
export const externalCodes = ['E1', 'E2', 'E3', 'E4'] as const;
export type ExternalCode = (typeof externalCodes)[number];
export interface ExternalLocator {
  file: string;
  kind: 'page' | 'section' | 'figure' | 'test' | 'lines';
  reference: string;
}
export interface ExternalForm {
  inputContract?:
    import('./assessment-entry.js').AssessmentEntryContract | undefined;
  criteria: {
    code: ExternalCode;
    level: number | null;
    comment: string;
    locators: ExternalLocator[];
  }[];
  overall: string;
  calibration: boolean;
}
export const emptyExternalForm = (): ExternalForm => ({
  inputContract: 'SCORES_ONLY_V3',
  criteria: externalCodes.map((code) => ({
    code,
    level: null,
    comment: '',
    locators: [],
  })),
  overall: '',
  calibration: false,
});
export function completeExternalDraft(
  body?: ExternalForm | null,
): ExternalForm {
  const defaults = emptyExternalForm();
  return body
    ? {
        ...body,
        inputContract: 'SCORES_ONLY_V3',
        criteria: defaults.criteria.map(
          (c) => body.criteria.find((x) => x.code === c.code) ?? c,
        ),
      }
    : defaults;
}
export const declarationKeys = [
  'noPersonalFinancialConflict',
  'noCollaboration',
  'noCommitteeParticipation',
  'noPriorScoreExposure',
  'willNotSeekScores',
] as const;
export type ReviewDeclarations = Record<
  (typeof declarationKeys)[number],
  boolean
>;
export interface ReviewTask {
  policy?: string;
  languages?: string[];
  progress?: number;
  files?: {
    id: string;
    path: string;
    size: number;
    sha256: string;
    mime: string;
    visibility: string;
  }[];
  usable?: boolean;
  id: string;
  case: string;
  packet: string;
  status: AssignmentStatus;
  offeredAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  closure: string | null;
  revision: number;
  serverTime: string;
  context: { project: string; version: string; submission: string };
  project: {
    title: string;
    abstract: string;
    domain: string;
    version: string;
    versionNumber: number;
  } | null;
  manifest: {
    entries: {
      id: string;
      path: string;
      size: number;
      sha256: string;
      mime: string;
    }[];
    languages: string[];
  };
  draft?: ExternalForm | null;
  assessment?: {
    id: string;
    logical: string;
    headRevision: number;
    rubric: string;
    total: number;
    finalizedAt: string;
    overall: string;
    criteria: ExternalForm['criteria'];
  };
}
const text = (v: unknown, min: number, max: number, multiline = false) =>
  typeof v === 'string' &&
  [...v.trim()].length >= min &&
  [...v.trim()].length <= max &&
  !(
    multiline
      ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u
      : /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u
  ).test(v);
export function externalFormIssues(
  body: unknown,
  files: string[],
  complete = false,
  fullFinal = false,
): string[] {
  const errors: string[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['form'];
  const b = assessmentEntryPayload(body) as ExternalForm;
  if (b.inputContract !== undefined && b.inputContract !== 'SCORES_ONLY_V3')
    return ['entryContract'];
  fullFinal = fullFinal || b.inputContract === 'SCORES_ONLY_V3';
  if (
    Object.keys(b).some(
      (k) =>
        !['criteria', 'overall', 'calibration', 'inputContract'].includes(k),
    ) ||
    !Array.isArray(b.criteria) ||
    b.criteria.length > 4 ||
    !text(b.overall, complete && !fullFinal ? 50 : 0, 2000, true) ||
    typeof b.calibration !== 'boolean' ||
    (complete && !fullFinal && !b.calibration)
  )
    return ['form'];
  const seen = new Set<string>();
  for (const c of b.criteria) {
    if (
      !c ||
      Object.keys(c).some(
        (k) => !['code', 'level', 'comment', 'locators'].includes(k),
      ) ||
      !externalCodes.includes(c.code) ||
      seen.has(c.code)
    ) {
      errors.push('criteria');
      continue;
    }
    seen.add(c.code);
    if (
      (c.level !== null &&
        (!Number.isInteger(c.level) || c.level < 0 || c.level > 4)) ||
      (complete && c.level === null)
    )
      errors.push(c.code + '.level');
    if (
      !text(
        c.comment,
        complete && !fullFinal && (c.level === 0 || c.level === 4) ? 20 : 0,
        1000,
        true,
      )
    )
      errors.push(c.code + '.comment');
    if (
      !Array.isArray(c.locators) ||
      c.locators.length > 20 ||
      (complete && !fullFinal && !c.locators.length)
    ) {
      errors.push(c.code + '.evidence');
      continue;
    }
    for (const l of c.locators) {
      if (
        !l ||
        Object.keys(l).some(
          (k) => !['file', 'kind', 'reference'].includes(k),
        ) ||
        !files.includes(l.file) ||
        !['page', 'section', 'figure', 'test', 'lines'].includes(l.kind) ||
        !text(l.reference, 1, 200)
      ) {
        errors.push(c.code + '.evidence');
        continue;
      }
      if (['page', 'lines'].includes(l.kind)) {
        const parts = l.reference.trim().split('-').map(Number);
        if (
          !/^[1-9]\d*(-[1-9]\d*)?$/.test(l.reference.trim()) ||
          parts.some((n) => n > 10000000) ||
          (parts.length === 2 && parts[1]! < parts[0]!)
        )
          errors.push(c.code + '.range');
      }
    }
  }
  if (complete && seen.size !== 4) errors.push('criteria');
  return errors;
}
export function externalQuarterPoints(form: ExternalForm) {
  if (
    form.criteria.length !== 4 ||
    new Set(form.criteria.map((x) => x.code)).size !== 4 ||
    form.criteria.some(
      (x) =>
        !externalCodes.includes(x.code) ||
        !Number.isInteger(x.level) ||
        x.level! < 0 ||
        x.level! > 4,
    )
  )
    throw Error('INCOMPLETE_LEVELS');
  return form.criteria.reduce(
    (n, c) =>
      n +
      externalRubric.criteria.find((x) => x.code === c.code)!.weight * c.level!,
    0,
  );
}
export const beforeDeadline = (server: string, deadline: string) =>
  Number.isFinite(Date.parse(server)) &&
  Date.parse(server) < Date.parse(deadline);
export function concealProjection<T extends Record<string, unknown>>(v: T): T {
  const allowed = [
    'project',
    'version',
    'versionNumber',
    'title',
    'abstract',
    'keywords',
    'university',
    'department',
    'academicYear',
    'domain',
    'authors',
    'supervisor',
    'publishedAt',
    'license',
  ];
  return Object.fromEntries(
    Object.entries(v).filter(([key]) => allowed.includes(key)),
  ) as T;
}
