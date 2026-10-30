import 'server-only';
import type { AccountView } from './auth.js';
import { createRuntimeDatabase } from './index.js';
export function createShowcaseRepository(url: string) {
  const db = createRuntimeDatabase(url);
  return {
    snapshot: <T>(a?: AccountView | null) =>
      db.transactions.run(async (tx) => {
        await tx.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
        );
        return (
          await tx.query<{ value: T }>(
            'SELECT app.showcase_snapshot($1,$2) value',
            [a?.id ?? null, a?.sessionId ?? null],
          )
        )[0]!.value;
      }),
    close: db.close,
  };
}
