-- V2 local runs are immutable evidence. V3 records the complete permanent scarcity
-- rotation contract without delaying a healthy matchable first pair behind a batch.
ALTER TABLE app.evaluation_policies DROP CONSTRAINT evaluation_policies_code_check;
ALTER TABLE app.evaluation_policies ADD CHECK(code IN ('EVAL_POLICY_V1','EVAL_POLICY_V2','EVAL_POLICY_V3'));
INSERT INTO app.evaluation_policies SELECT 'EVAL_POLICY_V3',j,encode(sha256(convert_to(j::text,'UTF8')),'hex') FROM (SELECT '{"code":"EVAL_POLICY_V3","schemaVersion":3,"initial":"committed-event-first-pair","internalFloor":70,"committeeFloor":65,"eachMemberC3C4Floor":2,"capacity":2,"offerDays":7,"taskDays":14,"maxReviewers":10,"targetSeconds":60,"caseOrder":["half-pair","scarce-capacity-lane-domain-university-rotation","oldest-wait","stable-case-id"],"contentionPattern":["Merit","Merit","Discovery","Merit","Expansion"],"meritFloor":80,"minimumCohort":10,"quota":"ceil(N/5)","reviewerOrder":["institution-diversity","exact-tag-overlap","workload","oldest-assignment","user-id"],"expansion":"unchanged-progressive-thresholds"}'::jsonb j) x;
ALTER TABLE app.external_policy_runs DROP CONSTRAINT external_policy_runs_kind_check;
ALTER TABLE app.external_policy_runs ADD CHECK(kind IN ('technical-fixture-v1','scheduler-v1','event-first-pair-v2','event-first-pair-v3'));
ALTER TABLE app.evaluation_v2_runs RENAME TO evaluation_event_runs;
CREATE TABLE app.evaluation_event_cursor(policy_code text PRIMARY KEY REFERENCES app.evaluation_policies(code),revision bigint NOT NULL DEFAULT 0,lane integer NOT NULL DEFAULT 0 CHECK(lane BETWEEN 0 AND 4),domains jsonb NOT NULL DEFAULT '{}',universities jsonb NOT NULL DEFAULT '{}');
INSERT INTO app.evaluation_event_cursor(policy_code) VALUES('EVAL_POLICY_V3');
REVOKE ALL ON app.evaluation_event_cursor FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.event_allocation_lane(cid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 WITH target AS (SELECT v.domain,v.academic_year FROM app.evaluation_cases c JOIN app.project_versions v ON v.id=c.version_id WHERE c.id=cid),cohort AS (
 SELECT c.id,(2*s.quarter_points+3*cm.quarter_points)/20 internal,v.archived_at FROM app.evaluation_cases c JOIN app.projects p ON p.published_version_id=c.version_id AND p.id=c.project_id JOIN app.project_versions v ON v.id=c.version_id AND v.status='archived' AND v.approved_submission_id=c.submission_id JOIN target t ON t.domain=v.domain AND t.academic_year=v.academic_year JOIN app.effective_internal_assessments s ON s.case_id=c.id AND s.layer='supervisor' JOIN app.effective_internal_assessments cm ON cm.case_id=c.id AND cm.layer='committee' WHERE c.rubric_code='CORE_V1'),ranked AS (SELECT *,row_number() OVER(ORDER BY internal DESC,archived_at,id) rank,count(*) OVER() n FROM cohort)
 SELECT CASE WHEN internal>=80 OR n>=10 AND rank<=ceil(n::numeric/5) THEN 'Merit' ELSE 'Discovery' END FROM ranked WHERE id=cid
$$;
REVOKE ALL ON FUNCTION app.event_allocation_lane(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.first_pair_snapshot(boolean)'::regprocedure);
 d:=replace(d,'''gateReasons'',app.first_pair_reasons','''eventLane'',app.event_allocation_lane((x->>''id'')::uuid),''gateReasons'',app.first_pair_reasons');
 d:=replace(d,'''policyV2''','''eventPolicy''');d:=replace(d,'''EVAL_POLICY_V2''','''EVAL_POLICY_V3''');
 d:=replace(d,'''eventAt'',(SELECT min(created_at)','''eventCursor'',(SELECT to_jsonb(cur) FROM app.evaluation_event_cursor cur WHERE policy_code=''EVAL_POLICY_V3''),''eventAt'',(SELECT min(created_at)');EXECUTE d;
 d:=pg_get_functiondef('app.first_pair_offer(uuid,uuid,uuid,integer,boolean)'::regprocedure);d:=replace(d,'''event-first-pair-v2''','''event-first-pair-v3''');EXECUTE d;
 d:=pg_get_functiondef('app.first_pair_finish(uuid,timestamptz,jsonb,jsonb)'::regprocedure);
 d:=replace(d,'app.evaluation_v2_runs','app.evaluation_event_runs');d:=replace(d,'''EVAL_POLICY_V2''','''EVAL_POLICY_V3''');
 d:=replace(d,'FOR x IN SELECT value FROM jsonb_array_elements(outputs->''cases'') LOOP','IF outputs->''selected'' IS NOT NULL AND outputs->''selected''<>''null''::jsonb THEN UPDATE app.evaluation_event_cursor SET revision=revision+1,lane=(outputs->''selected''->>''nextLane'')::integer,domains=jsonb_set(domains,ARRAY[outputs->''selected''->>''lane''],to_jsonb(outputs->''selected''->>''domain'')),universities=jsonb_set(universities,ARRAY[(outputs->''selected''->>''lane'')||'':''||(outputs->''selected''->>''domain'')],to_jsonb(outputs->''selected''->>''university'')) WHERE policy_code=''EVAL_POLICY_V3'';END IF;FOR x IN SELECT value FROM jsonb_array_elements(outputs->''cases'') LOOP');EXECUTE d;
END $$;
INSERT INTO app.evaluation_wake_events(kind) VALUES('permanent_event_fairness.v3');
