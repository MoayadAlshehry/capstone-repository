import 'server-only';
import type { AccountView } from './auth.js';
import { createRuntimeDatabase } from './index.js';
export function createDiscoveryRepository(url: string) {
  const db = createRuntimeDatabase(url);
  return {
    list: async <T>(input: unknown, account?: AccountView | null) =>
      (
        await db.query<{ value: T }>(
          'SELECT app.external_catalogue($1::jsonb,$2,$3) value',
          [
            JSON.stringify(input),
            account?.id ?? null,
            account?.sessionId ?? null,
          ],
        )
      )[0]!.value,
    detail: async <T>(project: string, account?: AccountView | null) =>
      db.transactions.run(async (tx) => {
        await tx.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
        );
        return (
          await tx.query<{ value: T }>(
            'SELECT app.external_projection($1,$2,$3) value',
            [project, account?.id ?? null, account?.sessionId ?? null],
          )
        )[0]!.value;
      }),
    routes: async () =>
      (
        await db.query<{ value: { project: string; publishedAt: string }[] }>(
          'SELECT app.catalogue_routes() value',
        )
      )[0]!.value,
    close: () => db.close(),
  };
}
