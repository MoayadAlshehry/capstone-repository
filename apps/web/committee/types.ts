import type { RubricCriterion, SemesterFile } from '@capstone/domain';
export interface MemberPayload {
  inputContract?: 'SCORES_ONLY_V3';
  criteria: {
    code: string;
    level: number | null;
    comment: string;
    locators: {
      file: string;
      kind: 'page' | 'section' | 'figure' | 'test' | 'lines';
      reference: string;
    }[];
  }[];
  overall: string;
  calibration: boolean;
}
export interface GuestView {
  amendment?: { id: string; reason: string; expectedHead: string } | null;
  invitation: string;
  project: string;
  version: string;
  submission: string;
  round: number;
  metadata: {
    title: string;
    abstract: string;
    supervisor?: { name?: string };
    university?: { name?: string; nameEn?: string; nameAr?: string };
    department?: { code?: string };
    academicYear?: string;
    academic_year?: string;
    domain?: string;
  };
  authors: { name: string }[];
  sessionExpiresAt?: string;
  deadline: string;
  canFinalize: boolean;
  rosterSealed: boolean;
  requiredCount: number;
  readAt: string;
  name: string;
  email: string;
  rubric: {
    code: string;
    hash: string;
    criteria: RubricCriterion[];
    levels: { en: string[]; ar: string[] };
    calibration: { en: string; ar: string };
  };
  files: SemesterFile[];
  draft: { revision: number; payload: MemberPayload; savedAt: string } | null;
  receipt: {
    id: string;
    total: number;
    submittedAt: string;
    payload: MemberPayload;
  } | null;
}
