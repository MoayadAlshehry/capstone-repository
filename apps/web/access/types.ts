export interface AccessCommand {
  operation:
    'request' | 'cancel' | 'approve' | 'deny' | 'revoke' | 'protective-revoke';
  commandId: string;
  project: string;
  version: string;
  target?: string;
  revision?: number;
  text?: string;
}
export interface AccessRequest {
  id: string;
  project: string;
  version: string;
  versionNumber: number;
  title: string;
  partnerName: string;
  organization: string;
  justification: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  revision: number;
  createdAt: string;
  decidedAt: string | null;
  reason: string | null;
  cancelledAt: string | null;
  eligible: boolean;
}
export interface AccessGrant {
  id: string;
  request: string;
  project: string;
  version: string;
  versionNumber: number;
  title: string;
  partnerName: string;
  organization: string;
  revision: number;
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  reason: string | null;
  state: 'active' | 'expired' | 'revoked';
  canRead: boolean;
}
export interface AccessView {
  now: string;
  lead: boolean;
  requests: AccessRequest[];
  grants: AccessGrant[];
}
