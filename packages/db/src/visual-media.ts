import 'server-only';
import { createRuntimeDatabase } from './index.js';
import type { AccountView } from './auth.js';
export function createVisualMediaRepository(url: string) {
  const db = createRuntimeDatabase(url);
  return {
    read: async <T>(
      actor: AccountView | null,
      target: unknown,
      storage = false,
    ) =>
      (
        await db.query<{ value: T }>(
          'SELECT app.visual_read($1,$2,$3::jsonb,$4) value',
          [
            actor?.id ?? null,
            actor?.sessionId ?? null,
            JSON.stringify(target),
            storage,
          ],
        )
      )[0]!.value,
    write: async <T>(
      actor: AccountView,
      command: string,
      digest: string,
      target: unknown,
      revision: number,
      asset: unknown,
    ) =>
      (
        await db.query<{ value: T }>(
          'SELECT app.visual_write($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb) value',
          [
            actor.id,
            actor.sessionId,
            command,
            digest,
            JSON.stringify(target),
            revision,
            JSON.stringify(asset),
          ],
        )
      )[0]!.value,
    receipt: async <T>(actor: AccountView, command: string) =>
      (
        await db.query<{ value: T }>(
          'SELECT app.visual_receipt($1,$2,$3) value',
          [actor.id, actor.sessionId, command],
        )
      )[0]!.value,
    registered: async (actor: AccountView, asset: string) =>
      (
        await db.query<{ value: boolean }>(
          'SELECT app.visual_registered($1,$2,$3) value',
          [actor.id, actor.sessionId, asset],
        )
      )[0]!.value,
    close: () => db.close(),
  };
}
