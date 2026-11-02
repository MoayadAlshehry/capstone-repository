import { beforeEach, expect, it, vi } from 'vitest';
import type { TransactionScope } from '@capstone/db';
import type { QueryResultRow } from 'pg';

const state = vi.hoisted(() => ({
  total: 52,
  changed: false,
  transactions: 0,
  active: 0,
  decorated: 0,
  decoratedWhileActive: 0,
  wrongVersion: false,
  statements: [] as string[],
}));
const project = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const version = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

vi.mock('@capstone/db', () => ({
  createRuntimeDatabase: () => ({
    transactions: {
      async run(operation: (tx: TransactionScope) => Promise<unknown>) {
        state.transactions++;
        state.active++;
        const changedAtStart = state.changed;
        try {
          return await operation({
            transactionId: `snapshot-${state.transactions}`,
            async query<T extends QueryResultRow>(
              text: string,
              values: readonly unknown[] = [],
            ) {
              state.statements.push(text);
              let rows: unknown[] = [];
              if (text.startsWith('WITH public_rows')) {
                const ids = Array.from(
                  { length: state.total },
                  (_, i) => i + 1,
                );
                if (changedAtStart && ids.length) ids.unshift(ids.pop()!);
                const selected = ids.slice(
                  Number(values[12]),
                  Number(values[12]) + Number(values[11]),
                );
                rows = [
                  {
                    value: {
                      items: selected.map((n) => ({
                        project: project(n),
                        version: version(n),
                      })),
                      total: state.total,
                      publicCount: state.total,
                      page: Number(values[13]),
                      pageSize: Number(values[11]),
                      facets: {
                        universities: [],
                        departments: [],
                        academicYears: [],
                        domains: [],
                        authors: [],
                        supervisors: [],
                      },
                      departmentsByUniversity: {},
                    },
                  },
                ];
                // A concurrent popularity update moves the final record across the page boundary.
                state.changed = true;
              } else if (text.startsWith('SELECT app.external_projection')) {
                rows = (values[0] as string[]).map((id) => {
                  const n = Number(id.slice(-12));
                  return {
                    value: {
                      project: id,
                      version: version(state.wrongVersion ? n + 1000 : n),
                      title: `Synthetic record ${n}`,
                    },
                  };
                });
              }
              return rows as T[];
            },
          });
        } finally {
          state.active--;
        }
      },
    },
  }),
}));
vi.mock('../../apps/web/public-archive/server', () => ({
  publicProject: async (row: { project: string; version: string }) => {
    state.decorated++;
    if (state.active) state.decoratedWhileActive++;
    return row;
  },
}));
import {
  publicCatalogue,
  publicCatalogueSnapshot,
} from '../../apps/web/public-adoption/discovery-server';

beforeEach(() => {
  Object.assign(state, {
    total: 52,
    changed: false,
    transactions: 0,
    active: 0,
    decorated: 0,
    decoratedWhileActive: 0,
    wrongVersion: false,
    statements: [],
  });
});

it.each([0, 50, 52, 103])(
  'keeps %i public records in one read snapshot when popularity changes between pages',
  async (total) => {
    state.total = total;
    const snapshot = await publicCatalogueSnapshot(null, 'popular');
    expect(snapshot.items.map((row) => row.project)).toEqual(
      Array.from({ length: total }, (_, i) => project(i + 1)),
    );
    expect(new Set(snapshot.items.map((row) => row.project)).size).toBe(total);
    expect(state.transactions).toBe(1);
    expect(
      state.statements.filter(
        (sql) =>
          sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
      ),
    ).toHaveLength(1);
    expect(state.decorated).toBe(total);
    expect(state.decoratedWhileActive).toBe(0);
    expect(snapshot.facets.universities).toEqual([]);
  },
);

it('preserves the ordinary paged endpoint and exposes why independently committed pages cannot form a snapshot', async () => {
  const first = await publicCatalogue(
    new URLSearchParams({ sort: 'popular', pageSize: '50', page: '1' }),
    null,
  );
  const second = await publicCatalogue(
    new URLSearchParams({ sort: 'popular', pageSize: '50', page: '2' }),
    null,
  );
  expect(first.items).toHaveLength(50);
  expect(second.items).toHaveLength(2);
  expect(first.total).toBe(52);
  expect(
    new Set([...first.items, ...second.items].map((row) => row.project)).size,
  ).toBe(51);
  expect(state.transactions).toBe(2);
  expect(state.decoratedWhileActive).toBe(0);
});

it('retains the projected-version authority guard and does not decorate a rejected snapshot', async () => {
  state.wrongVersion = true;
  await expect(publicCatalogueSnapshot(null, 'popular')).rejects.toThrow(
    'PUBLIC_POINTER_CHANGED',
  );
  expect(state.active).toBe(0);
  expect(state.decorated).toBe(0);
});
