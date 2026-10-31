import { DEMO_SCHEMA_VERSION } from './release.js';
import { createShowcaseEngine } from '@capstone/domain/showcase-engine';
import { projectSpecs } from './scenarios.js';
import { database, digest } from './ownership.js';
export async function verifyDatabase(migrationUrl: string, runtimeUrl: string) {
  return database(migrationUrl, async (c) => {
    await c.query('BEGIN READ ONLY');
    try {
      const sql = async (q: string, args: unknown[] = []) =>
        (await c.query(q, args)).rows;
      const require = (condition: unknown, reason: string) => {
        if (!condition) throw Error('DEMO_VERIFY_' + reason);
      };
      const schema = Number(
        (
          await sql('SELECT count(*)::int n FROM drizzle.__drizzle_migrations')
        )[0]!.n,
      );
      require(schema === DEMO_SCHEMA_VERSION, 'SCHEMA');
      const core = await sql(
        `SELECT p.id project,v.id version,v.title,v.domain,u.code university,c.id case_id,c.submission_id,p.supervisor_id,
        s.quarter_points supervisor_q,cm.quarter_points committee_q,(2*s.quarter_points+3*cm.quarter_points)/20 internal,
        cr.member_count,cr.sum_quarter_points,cr.mean_quarter_points,
        (SELECT count(*)::int FROM app.project_authors pa WHERE pa.project_id=p.id) authors,
        (SELECT count(*)::int FROM app.project_authors pa WHERE pa.project_id=p.id AND pa.is_team_lead) leads,
        app.first_pair_reasons(c.id) admission_reasons,pr.state progression_state
        FROM app.projects p JOIN app.project_versions v ON v.id=p.published_version_id AND v.status='archived'
        JOIN app.universities u ON u.id=p.university_id JOIN app.evaluation_cases c ON c.version_id=v.id AND c.submission_id=v.approved_submission_id
        JOIN app.effective_internal_assessments s ON s.case_id=c.id AND s.layer='supervisor'
        JOIN app.effective_internal_assessments cm ON cm.case_id=c.id AND cm.layer='committee'
        JOIN app.current_committee_results cr ON cr.case_id=c.id
        LEFT JOIN app.evaluation_progression pr ON pr.case_id=c.id WHERE v.title=ANY($1::text[])`,
        [projectSpecs.map((p) => p.title)],
      );
      require(core.length === 50, 'FIFTY_INTERNAL_PUBLIC');
      const roster = await sql(
        "SELECT u.university_id,u.id,r.institution_id,r.domain_codes,r.reading_languages,r.availability,r.calibration_at FROM app.reviewer_profiles r JOIN app.users u ON u.id=r.user_id WHERE r.status='approved' AND r.availability AND r.calibration_at IS NOT NULL AND u.role_code='faculty_supervisor' AND u.account_status='active'",
      );
      require(roster.length >= 60, 'REVIEWER_POOL');
      require(new Set(roster.map((r) => r.institution_id)).size ===
        5, 'FIVE_REVIEWER_UNIVERSITIES');
      for (const institution of new Set(roster.map((r) => r.institution_id)))
        require(roster.filter((r) => r.institution_id === institution).length >=
          12, 'TWELVE_PER_UNIVERSITY');
      require(roster.every(
        (r) => r.university_id === r.institution_id,
      ), 'PROFILE_AFFILIATION');
      const progression: {
        plan: string;
        rank?: number;
        reviewCount: number;
        mean: number | null;
        internal: string;
        eligibility: string[];
        terminal: string;
        reviewers: string[];
        prefixes: unknown[];
      }[] = [];
      let externalTotal = 0,
        premiumTotal = 0,
        prefixCount = 0;
      for (const spec of projectSpecs) {
        const p = core.find((p) => p.title === spec.title);
        require(p, 'CORE_MISSING_' + spec.id);
        require(p!.university === spec.university.code &&
          Number(p!.authors) === spec.teamSize &&
          Number(p!.leads) === 1, 'TEAM_OR_TENANT_' + spec.id);
        require(Number(p!.member_count) >= 2 &&
          Number(p!.sum_quarter_points) / Number(p!.member_count) ===
            Number(p!.committee_q), 'COMMITTEE_ARITHMETIC_' + spec.id);
        require((p!.admission_reasons as string[]).length === 0
          ? spec.eligible
          : !spec.eligible, 'ADMISSION_' + spec.id);
        const forms = await sql(
          `SELECT a.id,a.entry_contract,a.quarter_points,a.reviewer_id,a.finalized_at,t.slot,t.status,t.institution_id,t.policy_run_id,
          t.offered_at,t.accepted_at,t.completed_at,pr.kind,u.university_id,
          (SELECT count(*)::int FROM app.external_criterion_scores s WHERE s.assessment_id=a.id) criteria,
          (SELECT sum(s.level*(CASE s.code WHEN 'E1' THEN 30 WHEN 'E2' THEN 25 WHEN 'E3' THEN 25 ELSE 20 END)) FROM app.external_criterion_scores s WHERE s.assessment_id=a.id) calculated,
          (SELECT count(DISTINCT code)::int FROM app.external_evidence_locators l WHERE l.assessment_id=a.id AND l.submission_id=$2) located
          FROM app.external_assessments a JOIN app.external_review_assignments t ON t.id=a.assignment_id
          JOIN app.external_policy_runs pr ON pr.id=t.policy_run_id JOIN app.users u ON u.id=a.reviewer_id
          WHERE a.case_id=$1 ORDER BY a.finalized_at,a.id`,
          [p!.case_id, p!.submission_id],
        );
        require(new Set(forms.map((a) => a.reviewer_id)).size ===
          forms.length, 'DUPLICATE_REVIEWER_' + spec.id);
        for (const f of forms) {
          require(f.status === 'completed' &&
            f.kind === 'event-first-pair-v3' &&
            f.university_id === f.institution_id, 'COMPLETED_PROVENANCE_' +
            spec.id);
          require(roster.some((r) => r.id === f.reviewer_id), 'APPROVAL_' +
            spec.id);
          const projectUniversity = (
            await sql('SELECT university_id FROM app.projects WHERE id=$1', [
              p!.project,
            ])
          )[0]!.university_id;
          require(f.university_id !==
            projectUniversity, 'INSTITUTION_CONFLICT_' + spec.id);
          require(Number(f.criteria) === 4 &&
            (f.entry_contract === 'REFERENCED_ENTRY_V1'
              ? Number(f.located) === 4
              : f.entry_contract === 'SCORES_ONLY_V3' &&
                Number(f.located) >= 0 &&
                Number(f.located) <= 4) &&
            Number(f.calculated) ===
              Number(f.quarter_points), 'RUBRIC_OR_EVIDENCE_' + spec.id);
          const witness = await sql(
            "SELECT inputs,outputs FROM app.evaluation_event_runs WHERE outputs->'selected'->>'case'=$1 AND outputs->'selected'->>'slot'=$2 AND outputs->'selected'->>'reviewer'=$3 ORDER BY executed_at LIMIT 1",
            [p!.case_id, String(f.slot), f.reviewer_id],
          );
          require(witness.length === 1, 'ASSIGNMENT_WITNESS_' + spec.id);
          const decision = witness[0]!.inputs.case;
          const match = decision?.reviewers.find(
            (r: { id: string }) => r.id === f.reviewer_id,
          );
          require(decision?.gateReasons.length === 0 &&
            decision.packetReadable &&
            match &&
            match.activeFaculty &&
            match.approved &&
            match.available &&
            match.calibrated &&
            match.workload < 2 &&
            match.institution !== decision.university &&
            match.domains.includes(p!.domain) &&
            decision.languages.every((l: string) =>
              match.languages.includes(l),
            ) &&
            !match.participated &&
            !match.author &&
            !match.supervisor &&
            !match.formerSupervisor &&
            !match.conflict &&
            !match.committeeConflict &&
            (!match.committeeNameMatch ||
              match.committeeNameResolved), 'ASSIGNMENT_MATCH_' + spec.id);
        }
        require(spec.eligible
          ? forms.length >= 2
          : forms.length === 0, 'ELIGIBLE_COMPLETION_' + spec.id);
        require(forms.length <= 10, 'REVIEW_CAP_' + spec.id);
        const points = forms.map((f) => Number(f.quarter_points)),
          sum = points.reduce((a, b) => a + b, 0),
          prefixes: unknown[] = [];
        if (spec.premium) {
          require(forms.length === 10 &&
            p!.progression_state === 'completed_limit', 'PREMIUM_MAXIMUM_' +
            spec.id);
          require((
            await sql(
              "SELECT count(*)::int n FROM app.external_review_assignments WHERE case_id=$1 AND status IN('offered','accepted')",
              [p!.case_id],
            )
          )[0]!.n === 0, 'ELEVENTH_PENDING_' + spec.id);
          for (let n = 2; n <= 9; n++) {
            const prior = points.slice(0, n),
              s = prior.reduce((a, b) => a + b, 0),
              threshold = 80 + 2 * (n - 2),
              minimum = Math.min(...prior),
              range = Math.max(...prior) - minimum;
            require(s >= n * threshold * 4 &&
              minimum >= 280 &&
              range <= 80, 'PREFIX_' + spec.id + '_' + n);
            const next = forms.find((f) => Number(f.slot) === n + 1);
            require(next, 'EXPANSION_SLOT_' + spec.id);
            const witness = await sql(
              "SELECT r.id,r.inputs,r.outputs FROM app.evaluation_event_runs r WHERE r.outputs->'selected'->>'case'=$1 AND r.outputs->'selected'->>'slot'=$2 ORDER BY executed_at LIMIT 1",
              [p!.case_id, String(n + 1)],
            );
            require(witness.length === 1, 'POLICY_WITNESS_' +
              spec.id +
              '_' +
              n);
            const decision = witness[0]!.inputs?.case;
            require(decision &&
              Number(decision.completed) === n &&
              decision.expansionReady &&
              decision.gateReasons.length === 0, 'PRIOR_STATE_WITNESS_' +
              spec.id +
              '_' +
              n);
            const reviewer = decision.reviewers.find(
              (r: { id: string }) => r.id === next!.reviewer_id,
            );
            require(reviewer &&
              reviewer.workload < 2 &&
              reviewer.institution !== projectUniversityFor(decision) &&
              !reviewer.participated &&
              !reviewer.author &&
              !reviewer.supervisor &&
              !reviewer.formerSupervisor &&
              !reviewer.conflict &&
              !reviewer.committeeConflict &&
              (!reviewer.committeeNameMatch ||
                reviewer.committeeNameResolved), 'MATCH_WITNESS_' +
              spec.id +
              '_' +
              n);
            prefixes.push({
              from: n,
              to: n + 1,
              threshold,
              sumQuarterPoints: s,
              minimumQuarterPoints: minimum,
              rangeQuarterPoints: range,
              policyRun: witness[0]!.id,
              passed: true,
            });
            prefixCount++;
          }
          premiumTotal += forms.length;
        }
        externalTotal += forms.length;
        progression.push({
          plan: spec.id,
          reviewCount: forms.length,
          mean: forms.length ? sum / (4 * forms.length) : null,
          internal: String(p!.internal),
          eligibility: p!.admission_reasons as string[],
          terminal: String(p!.progression_state),
          reviewers: forms.map(
            (f) => 'R-' + digest(String(f.reviewer_id)).slice(0, 12),
          ),
          prefixes,
        });
      }
      require(premiumTotal === 100 &&
        externalTotal >= 140 &&
        prefixCount === 80, 'V2_COUNTS');
      const violations =
        await sql(`SELECT a.id,a.reviewer_id,count(b.id)::int simultaneous
        FROM app.external_review_assignments a JOIN app.external_review_assignments b
        ON b.reviewer_id=a.reviewer_id AND b.offered_at<=a.offered_at
        AND coalesce(b.closed_at,b.completed_at,b.due_at,b.offer_expires_at)>a.offered_at
        GROUP BY a.id,a.reviewer_id HAVING count(b.id)>2`);
      require(violations.length === 0, 'INTERVAL_SCAN');
      const activeOver = await sql(
        "SELECT reviewer_id,count(*) FROM app.external_review_assignments WHERE status IN('offered','accepted') GROUP BY reviewer_id HAVING count(*)>2",
      );
      require(activeOver.length === 0, 'CURRENT_CAPACITY');
      const engine = createShowcaseEngine(runtimeUrl);
      let ranked;
      try {
        ranked = await engine.read(new URLSearchParams());
      } finally {
        await engine.close();
      }
      const expected = projectSpecs
        .slice(0, 10)
        .map((s) => core.find((p) => p.title === s.title)!.project);
      require(ranked.mode === 'ranked' &&
        JSON.stringify(
          ranked.main.slice(0, 10).map((p) => p.publication.project),
        ) === JSON.stringify(expected), 'GENUINE_TOP_TEN_ORDER');
      require(ranked.main[0]!.publication.university.nameEn ===
        'King Khalid University', 'KKU_FIRST');
      for (const [n, s] of projectSpecs.slice(0, 10).entries()) {
        progression.find((p) => p.plan === s.id)!.rank = n + 1;
        require(ranked.main[n]!.summary?.n === 10, 'PUBLIC_REVIEW_COUNT');
      }
      const normalized = {
        core: core
          .map((p) => ({
            project: p.project,
            version: p.version,
            case: p.case_id,
            university: p.university,
            authors: p.authors,
            leadCount: p.leads,
            supervisor: p.supervisor_id,
            supervisorQ: p.supervisor_q,
            committeeQ: p.committee_q,
          }))
          .sort((a, b) => String(a.project).localeCompare(String(b.project))),
        progression,
        reviewerPool: roster
          .map((r) => ({
            id: r.id,
            institution: r.institution_id,
            domains: r.domain_codes,
            languages: r.reading_languages,
          }))
          .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      };
      await c.query('COMMIT');
      return {
        at: new Date().toISOString(),
        passed: true,
        schema,
        coreProjects: 50,
        universities: 5,
        approvedMatchableReviewers: roster.length,
        premiumReviews: premiumTotal,
        externalReviews: externalTotal,
        escalationTransitions: prefixCount,
        ranking: ranked.main.slice(0, 10).map((p) => ({
          project: p.publication.project,
          title: p.publication.title,
          university: p.publication.university.nameEn,
          n: p.summary!.n,
        })),
        progression,
        normalizedDigest: digest(JSON.stringify(normalized)),
      };
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    }
  });
}
function projectUniversityFor(decision: { university: string }) {
  return decision.university;
}
