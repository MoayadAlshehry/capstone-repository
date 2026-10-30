-- Phase30 initial admission/allocation; progression and correction commands are not owned here.
CREATE TABLE app.evaluation_policies(code text PRIMARY KEY CHECK(code='EVAL_POLICY_V1'),config jsonb NOT NULL,config_hash text NOT NULL CHECK(config_hash=encode(sha256(convert_to(config::text,'UTF8')),'hex')));
INSERT INTO app.evaluation_policies SELECT 'EVAL_POLICY_V1',v,encode(sha256(convert_to(v::text,'UTF8')),'hex') FROM (SELECT '{"code":"EVAL_POLICY_V1","schemaVersion":1,"internalFloor":70,"committeeFloor":65,"criterionFloor":2,"meritFloor":80,"minimumCohort":10,"quota":"ceil(N/5)","priority":"0.50I+0.20J+0.15V+0.15B","band":"min(19,floor(P/5))","agingDays":30,"pattern":["Merit","Merit","Discovery","Merit","Expansion"],"capacity":2,"offerDays":7,"taskDays":14,"neverAssigned":"first","caseTie":"publication-time-then-case-id","reviewerOrder":["institution-diversity","exact-tag-overlap","workload","oldest-assignment","user-id"],"skip":"consume-next-successful-pattern-position","rotation":"last-successful-id-stable-codepoint-successor"}'::jsonb v) q;
ALTER TABLE app.evaluation_policies ADD UNIQUE(code,config_hash);
CREATE TRIGGER immutable_allocation_policy BEFORE UPDATE OR DELETE ON app.evaluation_policies FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
ALTER TABLE app.evaluation_cases ADD COLUMN workflow_state text NOT NULL DEFAULT 'awaiting_internal' CHECK(workflow_state IN ('awaiting_internal','awaiting_eligibility','queued_initial','reviewing_initial','queued_expansion','reviewing_expansion','paused_quality','paused_access','held','completed_limit','superseded'));
CREATE FUNCTION app.allocation_case_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN IF TG_OP='DELETE' OR (to_jsonb(OLD)-'workflow_state') IS DISTINCT FROM (to_jsonb(NEW)-'workflow_state') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='IMMUTABLE_CASE_IDENTITY';END IF;RETURN NEW;END $$;
DROP TRIGGER immutable_evaluation ON app.evaluation_cases;
CREATE TRIGGER immutable_evaluation BEFORE UPDATE OR DELETE ON app.evaluation_cases FOR EACH ROW EXECUTE FUNCTION app.allocation_case_guard();
CREATE TABLE app.evaluation_allocation_cursor(policy_code text PRIMARY KEY REFERENCES app.evaluation_policies(code),revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),lane integer NOT NULL DEFAULT 0 CHECK(lane BETWEEN 0 AND 4),domains jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(domains)='object' AND domains-ARRAY['Merit','Discovery','Expansion']='{}'::jsonb),universities jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(universities)='object'));
INSERT INTO app.evaluation_allocation_cursor(policy_code) VALUES('EVAL_POLICY_V1');
CREATE TABLE app.evaluation_case_admissions(case_id uuid PRIMARY KEY REFERENCES app.evaluation_cases(id),policy_code text NOT NULL DEFAULT 'EVAL_POLICY_V1' REFERENCES app.evaluation_policies(code),lane text CHECK(lane IN ('Merit','Discovery','Expansion')),admitted_at timestamptz(3),waiting_since timestamptz(3) NOT NULL,last_run uuid,reasons jsonb NOT NULL DEFAULT '[]',eligible boolean NOT NULL DEFAULT false);
-- Governed resolution/progression writers belong to Phase31/32. No runtime write grant.
CREATE TABLE app.evaluation_allocation_prerequisites(case_id uuid PRIMARY KEY REFERENCES app.evaluation_cases(id),explanation text CHECK(char_length(btrim(explanation)) BETWEEN 20 AND 2000),hold boolean NOT NULL DEFAULT false,expansion_ready boolean NOT NULL DEFAULT false);
CREATE TABLE app.evaluation_reviewer_relations(case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),reviewer_id uuid NOT NULL REFERENCES app.users(id),conflict boolean NOT NULL DEFAULT false,committee_conflict boolean NOT NULL DEFAULT false,committee_name_resolved boolean NOT NULL DEFAULT false,reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 20 AND 400),PRIMARY KEY(case_id,reviewer_id));
CREATE TABLE app.evaluation_policy_runs(id uuid PRIMARY KEY REFERENCES app.external_policy_runs(id),policy_code text NOT NULL REFERENCES app.evaluation_policies(code),config_hash text NOT NULL,inputs jsonb NOT NULL,outputs jsonb NOT NULL,executed_at timestamptz(3) NOT NULL,input_hash text NOT NULL CHECK(input_hash=encode(sha256(convert_to(inputs::text,'UTF8')),'hex')));
ALTER TABLE app.evaluation_policy_runs ADD FOREIGN KEY(policy_code,config_hash) REFERENCES app.evaluation_policies(code,config_hash);
CREATE TRIGGER immutable_allocation_run BEFORE UPDATE OR DELETE ON app.evaluation_policy_runs FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
ALTER TABLE app.evaluation_case_admissions ADD FOREIGN KEY(last_run) REFERENCES app.evaluation_policy_runs(id);
REVOKE ALL ON app.evaluation_policies,app.evaluation_allocation_cursor,app.evaluation_case_admissions,app.evaluation_allocation_prerequisites,app.evaluation_reviewer_relations,app.evaluation_policy_runs FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.allocation_case_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.allocation_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE c record;r record;facts jsonb;packet jsonb;reviewers jsonb;cases jsonb:='[]';prereq app.evaluation_allocation_prerequisites;rel app.evaluation_reviewer_relations;cur app.evaluation_allocation_cursor;
BEGIN
 PERFORM pg_advisory_xact_lock(4630);
 SELECT * INTO cur FROM app.evaluation_allocation_cursor WHERE policy_code='EVAL_POLICY_V1' FOR UPDATE;
 -- Same authoritative Phase29 capacity locks, acquired before project locks.
 FOR r IN SELECT user_id FROM app.reviewer_profiles ORDER BY user_id LOOP PERFORM pg_advisory_xact_lock(hashtextextended(r.user_id::text,29));END LOOP;
 FOR c IN SELECT ec.*,v.domain,v.academic_year,v.keywords,v.archived_at,v.status,v.approved_submission_id,p.published_version_id,a.lane,a.admitted_at,a.waiting_since,w.current_packet_id FROM app.evaluation_cases ec JOIN app.projects p ON p.id=ec.project_id JOIN app.project_versions v ON v.id=ec.version_id LEFT JOIN app.evaluation_case_admissions a ON a.case_id=ec.id LEFT JOIN app.academic_packet_workspaces w ON w.case_id=ec.id ORDER BY ec.id LOOP
  SELECT * INTO prereq FROM app.evaluation_allocation_prerequisites WHERE case_id=c.id;
  packet:=NULL;
  IF c.current_packet_id IS NOT NULL THEN BEGIN packet:=app.external_packet(c.current_packet_id);EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE '23514' THEN packet:=NULL;END;END IF;
  reviewers:='[]';
  FOR r IN SELECT rp.user_id,rp.expertise_tags FROM app.reviewer_profiles rp ORDER BY rp.user_id LOOP
   facts:=app.reviewer_candidate_facts(r.user_id,c.project_id);SELECT * INTO rel FROM app.evaluation_reviewer_relations WHERE case_id=c.id AND reviewer_id=r.user_id;
   reviewers:=reviewers||jsonb_build_array(facts||jsonb_build_object('id',r.user_id,'tags',r.expertise_tags,'workload',(SELECT count(*) FROM app.external_review_assignments WHERE reviewer_id=r.user_id AND status IN ('offered','accepted')),'lastAssignedAt',(SELECT max(offered_at) FROM app.external_review_assignments WHERE reviewer_id=r.user_id),'conflict',coalesce(rel.conflict,false),'committeeConflict',coalesce(rel.committee_conflict,false),'committeeNameMatch',coalesce(facts->'committeeNameOriginalMatch',facts->'committeeNameMatch'),'committeeNameResolved',coalesce(rel.committee_name_resolved,false),'participated',EXISTS(SELECT 1 FROM app.external_review_assignments WHERE reviewer_id=r.user_id AND case_id=c.id)));
  END LOOP;
  cases:=cases||jsonb_build_array(jsonb_build_object('id',c.id,'project',c.project_id,'version',c.version_id,'university',c.university_id,'domain',c.domain,'academicYear',c.academic_year,'publishedAt',coalesce(c.archived_at,c.created_at),'waitingSince',coalesce(c.waiting_since,c.archived_at,c.created_at),'current',c.published_version_id=c.version_id,'archived',c.status='archived','approved',c.approved_submission_id=c.submission_id,'compatible',c.rubric_code='CORE_V1','supervisor',(SELECT jsonb_build_object('quarterPoints',ia.quarter_points,'levels',(SELECT jsonb_object_agg(code,level) FROM app.internal_criterion_scores WHERE assessment_id=ia.id)) FROM app.internal_assessments ia WHERE case_id=c.id AND layer='supervisor'),'committee',(SELECT jsonb_build_object('quarterPoints',ia.quarter_points,'levels',(SELECT jsonb_object_agg(code,level) FROM app.internal_criterion_scores WHERE assessment_id=ia.id)) FROM app.internal_assessments ia WHERE case_id=c.id AND layer='committee'),'packet',c.current_packet_id,'packetReadable',packet IS NOT NULL,'hold',coalesce(prereq.hold,false),'discrepancy',EXISTS(SELECT 1 FROM app.internal_evaluation_issues WHERE case_id=c.id),'explained',prereq.explanation IS NOT NULL,'tags',c.keywords,'languages',coalesce(packet->'manifest'->'languages','[]'),'admittedAt',c.admitted_at,'lane',c.lane,'completed',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND status='completed'),'initialHistory',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND slot<=2),'active',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted')),'expansionActive',EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id AND slot>2 AND status IN ('offered','accepted')),'expansionReady',coalesce(prereq.expansion_ready,false),'files',coalesce(packet->'files','[]'),'reviewers',reviewers,'represented',(SELECT coalesce(jsonb_agg(DISTINCT institution_id),'[]') FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted','completed'))));
 END LOOP;
 RETURN jsonb_build_object('policy',(SELECT to_jsonb(p) FROM app.evaluation_policies p WHERE code='EVAL_POLICY_V1'),'revision',cur.revision,'cursor',jsonb_build_object('lane',cur.lane,'domains',cur.domains,'universities',cur.universities),'cases',cases,'now',app.governance_now());
END $$;
REVOKE ALL ON FUNCTION app.allocation_snapshot() FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.allocation_snapshot() TO capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.allocation_commit(run uuid,expected bigint,inputs jsonb,outputs jsonb,reviewer uuid DEFAULT NULL,packet uuid DEFAULT NULL,slot_value integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE cur app.evaluation_allocation_cursor;previous app.evaluation_case_admissions;ic app.evaluation_cases;c app.evaluation_cases;sup app.internal_assessments;com app.internal_assessments;pr app.evaluation_allocation_prerequisites;rr app.evaluation_reviewer_relations;result jsonb;item jsonb;ev uuid;newstate text;
BEGIN
 PERFORM pg_advisory_xact_lock(4630);
 IF EXISTS(SELECT 1 FROM app.evaluation_policy_runs WHERE id=run) THEN RETURN (SELECT outputs FROM app.evaluation_policy_runs WHERE id=run);END IF;
 SELECT * INTO cur FROM app.evaluation_allocation_cursor WHERE policy_code='EVAL_POLICY_V1' FOR UPDATE;
 IF cur.revision<>expected OR inputs->'cursor' IS DISTINCT FROM jsonb_build_object('lane',cur.lane,'domains',cur.domains,'universities',cur.universities) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CURSOR_CHANGED';END IF;
 IF reviewer IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(reviewer::text,29));
  SELECT ec.* INTO c FROM app.evaluation_cases ec JOIN app.academic_review_packets ap ON ap.case_id=ec.id WHERE ap.id=packet;
  PERFORM 1 FROM app.projects WHERE id=c.project_id FOR UPDATE;PERFORM 1 FROM app.evaluation_cases WHERE id=c.id FOR UPDATE;
  SELECT * INTO sup FROM app.internal_assessments WHERE case_id=c.id AND layer='supervisor';SELECT * INTO com FROM app.internal_assessments WHERE case_id=c.id AND layer='committee';SELECT * INTO pr FROM app.evaluation_allocation_prerequisites WHERE case_id=c.id FOR SHARE;SELECT * INTO rr FROM app.evaluation_reviewer_relations WHERE case_id=c.id AND reviewer_id=reviewer FOR SHARE;
  IF c.rubric_code<>'CORE_V1' OR sup.rubric_hash IS DISTINCT FROM (SELECT config_hash FROM app.rubric_versions WHERE code='CORE_V1') OR com.rubric_hash IS DISTINCT FROM (SELECT config_hash FROM app.rubric_versions WHERE code='CORE_V1') OR (SELECT count(*) FROM app.internal_criterion_scores WHERE assessment_id=sup.id)<>7 OR (SELECT count(*) FROM app.internal_criterion_scores WHERE assessment_id=com.id)<>7 OR sup.id IS NULL OR com.id IS NULL OR 2*sup.quarter_points+3*com.quarter_points<1400 OR com.quarter_points<260 OR EXISTS(SELECT 1 FROM app.internal_criterion_scores WHERE assessment_id IN (sup.id,com.id) AND code IN ('C3','C4') AND level<2) OR coalesce(pr.hold,false) OR EXISTS(SELECT 1 FROM app.internal_evaluation_issues WHERE case_id=c.id) AND pr.explanation IS NULL OR coalesce(rr.conflict,false) OR coalesce(rr.committee_conflict,false) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ALLOCATION_GATE_CHANGED';END IF;
  IF slot_value<=2 THEN IF (SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND slot<=2)>=2 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='INITIAL_PAIR_RESERVED';END IF;
  ELSE IF NOT coalesce(pr.expansion_ready,false) OR (SELECT count(*) FROM app.external_assessments WHERE case_id=c.id)<2 OR EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='EXPANSION_NOT_READY';END IF;END IF;
 END IF;
 PERFORM app.external_policy_register(run,'scheduler-v1');
 IF reviewer IS NOT NULL THEN result:=app.external_offer(reviewer,packet,run,slot_value,run,true);outputs:=outputs||jsonb_build_object('offer',result);IF slot_value>2 THEN UPDATE app.evaluation_allocation_prerequisites SET expansion_ready=false WHERE case_id=c.id;END IF;END IF;
 INSERT INTO app.evaluation_policy_runs(id,policy_code,config_hash,inputs,outputs,executed_at,input_hash) SELECT run,'EVAL_POLICY_V1',config_hash,inputs,outputs,app.governance_now(),encode(sha256(convert_to(inputs::text,'UTF8')),'hex') FROM app.evaluation_policies WHERE code='EVAL_POLICY_V1';
 FOR item IN SELECT value FROM jsonb_array_elements(outputs->'admissions') LOOP
  newstate:=item->>'state';
  SELECT * INTO previous FROM app.evaluation_case_admissions WHERE case_id=(item->>'case')::uuid;SELECT * INTO ic FROM app.evaluation_cases WHERE id=(item->>'case')::uuid;
  INSERT INTO app.evaluation_case_admissions(case_id,lane,admitted_at,waiting_since,last_run,reasons,eligible) VALUES((item->>'case')::uuid,item->>'lane',CASE WHEN (item->>'eligible')::boolean THEN app.governance_now() ELSE NULL END,(item->>'waitingSince')::timestamptz,run,item->'reasons',(item->>'eligible')::boolean) ON CONFLICT(case_id) DO UPDATE SET lane=CASE WHEN app.evaluation_case_admissions.admitted_at IS NOT NULL THEN app.evaluation_case_admissions.lane ELSE EXCLUDED.lane END,admitted_at=coalesce(app.evaluation_case_admissions.admitted_at,EXCLUDED.admitted_at),waiting_since=CASE WHEN app.evaluation_case_admissions.admitted_at IS NULL AND EXCLUDED.eligible THEN EXCLUDED.waiting_since ELSE app.evaluation_case_admissions.waiting_since END,last_run=run,reasons=EXCLUDED.reasons,eligible=EXCLUDED.eligible;
  IF reviewer IS NOT NULL AND c.id=(item->>'case')::uuid THEN newstate:=CASE WHEN slot_value<=2 THEN 'reviewing_initial' ELSE 'reviewing_expansion' END;END IF;
  IF previous.case_id IS NULL OR previous.lane IS DISTINCT FROM item->>'lane' OR previous.eligible IS DISTINCT FROM (item->>'eligible')::boolean OR previous.reasons IS DISTINCT FROM item->'reasons' OR ic.workflow_state<>newstate THEN
   ev:=gen_random_uuid();INSERT INTO app.audit_logs(id,actor_kind,action,object_type,object_id,project_id,version_id,university_id,correlation_id,event_key,after_state,occurred_at) VALUES(ev,'system','system.allocation.admission','evaluation_case',ic.id,ic.project_id,ic.version_id,ic.university_id,run,ev,jsonb_build_object('scope',jsonb_build_object('policy','EVAL_POLICY_V1','run',run,'state',newstate,'lane',item->>'lane','reasons',item->'reasons')::text),app.governance_now());INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
  END IF;
  UPDATE app.evaluation_cases SET workflow_state=newstate WHERE id=(item->>'case')::uuid;
 END LOOP;
 IF reviewer IS NOT NULL THEN UPDATE app.evaluation_allocation_cursor SET revision=revision+1,lane=(outputs->'cursorAfter'->>'lane')::integer,domains=outputs->'cursorAfter'->'domains',universities=outputs->'cursorAfter'->'universities' WHERE policy_code='EVAL_POLICY_V1';END IF;
 ev:=gen_random_uuid();INSERT INTO app.audit_logs(id,actor_kind,action,object_type,object_id,project_id,version_id,university_id,correlation_id,event_key,after_state,occurred_at) VALUES(ev,'system','system.allocation.run','evaluation_policy_run',run,c.project_id,c.version_id,c.university_id,run,ev,jsonb_build_object('scope',jsonb_build_object('policy','EVAL_POLICY_V1','run',run,'case',c.id,'lane',outputs->'selected'->>'lane','assignment',result->>'assignment','reasons',outputs->'skips')::text),app.governance_now());INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 RETURN outputs;
END $$;
REVOKE ALL ON FUNCTION app.allocation_commit(uuid,bigint,jsonb,jsonb,uuid,uuid,integer) FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.allocation_commit(uuid,bigint,jsonb,jsonb,uuid,uuid,integer) TO capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.allocation_view(who uuid,sid uuid,run_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE a app.users;cases jsonb;r jsonb;
BEGIN
 a:=app.partner_access_principal(who,sid);IF a.role_code NOT IN ('platform_admin','university_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='GOVERNANCE_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'case'),'[]') INTO cases FROM (SELECT jsonb_build_object('case',c.id,'project',c.project_id,'version',c.version_id,'title',v.title,'university',c.university_id,'state',c.workflow_state,'lane',ad.lane,'eligible',ad.eligible,'admittedAt',ad.admitted_at,'waitingSince',ad.waiting_since,'reasons',ad.reasons,'run',ad.last_run,'coverage',(SELECT count(*) FROM app.external_assessments WHERE case_id=c.id),'active',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted')),'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('assignment',t.id,'reviewer',t.reviewer_id,'institution',t.institution_id,'status',t.status,'offeredAt',t.offered_at,'policyRun',t.policy_run_id,'policySnapshot',EXISTS(SELECT 1 FROM app.evaluation_policy_runs er WHERE er.id=t.policy_run_id)) ORDER BY t.offered_at),'[]') FROM app.external_review_assignments t WHERE case_id=c.id)) value FROM app.evaluation_cases c JOIN app.project_versions v ON v.id=c.version_id LEFT JOIN app.evaluation_case_admissions ad ON ad.case_id=c.id WHERE a.role_code='platform_admin' OR c.university_id=a.university_id ORDER BY c.created_at DESC,c.id LIMIT 100) q;
 IF run_id IS NOT NULL THEN SELECT jsonb_build_object('id',p.id,'policy',p.policy_code,'hash',p.config_hash,'executedAt',p.executed_at,'inputs',p.inputs,'outputs',p.outputs) INTO r FROM app.evaluation_policy_runs p WHERE p.id=run_id AND (a.role_code='platform_admin' OR EXISTS(SELECT 1 FROM app.evaluation_case_admissions ad JOIN app.evaluation_cases c ON c.id=ad.case_id WHERE ad.last_run=p.id AND c.university_id=a.university_id) OR EXISTS(SELECT 1 FROM app.external_review_assignments t JOIN app.evaluation_cases c ON c.id=t.case_id WHERE t.policy_run_id=p.id AND c.university_id=a.university_id));IF r IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;IF a.role_code<>'platform_admin' THEN r:=r-'inputs'-'outputs';END IF;END IF;
 RETURN jsonb_build_object('policy','EVAL_POLICY_V1','cases',cases,'run',r,'cursor',CASE WHEN a.role_code='platform_admin' THEN (SELECT jsonb_build_object('revision',revision,'lane',lane,'domains',domains,'universities',universities) FROM app.evaluation_allocation_cursor WHERE policy_code='EVAL_POLICY_V1') ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION app.allocation_view(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.allocation_view(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.allocation_result(run uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ SELECT outputs FROM app.evaluation_policy_runs WHERE id=run $$;
REVOKE ALL ON FUNCTION app.allocation_result(uuid) FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.allocation_result(uuid) TO capstone_jobs;
--> statement-breakpoint
CREATE TABLE app.evaluation_scheduler_events(event_id uuid PRIMARY KEY REFERENCES app.audit_logs(id),queued_at timestamptz);
REVOKE ALL ON app.evaluation_scheduler_events FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.allocation_wakeup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF NEW.action ~ '^(publication\.|packet\.|academic-packet\.|reviewer\.|evaluation\.|external-review\.(finalize|decline|withdraw|inability|cancel|expire)|system\.external-review\.(cancel|expire))' THEN INSERT INTO app.evaluation_scheduler_events(event_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;END IF;RETURN NEW;END $$;
CREATE TRIGGER allocation_business_event AFTER INSERT ON app.audit_logs FOR EACH ROW EXECUTE FUNCTION app.allocation_wakeup();
CREATE FUNCTION app.allocation_pending_events() RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ SELECT e.event_id FROM app.evaluation_scheduler_events e JOIN app.audit_logs a ON a.id=e.event_id WHERE queued_at IS NULL ORDER BY a.occurred_at,e.event_id LIMIT 100 $$;
CREATE FUNCTION app.allocation_event_queued(event uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ UPDATE app.evaluation_scheduler_events SET queued_at=coalesce(queued_at,app.governance_now()) WHERE event_id=event $$;
REVOKE ALL ON FUNCTION app.allocation_wakeup(),app.allocation_pending_events(),app.allocation_event_queued(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.allocation_pending_events(),app.allocation_event_queued(uuid) TO capstone_jobs;
--> statement-breakpoint
-- Keep the original committee-name provenance while recognizing a recorded resolution.
ALTER FUNCTION app.reviewer_candidate_facts(uuid,uuid) RENAME TO reviewer_candidate_facts_before_allocation;
CREATE FUNCTION app.reviewer_candidate_facts(reviewer uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE f jsonb;resolved boolean;
BEGIN
 f:=app.reviewer_candidate_facts_before_allocation(reviewer,pid);
 SELECT coalesce(bool_or(r.committee_name_resolved AND NOT r.committee_conflict AND NOT r.conflict),false) INTO resolved FROM app.evaluation_reviewer_relations r JOIN app.evaluation_cases c ON c.id=r.case_id JOIN app.projects p ON p.id=c.project_id WHERE p.id=pid AND p.published_version_id=c.version_id AND r.reviewer_id=reviewer;
 RETURN f||jsonb_build_object('committeeNameOriginalMatch',f->'committeeNameMatch','committeeNameMatch',f->'committeeNameMatch'='true'::jsonb AND NOT resolved);
END $$;
REVOKE ALL ON FUNCTION app.reviewer_candidate_facts_before_allocation(uuid,uuid),app.reviewer_candidate_facts(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.reviewer_candidate_facts(uuid,uuid) TO capstone_jobs;

--> statement-breakpoint
-- Phase29 provenance is preserved; new technical runs are test-only.
CREATE OR REPLACE FUNCTION app.external_policy_register(run uuid,kind_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF kind_value NOT IN ('technical-fixture-v1','scheduler-v1') OR run IS NULL OR kind_value='technical-fixture-v1' AND left(current_database(),14)<>'capstone_test_' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='UNTRUSTED_ALLOCATION';END IF;
 INSERT INTO app.external_policy_runs(id,kind) VALUES(run,kind_value) ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM app.external_policy_runs WHERE id=run AND kind=kind_value) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='RUN_CONFLICT';END IF;
END $$;
--> statement-breakpoint
-- Reuse the Phase29 command; retire normal-environment technical offers without altering history.
ALTER FUNCTION app.external_offer(uuid,uuid,uuid,integer,uuid,boolean) RENAME TO external_offer_before_allocation;
CREATE FUNCTION app.external_offer(reviewer uuid,packet uuid,run uuid,slot_value integer,cid uuid,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF left(current_database(),14)<>'capstone_test_' AND EXISTS(SELECT 1 FROM app.external_policy_runs WHERE id=run AND kind='technical-fixture-v1') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TECHNICAL_OFFERS_TEST_ONLY';END IF;
 RETURN app.external_offer_before_allocation(reviewer,packet,run,slot_value,cid,commit_value);
END $$;
REVOKE ALL ON FUNCTION app.external_offer_before_allocation(uuid,uuid,uuid,integer,uuid,boolean),app.external_offer(uuid,uuid,uuid,integer,uuid,boolean) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_offer(uuid,uuid,uuid,integer,uuid,boolean) TO capstone_jobs;
