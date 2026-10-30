import 'server-only';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  matchReviewers,
  type AllocationCase,
  type ReviewerSnapshot,
} from '@capstone/domain/allocation-policy';
import {
  chooseEventAllocation,
  type EventCursor,
} from '@capstone/domain/event-allocation-policy';
type File = { key: string; size: number; sha256: string };
type Case = AllocationCase & {
  files: File[];
  reviewers: ReviewerSnapshot[];
  represented: string[];
  gateReasons: string[];
  eventEligibleAt: string | null;
  eventLane: 'Merit' | 'Discovery' | null;
};
type Snapshot = {
  cases: Case[];
  cutoff: string;
  eventAt: string | null;
  eventPolicy: { code: string; config_hash: string; config: unknown };
  eventCursor: EventCursor;
};
// This is a transaction-size bound, never a per-project review cap. Releasing
// capacity locks between small batches prevents ordinary reads/assessments from
// timing out behind a large eligible population. The queue continues at once.
const maxOffersPerTransaction = 1;
/** Durable committed events are primary; LISTEN is a low-latency hint, the short poll repairs lost hints. */
export function createEvaluationEventWorker(
  url: string,
  verify: (f: File) => Promise<boolean>,
  pollMilliseconds = 2000,
) {
  if (new URL(url).username !== 'capstone_jobs')
    throw Error('INVALID_JOB_ROLE');
  const pool = new pg.Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 1500,
    statement_timeout: 30000,
  });
  pool.on('error', () => {});
  const listener = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 1500,
  });
  let running = false,
    closed = false,
    failed = false;
  const snapshot = async (client: pg.PoolClient, force: boolean) =>
    (await client.query('SELECT app.first_pair_snapshot($1) value', [force]))
      .rows[0].value as Snapshot | null;
  async function drain(force = false) {
    if (running || closed) return null;
    running = true;
    let client: pg.PoolClient;
    let continueQueue = false;
    try {
      client = await pool.connect();
    } catch (error) {
      running = false;
      throw error;
    }
    try {
      await client.query('BEGIN');
      const source = await snapshot(client, force);
      if (!source) {
        await client.query('COMMIT');
        failed = false;
        return null;
      }
      const first = source,
        offers: unknown[] = [],
        unreadable = new Set<string>(),
        issued = new Map<string, string>();
      if (source.eventPolicy.code !== 'EVAL_POLICY_V3')
        throw Error('POLICY_CONFIGURATION_MISMATCH');
      // Deterministic scarcity queue: complete a started pair first, then oldest lawful wait and stable identity.
      for (let turn = 0; turn < maxOffersPerTransaction; turn++) {
        const initial = source.cases.filter(
          (c) =>
            c.gateReasons.length === 0 &&
            c.completed < 2 &&
            c.active + c.completed < 2 &&
            c.packet &&
            c.packetReadable &&
            !unreadable.has(c.id),
        );
        initial.sort(
          (a, b) =>
            Number(b.active + b.completed > 0) -
              Number(a.active + a.completed > 0) ||
            Date.parse(a.eventEligibleAt ?? a.publishedAt) -
              Date.parse(b.eventEligibleAt ?? b.publishedAt) ||
            a.id.localeCompare(b.id, 'en'),
        );
        // Optional expansion still uses the established progression conjunction and one-slot guard.
        const expansion = source.cases.filter(
          (c) =>
            c.gateReasons.length === 0 &&
            c.completed >= 2 &&
            c.completed < 10 &&
            c.active === 0 &&
            c.expansionReady &&
            c.nextSlot &&
            c.nextSlot > 2 &&
            !unreadable.has(c.id),
        );
        expansion.sort(
          (a, b) =>
            a.completed - b.completed ||
            Date.parse(a.waitingSince) - Date.parse(b.waitingSince) ||
            a.id.localeCompare(b.id, 'en'),
        );
        const choice = chooseEventAllocation(
            initial,
            expansion,
            source.eventCursor,
          ),
          selected = choice?.case,
          reviewer = choice?.reviewer;
        if (!selected || !reviewer) break;
        const slot =
            selected.nextSlot ?? selected.completed + selected.active + 1,
          run = randomUUID();
        const prepared = (
          await client.query(
            'SELECT app.first_pair_offer($1,$2,$3,$4,false) value',
            [run, reviewer, selected.packet, slot],
          )
        ).rows[0].value as { files?: File[] };
        let readable = !!prepared.files?.length;
        for (const f of prepared.files ?? [])
          if (!(await verify(f))) readable = false;
        if (!readable) {
          unreadable.add(selected.id);
          continue;
        }
        const offer = (
          await client.query(
            'SELECT app.first_pair_offer($1,$2,$3,$4,true) value',
            [run, reviewer, selected.packet, slot],
          )
        ).rows[0].value;
        const inputs = {
          policy: first.eventPolicy,
          cursorBefore: source.eventCursor,
          eventAt: first.eventAt,
          case: selected,
          cutoff: first.cutoff,
        };
        const outputs = {
          cases: [],
          selected: {
            case: selected.id,
            reviewer,
            packet: selected.packet,
            slot,
            offer,
            lane: choice!.lane,
            domain: selected.domain,
            university: selected.university,
            nextLane: choice!.nextLane,
            contended: choice!.contended,
            matchReasons: choice!.matchReasons,
          },
        };
        await client.query('SELECT app.first_pair_finish($1,$2,$3,$4)', [
          run,
          first.cutoff,
          JSON.stringify(inputs),
          JSON.stringify(outputs),
        ]);
        offers.push(outputs.selected);
        issued.set(selected.id, reviewer);
      }
      const statuses = source.cases.map((c) => {
        const active = c.active + Number(issued.has(c.id)),
          count = c.completed + active,
          waiting = Math.max(0, 2 - count),
          gates = [
            ...c.gateReasons,
            ...(!c.packetReadable ? ['packet_unavailable'] : []),
            ...(unreadable.has(c.id) ? ['packet_bytes_unavailable'] : []),
          ];
        return {
          case: c.id,
          gateReasons: gates,
          reasons: gates.length
            ? gates
            : waiting
              ? matchReviewers(
                  c,
                  c.reviewers.map((r) => ({
                    ...r,
                    workload:
                      r.workload + Number([...issued.values()].includes(r.id)),
                    participated: r.participated || issued.get(c.id) === r.id,
                  })),
                  c.represented,
                ).selected
                ? []
                : ['waiting_for_qualified_capacity']
              : [],
          offered: active,
          waiting: c.completed >= 2 ? 0 : waiting,
        };
      });
      const result = { cases: statuses, offers };
      await client.query('SELECT app.first_pair_finish($1,$2,$3,$4)', [
        randomUUID(),
        first.cutoff,
        JSON.stringify(first),
        JSON.stringify(result),
      ]);
      await client.query('COMMIT');
      continueQueue = offers.length === maxOffersPerTransaction;
      failed = false;
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
      running = false;
      if (continueQueue && !closed) setImmediate(retry);
    }
  }
  const retry = () => {
    void drain().catch(() => {
      failed = true;
      console.error(
        JSON.stringify({
          service: 'evaluation-events',
          code: 'EVENT_RETRY_PENDING',
        }),
      );
    });
  };
  const timer = setInterval(retry, pollMilliseconds);
  timer.unref();
  listener.on('notification', retry);
  listener.on('error', () => {
    failed = true;
  });
  const listening = listener
    .connect()
    .then(() => listener.query('LISTEN capstone_evaluation_eligible'))
    .catch(() => null);
  return {
    drain,
    ready: async () => {
      await listening;
      await pool.query('SELECT 1');
      if (failed) throw Error('EVALUATION_EVENT_RETRY_PENDING');
    },
    close: async () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      while (running) await new Promise((r) => setTimeout(r, 20));
      await listener.end().catch(() => {});
      await pool.end();
    },
  };
}
