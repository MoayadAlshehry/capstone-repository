import 'server-only';
import { createRuntimeDatabase, DatabaseError } from './index.js';
import type { AccountView } from './auth.js';
import { validAccessCommand, type AccessView } from './grant-types.js';
export { validAccessCommand } from './grant-types.js';
export type { AccessCommand, AccessView } from './grant-types.js';
export function createPartnerAccess(url: string) {
  const db = createRuntimeDatabase(url);
  return {
    async view(user: AccountView): Promise<AccessView> {
      return (
        await db.query<{ value: AccessView }>(
          'SELECT app.partner_access_view($1,$2) value',
          [user.id, user.sessionId],
        )
      )[0]!.value;
    },
    async existing(user: AccountView, input: unknown) {
      if (!validAccessCommand(input) || input.operation !== 'request')
        return null;
      return (
        await db.query<{
          value: { scope: string; row_version: number; noop: true } | null;
        }>('SELECT app.partner_access_existing($1,$2,$3,$4,$5) value', [
          user.id,
          user.sessionId,
          input.commandId,
          input.project,
          input.version,
        ])
      )[0]!.value;
    },
    async command(user: AccountView, input: unknown) {
      if (!validAccessCommand(input)) throw Error('INVALID_INPUT');
      try {
        return (
          await db.query<{ value: { scope: string; row_version: number } }>(
            'SELECT app.partner_access_command($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
            [
              user.id,
              user.sessionId,
              input.commandId,
              input.operation,
              input.project,
              input.version,
              input.target ?? null,
              input.revision ?? 0,
              input.text?.trim() ?? null,
            ],
          )
        )[0]!.value;
      } catch (error) {
        if (
          input.operation === 'request' &&
          error instanceof DatabaseError &&
          error.sqlState === '42501'
        )
          await db.query('SELECT app.partner_access_security($1,$2,$3)', [
            user.id,
            user.sessionId,
            input.commandId,
          ]);
        throw error;
      }
    },
    close: () => db.close(),
  };
}
