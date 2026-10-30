import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAllocationJobs } from '@capstone/db/allocation';
import {
  admission,
  selectAllocation,
  matchReviewers,
  type AllocationCase,
  type AllocationCursor,
  type ReviewerSnapshot,
  type ReadyDemand,
  policyCaseInput,
  eligibilityReasons,
  policyConfigMatches,
} from './allocation-policy.js';
type File = { key: string; size: number; sha256: string };
type SourceCase = AllocationCase & {
  files: File[];
  reviewers: ReviewerSnapshot[];
  represented: string[];
};
export type PolicySnapshot = {
  policy: { code: string; config_hash: string; config: { band: string } };
  revision: number;
  cursor: AllocationCursor;
  cases: SourceCase[];
  now: string;
};
export function createAllocationEngine(
  url: string,
  verify: (file: File) => Promise<boolean>,
) {
  const jobs = createAllocationJobs(url);
  async function readable(files: File[]) {
    if (files.length === 0) return false;
    for (const file of files) if (!(await verify(file))) return false;
    return true;
  }
  return {
    close: jobs.close,
    hasCases: jobs.hasCases,
    async run(run: string = randomUUID()): Promise<Record<string, unknown>> {
      return jobs.transaction<Record<string, unknown>>(run, async (tx) => {
        const source = await tx.snapshot<PolicySnapshot>();
        if (
          source.policy.code !== 'EVAL_POLICY_V1' ||
          !policyConfigMatches(source.policy.config)
        )
          throw Error('POLICY_CONFIGURATION_MISMATCH');
        for (const c of source.cases)
          if (c.packetReadable) c.packetReadable = await readable(c.files);
        const population = source.cases;
        // Queue age starts when this case first passes admission, including no-match cases.
        for (const c of population)
          if (!c.admittedAt && eligibilityReasons(c).length === 0)
            c.waitingSince = source.now;
        const admissions = population.map((c) => {
          const a = admission(c, population);
          return {
            case: c.id,
            waitingSince: c.waitingSince,
            ...a,
            candidates: matchReviewers(c, c.reviewers, c.represented)
              .candidates,
            state:
              c.progression &&
              [
                'paused_quality',
                'completed_limit',
                'superseded',
                'paused_access',
              ].includes(c.progression.state)
                ? c.progression.state
                : !c.current
                  ? 'superseded'
                  : a.reasons.includes('incomplete_internal')
                    ? 'awaiting_internal'
                    : c.hold ||
                        a.reasons.includes('discrepancy_explanation_required')
                      ? 'held'
                      : !a.eligible
                        ? 'awaiting_eligibility'
                        : c.expansionActive
                          ? 'reviewing_expansion'
                          : c.expansionReady
                            ? c.active > 0
                              ? 'reviewing_expansion'
                              : 'queued_expansion'
                            : c.active > 0 || c.completed >= 2
                              ? 'reviewing_initial'
                              : 'queued_initial',
          };
        });
        const demand: ReadyDemand[] = population.flatMap((c) => {
          const a = admissions.find((x) => x.case === c.id)!;
          const lane = c.expansionReady ? 'Expansion' : a.lane;
          return a.eligible && lane
            ? [
                {
                  case: c,
                  lane,
                  reviewers: c.reviewers,
                  represented: c.represented,
                },
              ]
            : [];
        });
        const choice = selectAllocation(demand, source.cursor, source.now);
        const selected = choice.selected;
        for (const a of admissions) {
          const c = population.find((x) => x.id === a.case)!;
          if (
            a.eligible &&
            c.nextSlot === undefined &&
            c.initialHistory >= 2 &&
            c.completed < 2 &&
            c.active === 0
          )
            a.reasons = [...a.reasons, 'initial_replacement_pending'];
          if (a.eligible && c.initialHistory < 2) {
            const m = matchReviewers(c, c.reviewers, c.represented);
            if (!m.selected) a.reasons = [...a.reasons, ...m.reasons];
          }
        }
        const inputs = {
          policy: source.policy,
          revision: source.revision,
          cursor: source.cursor,
          now: source.now,
          cases: population.map((c) => policyCaseInput(c)),
        };
        const outputs = {
          admissions,
          cursorBefore: choice.cursorBefore,
          cursorAfter: choice.cursorAfter,
          skips: choice.skips,
          selected: selected
            ? {
                case: selected.case.id,
                reviewer: selected.match.selected!.reviewer,
                lane: selected.lane,
                domain: selected.case.domain,
                university: selected.case.university,
                reasons: selected.match.reasons,
                candidates: selected.match.candidates,
              }
            : null,
        };
        if (!selected) return tx.commit(source.revision, inputs, outputs);
        const c = selected.case,
          reviewer = selected.match.selected!.reviewer;
        const slot =
          c.nextSlot ??
          (selected.lane === 'Expansion'
            ? c.completed + 1
            : c.initialHistory + 1);
        const prepared = await tx.prepare(reviewer, c.packet!, slot);
        if (!(await readable(prepared.files)))
          throw Error('PACKET_UNAVAILABLE');
        // Recheck selected case/profile/current capacity after Phase29 locks are acquired.
        const current = await tx.snapshot<PolicySnapshot>(),
          live = current.cases.find((x) => x.id === c.id)!;
        const comparable = (x: SourceCase) =>
          JSON.stringify({
            packet: x.packet,
            current: x.current,
            archived: x.archived,
            approved: x.approved,
            hold: x.hold,
            explained: x.explained,
            initialHistory: x.initialHistory,
            active: x.active,
            completed: x.completed,
            reviewer: x.reviewers.find((r) => r.id === reviewer),
          });
        if (
          !live ||
          comparable(live) !==
            comparable(population.find((x) => x.id === c.id)!)
        )
          throw Error('ALLOCATION_SNAPSHOT_CHANGED');
        return tx.commit(source.revision, inputs, outputs, {
          reviewer,
          packet: c.packet!,
          slot,
        });
      });
    },
  };
}
