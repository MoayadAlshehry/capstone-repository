import { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const model = vi.hoisted(() => ({
  snapshots: [] as unknown[],
  prepared: [] as Array<Array<{ key: string; size: number; sha256: string }>>,
  active: false,
  offers: 0,
  events: [] as string[],
  finishes: [] as unknown[],
}));
vi.mock('../../packages/infrastructure/node_modules/pg/esm/index.mjs', () => {
  class Connection {
    async query(sql: string, args: unknown[] = []) {
      if (sql === 'BEGIN') {
        model.active = true;
        model.events.push('begin');
      } else if (sql === 'ROLLBACK') {
        model.active = false;
        model.events.push('rollback');
      } else if (sql === 'COMMIT') {
        model.active = false;
        model.events.push('commit');
      } else if (sql.includes('first_pair_snapshot'))
        return { rows: [{ value: model.snapshots.shift() ?? null }] };
      else if (sql.includes('first_pair_offer') && sql.includes('false'))
        return { rows: [{ value: { files: model.prepared.shift() ?? [] } }] };
      else if (sql.includes('first_pair_offer') && sql.includes('true')) {
        expect(model.active).toBe(true);
        model.offers++;
        return { rows: [{ value: { assignment: 'new-offer' } }] };
      } else if (sql.includes('first_pair_finish')) {
        model.finishes.push(JSON.parse(String(args[3])));
        model.events.push('finish');
      }
      return { rows: [] };
    }
    release() {}
  }
  class Pool {
    on() {
      return this;
    }
    async connect() {
      return new Connection();
    }
    async query() {
      return { rows: [] };
    }
    async end() {}
  }
  class Client {
    on() {
      return this;
    }
    async connect() {}
    async query() {
      return { rows: [] };
    }
    async end() {}
  }
  return { default: { Pool, Client } };
});
import { createEvaluationEventWorker } from '../../packages/infrastructure/src/evaluation-events.js';
const file = { key: 'immutable-object', size: 20, sha256: 'a'.repeat(64) };
function snapshot(reviewer = 'reviewer-a', workload = 0) {
  return {
    cutoff: '2026-11-02T00:00:00Z',
    eventAt: '2026-11-01T00:00:00Z',
    eventPolicy: { code: 'EVAL_POLICY_V3', config_hash: 'policy', config: {} },
    eventCursor: { revision: 0, lane: 0, domains: {}, universities: {} },
    cases: [
      {
        id: 'case-a',
        project: 'project-a',
        version: 'version-a',
        university: 'uni-a',
        domain: 'software',
        academicYear: '2026',
        publishedAt: '2026-10-01T00:00:00Z',
        waitingSince: '2026-10-01T00:00:00Z',
        current: true,
        archived: true,
        approved: true,
        compatible: true,
        supervisor: { quarterPoints: 300, levels: {} },
        committee: { quarterPoints: 300, levels: {} },
        packet: 'packet-a',
        packetReadable: true,
        hold: false,
        discrepancy: false,
        explained: false,
        tags: ['research'],
        languages: ['en'],
        admittedAt: null,
        lane: null,
        completed: 0,
        initialHistory: 0,
        active: 0,
        expansionReady: false,
        expansionActive: false,
        eventLane: 'Discovery',
        eventEligibleAt: '2026-10-01T00:00:00Z',
        gateReasons: [],
        files: [file],
        represented: [],
        reviewers: [
          {
            id: reviewer,
            institution: 'uni-b',
            activeFaculty: true,
            approved: true,
            available: true,
            calibrated: true,
            domains: ['software'],
            languages: ['en'],
            tags: ['research'],
            workload,
            lastAssignedAt: null,
            author: false,
            supervisor: false,
            formerSupervisor: false,
            conflict: false,
            committeeConflict: false,
            committeeNameMatch: false,
            committeeNameResolved: false,
            participated: false,
          },
        ],
      },
    ],
  };
}
beforeEach(() => {
  vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => {
    throw Error('UNIT_NETWORK_FORBIDDEN');
  });
  model.snapshots = [];
  model.prepared = [];
  model.active = false;
  model.offers = 0;
  model.events = [];
  model.finishes = [];
});
afterEach(() => {
  expect(Socket.prototype.connect).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
async function run(verify: () => Promise<boolean>) {
  const w = createEvaluationEventWorker(
    'postgresql://capstone_jobs:unit@127.0.0.1/unit',
    verify,
    1000000,
  );
  try {
    return await w.drain(true);
  } finally {
    await w.close();
  }
}
describe('allocation preparation and locked revalidation', () => {
  it('verifies originals outside the transaction and commits a freshly selected offer', async () => {
    model.snapshots = [snapshot(), snapshot()];
    model.prepared = [[file], [file]];
    let seen = 0;
    const result = await run(async () => {
      seen++;
      expect(model.active).toBe(false);
      return true;
    });
    expect(seen).toBe(1);
    expect(model.offers).toBe(1);
    expect(result?.offers).toHaveLength(1);
    expect(model.events).toEqual([
      'begin',
      'rollback',
      'begin',
      'finish',
      'finish',
      'commit',
    ]);
  });
  it('does not reuse proof when the selected reviewer changes', async () => {
    model.snapshots = [snapshot(), snapshot('reviewer-b')];
    model.prepared = [[file], [file]];
    expect(await run(async () => true)).toBeNull();
    expect(model.offers).toBe(0);
    expect(model.finishes).toHaveLength(0);
    expect(model.active).toBe(false);
  });
  it('does not reuse proof when the current file identity changes', async () => {
    model.snapshots = [snapshot(), snapshot()];
    model.prepared = [[file], [{ ...file, sha256: 'b'.repeat(64) }]];
    expect(await run(async () => true)).toBeNull();
    expect(model.offers).toBe(0);
    expect(model.finishes).toHaveLength(0);
    expect(model.events.at(-1)).toBe('rollback');
  });
  it('honors newly exhausted reviewer capacity in the fresh snapshot', async () => {
    model.snapshots = [snapshot(), snapshot('reviewer-a', 2)];
    model.prepared = [[file]];
    const result = await run(async () => true);
    expect(result?.offers).toHaveLength(0);
    expect(model.offers).toBe(0);
    expect(result?.cases[0]?.reasons).toEqual([
      'waiting_for_qualified_capacity',
    ]);
  });
  it('leaves no transaction or offer after verification throws', async () => {
    model.snapshots = [snapshot()];
    model.prepared = [[file]];
    await expect(
      run(async () => {
        expect(model.active).toBe(false);
        throw Error('CONTROLLED_STORAGE_UNAVAILABLE');
      }),
    ).rejects.toThrow('CONTROLLED_STORAGE_UNAVAILABLE');
    expect(model.events).toEqual(['begin', 'rollback']);
    expect(model.offers).toBe(0);
    expect(model.active).toBe(false);
  });
  it('retains a failed-byte-verification wait without issuing an offer', async () => {
    model.snapshots = [snapshot(), snapshot()];
    model.prepared = [[file], [file]];
    const result = await run(async () => false);
    expect(model.offers).toBe(0);
    expect(result?.cases[0]?.reasons).toContain('packet_bytes_unavailable');
    expect(model.active).toBe(false);
  });
  it('does not verify or offer when there is no durable work', async () => {
    model.snapshots = [null];
    const verify = vi.fn(async () => true);
    expect(await run(verify)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(model.offers).toBe(0);
    expect(model.events).toEqual(['begin', 'commit']);
  });
  it('abandons preparation when work disappears before revalidation', async () => {
    model.snapshots = [snapshot(), null];
    model.prepared = [[file]];
    expect(await run(async () => true)).toBeNull();
    expect(model.offers).toBe(0);
    expect(model.active).toBe(false);
  });
});
