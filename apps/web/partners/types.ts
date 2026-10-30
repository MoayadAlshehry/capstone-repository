// Safe browser projection; server props and responses remain structurally typed.
type PartnerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export interface PartnerProfile {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  clarification?: string | null;
  accountStatus: string;
  status: PartnerStatus;
  revision: number;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  history: {
    revision: number;
    from: PartnerStatus | null;
    to: PartnerStatus;
    reason: string | null;
    at: string;
  }[];
}
