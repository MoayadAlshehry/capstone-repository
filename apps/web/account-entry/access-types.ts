// Client-safe account-access projection. No database, authentication or encrypted-content imports.
interface AccountAccessMessage {
  id: string;
  command: string;
  purpose: string;
  state: string;
  createdAt: string;
  expiresAt: string;
  canRetry: boolean;
}
export interface AccountAccessPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  university: string;
  universityAr: string;
  serverNow: string;
  invitation: { state: string; expiresAt: string } | null;
  resendAt: string | null;
  messages: AccountAccessMessage[];
  receipt: { id: string; state: string } | null;
}
