export interface AcademicFlow {
  finalNumber?: number;
  revision?: {
    submission: string;
    kind: 'screening' | 'assessed';
    reason: string;
    actor: string;
    requestedAt: string;
  } | null;
  stage:
    | 'preparing'
    | 'final_requested'
    | 'final_screening'
    | 'returned'
    | 'supervisor_assessment'
    | 'committee_consensus'
    | 'faculty_decision'
    | 'published'
    | 'retained';
  submission: string | null;
  waitingSince?: string | null;
  requestValid: boolean;
  requestRevision: number;
  canRequest: boolean;
  canScreen: boolean;
  request: {
    id: string;
    note: string;
    actor: string;
    requestedAt: string;
  } | null;
  screening: {
    outcome: 'accepted' | 'returned';
    reason: string;
    actor: string;
    recordedAt: string;
  } | null;
}
