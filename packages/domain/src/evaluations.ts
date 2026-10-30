import { submissionUuid } from './submissions.js';
import { assessmentEntryPayload } from './assessment-entry.js';
import rubric from './core-v1.json' with { type: 'json' };
export const coreRubric = rubric;

export const coreWeights = [10, 20, 20, 20, 15, 10, 5] as const;
export type AssessmentLayer = 'supervisor' | 'committee';
export interface EvidenceLocator {
  file: string;
  kind: 'page' | 'section' | 'figure' | 'test' | 'lines';
  reference: string;
}
export interface CriterionInput {
  code: string;
  level: number;
  comment: string;
  locators: EvidenceLocator[];
}
export interface AssessmentInput {
  inputContract?:
    import('./assessment-entry.js').AssessmentEntryContract | undefined;
  layer: AssessmentLayer;
  criteria: CriterionInput[];
  overall: string;
  calibration: boolean;
  members: string[];
  assessedOn: string | null;
  attestation: boolean;
}
export interface AssessmentCommand extends AssessmentInput {
  submission: string;
  revision: number;
  assignmentRevision: number;
  command: string;
  draftRevision?: number;
}
const length = (s: string) => [...s.trim()].length;
const text = (x: unknown, min: number, max: number): x is string =>
  typeof x === 'string' &&
  length(x) >= min &&
  length(x) <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(
    x,
  );
export const memberKey = (s: string) =>
  s.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
export function assessmentIssues(
  input: AssessmentInput,
  today: string,
  simple = false,
): string[] {
  const issues: string[] = [];
  input = assessmentEntryPayload(input) as AssessmentInput;
  if (
    input.inputContract !== undefined &&
    input.inputContract !== 'SCORES_ONLY_V3'
  )
    issues.push('ENTRY_CONTRACT');
  simple = simple || input.inputContract === 'SCORES_ONLY_V3';
  if (!['supervisor', 'committee'].includes(input.layer)) issues.push('LAYER');
  if (!simple && input.calibration !== true) issues.push('CALIBRATION');
  if (!text(input.overall, simple ? 0 : 50, 2000)) issues.push('OVERALL');
  if (!Array.isArray(input.criteria) || input.criteria.length !== 7)
    issues.push('CRITERIA');
  const seen = new Set<string>();
  for (const c of input.criteria ?? []) {
    if (!c || !/^C[1-7]$/.test(c.code) || seen.has(c.code)) {
      issues.push('CRITERION_CODE');
      continue;
    }
    seen.add(c.code);
    if (!Number.isInteger(c.level) || c.level < 0 || c.level > 4)
      issues.push(c.code + ':LEVEL');
    if (
      !simple && (c.level === 0 || c.level === 4)
        ? !text(c.comment, 20, 1000)
        : c.comment !== '' && !text(c.comment, 1, 1000)
    )
      issues.push(c.code + ':COMMENT');
    if (!Array.isArray(c.locators) || (!simple && c.locators.length < 1))
      issues.push(c.code + ':EVIDENCE');
    for (const l of c.locators ?? [])
      if (
        !l ||
        !submissionUuid(l.file) ||
        !['page', 'section', 'figure', 'test', 'lines'].includes(l.kind) ||
        !text(l.reference, 1, 200) ||
        (l.kind === 'lines' && !/^[1-9]\d*(?:-[1-9]\d*)?$/.test(l.reference)) ||
        (l.kind === 'page' && !/^[1-9]\d*(?:-[1-9]\d*)?$/.test(l.reference))
      )
        issues.push(c.code + ':LOCATOR');
  }
  if (input.layer === 'committee') {
    if (
      !Array.isArray(input.members) ||
      input.members.length < 2 ||
      input.members.some((s) => !text(s, 1, 131072)) ||
      new Set(input.members.map(memberKey)).size !== input.members.length
    )
      issues.push('MEMBERS');
    const date = input.assessedOn;
    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date ||
      date > today
    )
      issues.push('ASSESSED_ON');
    if (input.attestation !== true) issues.push('ATTESTATION');
  } else if (
    input.members?.length ||
    input.assessedOn !== null ||
    input.attestation !== false
  )
    issues.push('SUPERVISOR_PROVENANCE');
  return [...new Set(issues)];
}
/** Integer quarter-points preserve every CORE_V1 total exactly. */
export function coreQuarterPoints(
  criteria: Pick<CriterionInput, 'code' | 'level'>[],
): number {
  if (
    criteria.length !== 7 ||
    new Set(criteria.map((c) => c.code)).size !== 7 ||
    criteria.some(
      (c) =>
        !/^C[1-7]$/.test(c.code) ||
        !Number.isInteger(c.level) ||
        c.level < 0 ||
        c.level > 4,
    )
  )
    throw Error('INVALID_CRITERIA');
  return criteria.reduce(
    (sum, c) => sum + coreWeights[Number(c.code.slice(1)) - 1]! * c.level,
    0,
  );
}
/** I = (2*S_quarters + 3*C_quarters)/20, without intermediate rounding. */
export function internalProjection(s: CriterionInput[], c: CriterionInput[]) {
  const sq = coreQuarterPoints(s),
    cq = coreQuarterPoints(c);
  return {
    supervisor: sq / 4,
    committee: cq / 4,
    internalNumerator: 2 * sq + 3 * cq,
    internalDenominator: 20,
    internal: (2 * sq + 3 * cq) / 20,
    disagreement:
      Math.abs(sq - cq) >= 60 ||
      s.some(
        (x) => Math.abs(x.level - c.find((y) => y.code === x.code)!.level) >= 2,
      ),
  };
}
