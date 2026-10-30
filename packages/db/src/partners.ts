import 'server-only';
import { createRuntimeDatabase } from './index.js';
import {
  authPasswordHash,
  CredentialWindow,
  type AccountView,
} from './auth.js';
export {
  partnerStates,
  boundedPartnerText,
  validPartnerRegistration,
  validPartnerCommand,
} from './partner-types.js';
export type {
  PartnerProfile,
  PartnerCommand,
  PartnerStatus,
} from './partner-types.js';
import {
  validPartnerRegistration,
  validPartnerCommand,
  type PartnerProfile,
  type PartnerStatus,
} from './partner-types.js';
export function createPartners(databaseUrl: string) {
  const db = createRuntimeDatabase(databaseUrl),
    limit = new CredentialWindow(),
    total = new CredentialWindow(Date.now, 100);
  return {
    async register(input: unknown) {
      if (!validPartnerRegistration(input)) throw Error('INVALID_INPUT');
      const email = input.email.trim().toLowerCase();
      if (!total.attempt('partner-registration') || !limit.attempt(email))
        throw Error('TRY_LATER');
      const rows = await db.query<{ success: boolean }>(
        'SELECT app.partner_register($1,$2,$3,$4,$5) AS success',
        [
          input.name.trim(),
          email,
          input.organization.trim(),
          await authPasswordHash(input.password),
          input.locale,
        ],
      );
      // Generic failure; never returns the owner or role of a duplicate address.
      if (!rows[0]?.success) throw Error('REGISTRATION_FAILED');
      return { success: true, status: 'pending' as const };
    },
    async view(
      user: AccountView,
      filter?: PartnerStatus,
    ): Promise<PartnerProfile[]> {
      const rows = await db.query<{ result: PartnerProfile[] }>(
        'SELECT app.partner_view($1,$2,$3) AS result',
        [user.id, user.sessionId, filter ?? null],
      );
      return rows[0]!.result;
    },
    async command(user: AccountView, input: unknown) {
      if (!validPartnerCommand(input)) throw Error('INVALID_INPUT');
      const rows = await db.query<{
        result: { scope: PartnerStatus; row_version: number };
      }>('SELECT app.partner_command($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result', [
        user.id,
        user.sessionId,
        input.commandId,
        input.target,
        input.command,
        input.revision,
        input.reason?.trim() ?? null,
        input.organization?.trim() ?? null,
        input.clarification?.trim() ?? null,
      ]);
      return rows[0]!.result;
    },
    async requireApprovedPartner(user: AccountView | null) {
      if (!user) throw Error('FORBIDDEN');
      const rows = await db.query<{ id: string }>(
        'SELECT app.require_approved_partner($1,$2) AS id',
        [user.id, user.sessionId],
      );
      return { partnerId: rows[0]!.id };
    },
    close: () => db.close(),
  };
}
