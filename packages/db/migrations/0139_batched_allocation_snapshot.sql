-- Compute cohort ranks and guest-identity exclusions once per snapshot.
-- Preserve current policy, case/reviewer order, authority and transaction locks.
CREATE OR REPLACE FUNCTION app.first_pair_snapshot(force_value boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE snap jsonb;cases jsonb;cutoff timestamptz;BEGIN
 PERFORM pg_advisory_xact_lock(4630);
 IF NOT force_value AND NOT EXISTS(SELECT 1 FROM app.evaluation_wake_events WHERE handled_at IS NULL) AND NOT EXISTS(SELECT 1 FROM app.external_review_assignments WHERE status='offered' AND offer_expires_at<=app.governance_now() OR status='accepted' AND due_at<=app.governance_now()) THEN RETURN NULL;END IF;
 cutoff:=clock_timestamp();snap:=app.allocation_snapshot();
 WITH cohort AS MATERIALIZED (
  SELECT c.id,v.domain,v.academic_year,(2*s.quarter_points+3*cm.quarter_points)/20 internal,v.archived_at
  FROM app.evaluation_cases c
  JOIN app.projects p ON p.published_version_id=c.version_id AND p.id=c.project_id
  JOIN app.project_versions v ON v.id=c.version_id AND v.status='archived' AND v.approved_submission_id=c.submission_id
  JOIN app.effective_internal_assessments s ON s.case_id=c.id AND s.layer='supervisor'
  JOIN app.effective_internal_assessments cm ON cm.case_id=c.id AND cm.layer='committee'
  WHERE c.rubric_code='CORE_V1' AND v.domain IS NOT NULL AND v.academic_year IS NOT NULL
 ), ranked AS MATERIALIZED (
  SELECT *,row_number() OVER(PARTITION BY domain,academic_year ORDER BY internal DESC,archived_at,id) rank,
   count(*) OVER(PARTITION BY domain,academic_year) n FROM cohort
 ), lanes AS MATERIALIZED (
  SELECT id,CASE WHEN internal>=80 OR n>=10 AND rank<=ceil(n::numeric/5) THEN 'Merit' ELSE 'Discovery' END lane FROM ranked
 ), guest_conflicts AS MATERIALIZED (
  SELECT guest_case.project_id,jsonb_object_agg(u.id::text,true) reviewers
  FROM app.committee_invitations i JOIN app.evaluation_cases guest_case ON guest_case.id=i.case_id
  JOIN app.users u ON lower(u.email)=i.email GROUP BY guest_case.project_id
 )
 SELECT coalesce(jsonb_agg(x.value||jsonb_build_object(
  'eventLane',lanes.lane,'gateReasons',app.first_pair_reasons((x.value->>'id')::uuid),
  'eventEligibleAt',pair.eligible_at,
  'reviewers',(SELECT coalesce(jsonb_agg(r.value||jsonb_build_object('committeeConflict',
   coalesce((r.value->>'committeeConflict')::boolean,false) OR coalesce(guest_conflicts.reviewers ? (r.value->>'id'),false)) ORDER BY r.ordinality),'[]')
   FROM jsonb_array_elements(x.value->'reviewers') WITH ORDINALITY r(value,ordinality))
 ) ORDER BY x.ordinality),'[]') INTO cases
 FROM jsonb_array_elements(snap->'cases') WITH ORDINALITY x(value,ordinality)
 LEFT JOIN lanes ON lanes.id=(x.value->>'id')::uuid
 LEFT JOIN guest_conflicts ON guest_conflicts.project_id=(x.value->>'project')::uuid
 LEFT JOIN app.evaluation_pair_status pair ON pair.case_id=(x.value->>'id')::uuid;
 RETURN snap||jsonb_build_object('cases',cases,'cutoff',cutoff,'eventCursor',(SELECT to_jsonb(cur) FROM app.evaluation_event_cursor cur WHERE policy_code='EVAL_POLICY_V3'),'eventAt',(SELECT min(created_at) FROM app.evaluation_wake_events WHERE handled_at IS NULL),'eventPolicy',(SELECT to_jsonb(p) FROM app.evaluation_policies p WHERE code='EVAL_POLICY_V3'));
END $function$;
