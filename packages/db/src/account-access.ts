import 'server-only';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
export interface AccountAccessMessage {
  id: string;
  command: string;
  purpose: string;
  state: string;
  createdAt: string;
  expiresAt: string;
  canRetry: boolean;
}
export interface AccountAccessPerson {
  serverNow: string;
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  university: string;
  universityAr: string;
  invitation: { state: string; expiresAt: string } | null;
  resendAt: string | null;
  messages: AccountAccessMessage[];
  receipt: { id: string; state: string } | null;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createAccountAccess(databaseUrl: string) {
  const db = createRuntimeDatabase(databaseUrl);
  return {
    async person(actor: AccountView, target: string, command?: string) {
      if (actor.role !== 'university_admin' || !actor.universityId)
        throw Error('FORBIDDEN');
      if (!uuid.test(target) || (command && !uuid.test(command)))
        throw Error('INVALID_INPUT');
      const row = (
        await db.query<{ value: AccountAccessPerson }>(
          'SELECT app.account_access_person($1,$2,$3,$4) AS value',
          [actor.id, actor.sessionId, target, command ?? null],
        )
      )[0];
      if (!row) throw Error('NOT_FOUND');
      return row.value;
    },
    close: () => db.close(),
  };
}
