type Member = { id: string; email: string; name: string; locale: 'en' | 'ar' };
export interface CommitteeStatus {
  submission: string;
  case: string;
  revision: number;
  policy: string;
  sealedAt: string | null;
  completedAt: string | null;
  canManage: boolean;
  serverNow: string;
  minimumReasonLength: number;
  requiredCount: number;
  completedCount: number;
  replacementSlots: number;
  members: (Member & {
    expiresAt: string;
    revokedAt: string | null;
    verifiedAt: string | null;
    submittedAt: string | null;
    state: 'invited' | 'verified' | 'completed' | 'expired' | 'revoked';
    canRevoke: boolean;
    canResend: boolean;
    resendAvailableAt: string;
    finalAssessment?: {
      id: string;
      total: number;
      payload: {
        criteria: {
          code: string;
          level: number;
          comment: string;
          locators: { file: string; kind: string; reference: string }[];
        }[];
        overall: string;
      };
      submittedAt: string;
    } | null;
    delivery: { state: string; attempts: number; code: string } | null;
  })[];
  result: {
    id: string;
    total: number;
    members: number;
    criterionMeans: Record<string, number>;
    finalizedAt: string;
    type: string;
  } | null;
}

export interface CommitteeManagementOutcome {
  receipt: {
    command: string;
    submission: string;
    operation: 'invite' | 'resend' | 'revoke';
    invitation: string;
    committedAt: string;
  } | null;
  status?: CommitteeStatus;
}
