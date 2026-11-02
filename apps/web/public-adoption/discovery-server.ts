import 'server-only';
import {
  publicRows,
  normalized,
  personKey,
  catalogueSql,
  catalogueValues,
} from './discovery-sql';
export { publicRows, catalogueSql, catalogueValues } from './discovery-sql';
import { createRuntimeDatabase, type TransactionScope } from '@capstone/db';
import type { AccountView } from '@capstone/db/auth';
import type { DiscoveryResult } from '@capstone/domain';
import { normalizeDiscoveryText } from '@capstone/domain';
import { publicProject } from '../public-archive/server';
import { parsePeopleQuery, type PublicPerson } from './discovery-query';
let database: ReturnType<typeof createRuntimeDatabase> | undefined;
const db = () =>
  (database ??= createRuntimeDatabase(process.env['DATABASE_URL'] ?? ''));
const escapeLike = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
export const peopleSql = (kind: 'author' | 'supervisor') => {
  const person = kind === 'author' ? 'credit' : `metadata->'supervisor'`;
  return `WITH public_rows AS NOT MATERIALIZED (${publicRows}), people AS (
    SELECT ${personKey(kind, `${person}->>'id'`)} key,${person}->>'name' name,metadata->'university' university,metadata->'department'->>'code' department,archived_at,project
    FROM public_rows ${kind === 'author' ? 'CROSS JOIN LATERAL jsonb_array_elements(authors) credit' : ''}
    WHERE ($3='' OR ${normalized("metadata->'university'->>'nameEn'")}=$3) AND ($4='' OR metadata->'department'->>'code'=$4)
    AND nullif(${person}->>'id','') IS NOT NULL
    AND ($6='' OR ${personKey(kind, `${person}->>'id'`)}=$6)
    AND ${normalized(`${person}->>'name'`)} LIKE $1 ESCAPE '\\'
  ), deduplicated AS (
    SELECT DISTINCT ON(key) key,name,jsonb_build_object('nameEn',university->>'nameEn','nameAr',university->>'nameAr') university,department FROM people ORDER BY key,archived_at DESC,project
  ) SELECT key,name,university,department FROM deduplicated ORDER BY
    CASE WHEN ${normalized('name')} LIKE $2 ESCAPE '\\' THEN 0 ELSE 1 END,${normalized('name')},key LIMIT $5`;
};
export async function publicPeople(
  params: URLSearchParams,
): Promise<PublicPerson[]> {
  const v = parsePeopleQuery(params),
    q = escapeLike(v.q);
  return db().transactions.run(async (tx) => {
    await tx.query(
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
    );
    // Measured 50k fixture: the existing helper's correlated-count estimate chose a quadratic nested loop.
    // These planner settings are local to this read transaction; permissions/predicate/schema stay intact.
    await tx.query('SET LOCAL enable_nestloop=off');
    await tx.query('SET LOCAL jit=off');
    return tx.query<PublicPerson>(peopleSql(v.kind), [
      '%' + q + '%',
      q + '%',
      normalizeDiscoveryText(v.university),
      v.department,
      v.limit,
      v.key,
    ]);
  });
}
export type PublicDiscoveryResult = DiscoveryResult & {
  departmentsByUniversity: Record<string, string[]>;
};
async function cataloguePage(
  tx: TransactionScope,
  params: URLSearchParams,
  account: AccountView | null,
): Promise<PublicDiscoveryResult> {
  await tx.query('SET LOCAL enable_nestloop=off');
  await tx.query('SET LOCAL jit=off');
  const selected = (
    await tx.query<{
      value: Omit<PublicDiscoveryResult, 'items'> & {
        items: { project: string; version: string }[];
      };
    }>(catalogueSql, catalogueValues(params, account))
  )[0]!.value;
  // Collection and point projections retain their existing query plans.
  await tx.query('SET LOCAL enable_nestloop=on');
  const projected = await tx.query<{
    value: DiscoveryResult['items'][number];
  }>(
    'SELECT app.external_projection(project,$2::uuid,$3::uuid) value FROM unnest($1::uuid[]) WITH ORDINALITY AS a(project,position) ORDER BY position',
    [
      selected.items.map((item) => item.project),
      account?.id ?? null,
      account?.sessionId ?? null,
    ],
  );
  if (
    projected.some(
      (item, index) => item.value.version !== selected.items[index]?.version,
    )
  )
    throw Error('PUBLIC_POINTER_CHANGED');
  return { ...selected, items: projected.map((item) => item.value) };
}
export async function publicCatalogue(
  params: URLSearchParams,
  account: AccountView | null,
): Promise<PublicDiscoveryResult> {
  const result = await db().transactions.run(async (tx) => {
    await tx.query(
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
    );
    return cataloguePage(tx, params, account);
  });
  result.items = await Promise.all(result.items.map(publicProject));
  return result;
}
/** A composed search snapshot must not mix pages from changing popularity order.
 * Final source and authority rechecks remain in the search delivery path. */
export async function publicCatalogueSnapshot(
  account: AccountView | null,
  sort = 'newest',
) {
  const pages = await db().transactions.run(async (tx) => {
    await tx.query(
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
    );
    const batches: PublicDiscoveryResult[] = [];
    for (let page = 1; ; page++) {
      const batch = await cataloguePage(
        tx,
        new URLSearchParams({ sort, pageSize: '50', page: String(page) }),
        account,
      );
      batches.push(batch);
      if (page * 50 >= batch.total) break;
    }
    return batches;
  });
  // Media reads occur after the transaction, in the same bounded page batches.
  const items: PublicDiscoveryResult['items'] = [];
  for (const page of pages)
    items.push(...(await Promise.all(page.items.map(publicProject))));
  return { items, facets: pages[0]!.facets };
}
