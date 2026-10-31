import { randomUUID, createHash } from 'node:crypto';
import { demoContext } from './context.js';
import { privateJson, type DemoIdentity } from './store.js';
import { projectSpecs, externalLevels } from './scenarios.js';
import {
  declarationKeys,
  emptyExternalForm,
} from '@capstone/domain/external-reviews';

export async function completeExternal(x: Awaited<ReturnType<typeof demoContext>>) {
try {
  const identities = await privateJson<Record<string, DemoIdentity>>(
    'identities.json',
    () => ({}),
  );
  const pool = Object.values(identities).filter(
    (p) => p.role === 'faculty_supervisor' && p.id,
  );
  const log: {
    plan: string;
    reviewerAlias: string;
    slot: number;
    quarterPoints: number;
    prefix: {
      n: number;
      sum: number;
      mean: number;
      threshold: number | null;
      floor: number;
      range: number;
      passed: boolean;
    };
  }[] = [];
  let steps = 0;
  let idle = 0;
  for (;;) {
    await x.events.drain(true);
    const rows = await x.sql(
      "SELECT a.id,a.case_id,a.reviewer_id,a.slot,v.title,c.project_id,r.kind FROM app.external_review_assignments a JOIN app.evaluation_cases c ON c.id=a.case_id JOIN app.project_versions v ON v.id=c.version_id JOIN app.external_policy_runs r ON r.id=a.policy_run_id WHERE a.status IN('offered','accepted') ORDER BY a.offered_at,a.id",
    );
    if (!rows.length) {
      // LISTEN can already own an in-flight drain. A null re-entrant drain is
      // not a policy failure; allow its committed offers to become visible.
      const pending = await x.sql(
        "SELECT c.id FROM app.evaluation_cases c JOIN app.project_versions v ON v.id=c.version_id LEFT JOIN app.evaluation_progression p ON p.case_id=c.id WHERE v.title=ANY($1::text[]) AND jsonb_array_length(app.first_pair_reasons(c.id))=0 AND coalesce(p.state,'queued_initial') IN('queued_initial','reviewing_initial','queued_expansion','reviewing_expansion')",
        [projectSpecs.map((p) => p.title)],
      );
      if (pending.length && ++idle < 300) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      if (pending.length) throw Error('POLICY_ALLOCATION_DID_NOT_SETTLE');
      break;
    }
    idle = 0;
    for (const row of rows) {
      if (++steps > 200) throw Error('UNEXPECTED_FACTORY_REVIEW_COUNT');
      const spec = projectSpecs.find((p) => p.title === row.title);
      if (row.kind !== 'event-first-pair-v3')
        throw Error('ACTUAL_EVENT_POLICY_PROVENANCE_REQUIRED');
      if (!spec || !spec.eligible)
        throw Error('INELIGIBLE_OR_UNKNOWN_FACTORY_ASSIGNMENT');
      const identity = pool.find((p) => p.id === row.reviewer_id);
      if (!identity) throw Error('NON_POOL_REVIEWER');
      const actor = await x.login(identity);
      const before = await x.sql(
        'SELECT quarter_points FROM app.external_assessments WHERE case_id=$1 ORDER BY finalized_at,id',
        [row.case_id],
      );
      const points = before.map((r) => Number(r.quarter_points)),
        n = points.length,
        sum = points.reduce((a, b) => a + b, 0),
        threshold = n >= 2 && n < 10 ? 80 + 2 * (n - 2) : null;
      const floor = n ? Math.min(...points) : 0,
        range = n ? Math.max(...points) - floor : 0;
      const passed =
        n < 2 ||
        (n < 10 &&
          threshold !== null &&
          sum >= threshold * 4 * n &&
          floor >= 280 &&
          range <= 80);
      if (!passed || (n >= 2 && Number(row.slot) !== n + 1))
        throw Error('ACTUAL_PREFIX_NOT_QUALIFIED');
      const offered = await x.reviews.view(actor, String(row.id));
      if (
        !('revision' in offered) ||
        !['offered', 'accepted'].includes(offered.status)
      )
        throw Error('REAL_OFFER_REQUIRED');
      // All results are fixture judgments. Actors have not queried peer/internal score DTOs.
      if (offered.status === 'offered')
        await x.reviews.command(actor, {
          assignment: String(row.id),
          operation: 'accept',
          revision: offered.revision,
          body: Object.fromEntries(declarationKeys.map((k) => [k, true])),
          command: randomUUID(),
        });
      const accepted = await x.reviews.view(actor, String(row.id));
      if (
        !('revision' in accepted) ||
        accepted.status !== 'accepted' ||
        !accepted.usable
      )
        throw Error('EXACT_PACKET_ACCESS_REQUIRED');
      const form = emptyExternalForm(),
        levels = externalLevels(spec.index, n);
      const comments = [
        'The local comparison separates the proposed contribution from the two documented alternatives; the evidence supports the selected contribution level without a world-first claim.',
        'The method exposes material assumptions and a reproducible decision rule. Trade-offs and boundary conditions are explicit; the selected level is limited to this bounded synthetic study.',
        'Thirty complete deterministic cases and the independent invariant or small-instance oracle are inspectable in the frozen source and results. No field-performance claim is inferred.',
        'The demonstrated practical value is inspectability and reproducibility. Field deployment, real operational benefit and external generalization remain unverified, as disclosed in the report.',
      ];
      form.criteria.forEach((c, i) => {
        c.level = levels[i]!;
        c.comment = comments[i]!;
      });
      await x.reviews.command(actor, {
        assignment: String(row.id),
        operation: 'finalize',
        revision: accepted.revision,
        body: form,
        command: randomUUID(),
      });
      const receipt = await x.reviews.view(actor, String(row.id));
      if (
        !('status' in receipt) ||
        receipt.status !== 'completed' ||
        ('usable' in receipt && receipt.usable)
      )
        throw Error('COMPLETED_ACCESS_CLOSURE_REQUIRED');
      const assessment = (
        await x.sql(
          'SELECT quarter_points FROM app.external_assessments WHERE assignment_id=$1',
          [row.id],
        )
      )[0];
      if (!assessment) throw Error('IMMUTABLE_EXTERNAL_FORM_REQUIRED');
      log.push({
        plan: spec.id,
        reviewerAlias:
          'R-' +
          createHash('sha256')
            .update(String(row.reviewer_id))
            .digest('hex')
            .slice(0, 12),
        slot: Number(row.slot),
        quarterPoints: Number(assessment.quarter_points),
        prefix: {
          n,
          sum,
          mean: n ? sum / (4 * n) : 0,
          threshold,
          floor,
          range,
          passed,
        },
      });
      console.log(
        JSON.stringify({
          stage: 'external-completed',
          plan: spec.id,
          slot: row.slot,
          total: Number(assessment.quarter_points) / 4,
        }),
      );
    }
  }
  await x.events.drain(true);
  const counts = await x.sql(
    'SELECT v.title,count(a.id)::int n,count(DISTINCT a.reviewer_id)::int reviewers,p.state FROM app.evaluation_cases c JOIN app.project_versions v ON v.id=c.version_id LEFT JOIN app.external_assessments a ON a.case_id=c.id LEFT JOIN app.evaluation_progression p ON p.case_id=c.id GROUP BY v.title,p.state',
  );
  console.log(JSON.stringify({ newCompletions: log.length, counts }));
} finally {
  await x.close();
}

}
