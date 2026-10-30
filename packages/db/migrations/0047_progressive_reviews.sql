-- Phase31 progression, incomplete-slot replacements and server deadline processing.
CREATE TABLE app.evaluation_progression(case_id uuid PRIMARY KEY REFERENCES app.evaluation_cases(id),n integer NOT NULL CHECK(n BETWEEN 0 AND 10),sum_quarter_points integer NOT NULL,min_quarter_points integer,max_quarter_points integer,threshold integer,state text NOT NULL,quality_paused boolean NOT NULL DEFAULT false,next_slot integer CHECK(next_slot BETWEEN 1 AND 10),active_initial integer NOT NULL CHECK(active_initial BETWEEN 0 AND 2),active_expansion integer NOT NULL CHECK(active_expansion BETWEEN 0 AND 1),reasons jsonb NOT NULL,last_decision uuid,decision_hash text NOT NULL);
CREATE TABLE app.evaluation_progression_runs(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),policy_code text NOT NULL REFERENCES app.evaluation_policies(code),config_hash text NOT NULL,inputs jsonb NOT NULL,outputs jsonb NOT NULL,executed_at timestamptz(3) NOT NULL,FOREIGN KEY(policy_code,config_hash) REFERENCES app.evaluation_policies(code,config_hash));
CREATE TRIGGER immutable_progression_run BEFORE UPDATE OR DELETE ON app.evaluation_progression_runs FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
ALTER TABLE app.evaluation_progression ADD FOREIGN KEY(last_decision) REFERENCES app.evaluation_progression_runs(id);
REVOKE ALL ON app.evaluation_progression,app.evaluation_progression_runs FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.progression_cancel(aid uuid,cid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.external_review_assignments;old text;
BEGIN
 SELECT * INTO t FROM app.external_review_assignments WHERE id=aid FOR UPDATE;
 IF t.status NOT IN ('offered','accepted') THEN RETURN;END IF;
 old:=t.status;t.status:='cancelled';t.closed_at:=app.governance_now();t.closure_code:='superseded_case';
 UPDATE app.external_review_assignments SET status=t.status,closed_at=t.closed_at,closure_code=t.closure_code WHERE id=t.id;
 PERFORM app.reminder_resolve(t.offer_reminder);PERFORM app.reminder_resolve(t.task_reminder);PERFORM app.external_event(t,NULL,'cancel',cid,old);
END $$;
CREATE FUNCTION app.progression_successor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t record;
BEGIN
 IF OLD.published_version_id IS DISTINCT FROM NEW.published_version_id THEN
 FOR t IN SELECT a.id FROM app.external_review_assignments a JOIN app.evaluation_cases c ON c.id=a.case_id WHERE c.project_id=NEW.id AND c.version_id IS DISTINCT FROM NEW.published_version_id AND a.status IN ('offered','accepted') ORDER BY a.id LOOP PERFORM app.progression_cancel(t.id,gen_random_uuid());END LOOP;
 UPDATE app.evaluation_cases SET workflow_state='superseded' WHERE project_id=NEW.id AND version_id IS DISTINCT FROM NEW.published_version_id;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER progression_successor_cancellation AFTER UPDATE OF published_version_id ON app.projects FOR EACH ROW EXECUTE FUNCTION app.progression_successor();
REVOKE ALL ON FUNCTION app.progression_cancel(uuid,uuid),app.progression_successor() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.progression_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE c record;t record;previous app.evaluation_progression;num integer;total integer;lo integer;hi integer;th integer;ai integer;ax integer;slot_value integer;state_value text;reasons jsonb;latch boolean;packet uuid;ready boolean;input_value jsonb;output_value jsonb;digest_value text;decision uuid;ev uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(4630);
 FOR t IN SELECT user_id FROM app.reviewer_profiles ORDER BY user_id LOOP PERFORM pg_advisory_xact_lock(hashtextextended(t.user_id::text,29));END LOOP;
 FOR c IN SELECT ec.*,p.published_version_id FROM app.evaluation_cases ec JOIN app.projects p ON p.id=ec.project_id ORDER BY ec.project_id,ec.id LOOP
  PERFORM 1 FROM app.projects WHERE id=c.project_id FOR UPDATE;SELECT published_version_id INTO c.published_version_id FROM app.projects WHERE id=c.project_id;PERFORM 1 FROM app.evaluation_cases WHERE id=c.id FOR UPDATE;
  FOR t IN SELECT * FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted') ORDER BY id FOR UPDATE LOOP
   IF c.version_id IS DISTINCT FROM c.published_version_id THEN PERFORM app.progression_cancel(t.id,gen_random_uuid());
   ELSIF app.governance_now()>=(CASE WHEN t.status='offered' THEN t.offer_expires_at ELSE t.due_at END) THEN PERFORM app.external_expire(t.id,gen_random_uuid());END IF;
  END LOOP;
  SELECT count(*),coalesce(sum(quarter_points),0),min(quarter_points),max(quarter_points) INTO num,total,lo,hi FROM app.external_assessments WHERE case_id=c.id;
  SELECT count(*) FILTER(WHERE slot<=2),count(*) FILTER(WHERE slot>2) INTO ai,ax FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted');
  IF num>10 OR ai>2 OR ax>1 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='EXTERNAL_COVERAGE_INTEGRITY';END IF;
  SELECT * INTO previous FROM app.evaluation_progression WHERE case_id=c.id FOR UPDATE;latch:=coalesce(previous.quality_paused,false);th:=CASE WHEN num BETWEEN 2 AND 9 THEN 80+2*(num-2) ELSE NULL END;reasons:='[]';slot_value:=NULL;
  IF num<2 THEN state_value:=CASE WHEN ai>0 THEN 'reviewing_initial' ELSE 'queued_initial' END;reasons:='["initial_pair_incomplete"]';
   SELECT s INTO slot_value FROM generate_series(1,2) s WHERE NOT EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id AND slot=s AND status IN ('offered','accepted','completed')) ORDER BY s LIMIT 1;
  ELSIF num=10 THEN state_value:='completed_limit';reasons:='["completed_limit"]';
  ELSE
   IF total<num*th*4 THEN reasons:=reasons||'"mean_below_threshold"'::jsonb;END IF;
   IF lo<280 THEN reasons:=reasons||'"external_score_floor"'::jsonb;END IF;
   IF hi-lo>80 THEN reasons:=reasons||'"external_range_exceeded"'::jsonb;END IF;
   IF latch THEN reasons:=reasons||'"quality_pause_latched"'::jsonb;END IF;
   IF jsonb_array_length(reasons)>0 THEN latch:=true;IF NOT reasons ? 'quality_pause_latched' THEN reasons:=reasons||'"quality_pause_latched"'::jsonb;END IF;state_value:='paused_quality';
   ELSIF ax>0 THEN state_value:='reviewing_expansion';reasons:='["expansion_active"]';
   ELSE state_value:='queued_expansion';slot_value:=num+1;reasons:='["expansion_qualified"]';END IF;
  END IF;
  SELECT current_packet_id INTO packet FROM app.academic_packet_workspaces WHERE case_id=c.id;ready:=false;
  IF packet IS NOT NULL THEN BEGIN PERFORM app.external_packet(packet);ready:=true;EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE '23514' THEN ready:=false;END;END IF;
  IF c.version_id IS DISTINCT FROM c.published_version_id THEN state_value:='superseded';slot_value:=NULL;reasons:=reasons||'"superseded_case"'::jsonb;
  ELSIF coalesce((SELECT hold FROM app.evaluation_allocation_prerequisites WHERE case_id=c.id),false) THEN IF NOT latch AND num<10 THEN state_value:='held';END IF;slot_value:=NULL;reasons:=reasons||'"governance_hold"'::jsonb;
  ELSIF NOT ready THEN IF NOT latch AND num<10 THEN state_value:='paused_access';END IF;slot_value:=NULL;reasons:=reasons||'"packet_unavailable"'::jsonb;END IF;
  input_value:=jsonb_build_object('case',c.id,'assessmentQuarterPoints',(SELECT coalesce(jsonb_agg(jsonb_build_object('assessment',id,'reviewer',reviewer_id,'quarterPoints',quarter_points) ORDER BY id),'[]') FROM app.external_assessments WHERE case_id=c.id),'activeInitial',ai,'activeExpansion',ax,'current',c.version_id=c.published_version_id,'packet',packet,'packetReady',ready,'qualityPaused',latch);
  output_value:=jsonb_build_object('n',num,'sumQuarterPoints',total,'minQuarterPoints',lo,'maxQuarterPoints',hi,'mean',CASE WHEN num>0 THEN jsonb_build_object('numerator',total,'denominator',4*num) ELSE NULL END,'rangeQuarterPoints',hi-lo,'threshold',th,'state',state_value,'nextSlot',slot_value,'reasons',reasons);
  digest_value:=encode(sha256(convert_to(jsonb_build_array(input_value,output_value)::text,'UTF8')),'hex');
  IF previous.case_id IS NULL OR previous.decision_hash<>digest_value THEN
   decision:=gen_random_uuid();INSERT INTO app.evaluation_progression_runs SELECT decision,c.id,code,config_hash,input_value,output_value,app.governance_now() FROM app.evaluation_policies WHERE code='EVAL_POLICY_V1';
   ev:=gen_random_uuid();INSERT INTO app.audit_logs(id,actor_kind,action,object_type,object_id,project_id,version_id,university_id,correlation_id,event_key,after_state,occurred_at) VALUES(ev,'system','system.progression.'||state_value,'evaluation_case',c.id,c.project_id,c.version_id,c.university_id,decision,ev,jsonb_build_object('scope',jsonb_build_object('case',c.id,'run',decision,'state',state_value,'n',num,'reasons',reasons)::text),app.governance_now());INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
   INSERT INTO app.evaluation_progression VALUES(c.id,num,total,lo,hi,th,state_value,latch,slot_value,ai,ax,reasons,decision,digest_value) ON CONFLICT(case_id) DO UPDATE SET n=num,sum_quarter_points=total,min_quarter_points=lo,max_quarter_points=hi,threshold=th,state=state_value,quality_paused=latch,next_slot=slot_value,active_initial=ai,active_expansion=ax,reasons=EXCLUDED.reasons,last_decision=decision,decision_hash=digest_value;
  END IF;
  INSERT INTO app.evaluation_allocation_prerequisites(case_id,expansion_ready) VALUES(c.id,state_value='queued_expansion' AND slot_value IS NOT NULL) ON CONFLICT(case_id) DO UPDATE SET expansion_ready=EXCLUDED.expansion_ready;
  UPDATE app.evaluation_cases SET workflow_state=state_value WHERE id=c.id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.progression_tick() FROM PUBLIC,capstone_runtime,capstone_jobs;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.allocation_snapshot() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE c record;r record;facts jsonb;packet jsonb;reviewers jsonb;cases jsonb:='[]';prereq app.evaluation_allocation_prerequisites;rel app.evaluation_reviewer_relations;cur app.evaluation_allocation_cursor;
BEGIN
 PERFORM app.progression_tick();
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
  cases:=cases||jsonb_build_array(jsonb_build_object('id',c.id,'project',c.project_id,'version',c.version_id,'university',c.university_id,'domain',c.domain,'academicYear',c.academic_year,'publishedAt',coalesce(c.archived_at,c.created_at),'waitingSince',coalesce(c.waiting_since,c.archived_at,c.created_at),'current',c.published_version_id=c.version_id,'archived',c.status='archived','approved',c.approved_submission_id=c.submission_id,'compatible',c.rubric_code='CORE_V1','supervisor',(SELECT jsonb_build_object('quarterPoints',ia.quarter_points,'levels',(SELECT jsonb_object_agg(code,level) FROM app.internal_criterion_scores WHERE assessment_id=ia.id)) FROM app.internal_assessments ia WHERE case_id=c.id AND layer='supervisor'),'committee',(SELECT jsonb_build_object('quarterPoints',ia.quarter_points,'levels',(SELECT jsonb_object_agg(code,level) FROM app.internal_criterion_scores WHERE assessment_id=ia.id)) FROM app.internal_assessments ia WHERE case_id=c.id AND layer='committee'),'packet',c.current_packet_id,'packetReadable',packet IS NOT NULL,'hold',coalesce(prereq.hold,false),'discrepancy',EXISTS(SELECT 1 FROM app.internal_evaluation_issues WHERE case_id=c.id),'explained',prereq.explanation IS NOT NULL,'tags',c.keywords,'languages',coalesce(packet->'manifest'->'languages','[]'),'admittedAt',c.admitted_at,'lane',c.lane,'completed',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND status='completed'),'initialHistory',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND slot<=2),'active',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted')),'progression',(SELECT jsonb_build_object('state',pr.state,'n',pr.n,'sumQuarterPoints',pr.sum_quarter_points,'rangeQuarterPoints',pr.max_quarter_points-pr.min_quarter_points,'threshold',pr.threshold,'activeInitial',pr.active_initial,'activeExpansion',pr.active_expansion,'reasons',pr.reasons,'run',pr.last_decision) FROM app.evaluation_progression pr WHERE pr.case_id=c.id),'nextSlot',(SELECT next_slot FROM app.evaluation_progression WHERE case_id=c.id),'expansionActive',EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id AND slot>2 AND status IN ('offered','accepted')),'expansionReady',coalesce(prereq.expansion_ready,false),'files',coalesce(packet->'files','[]'),'reviewers',reviewers,'represented',(SELECT coalesce(jsonb_agg(DISTINCT institution_id),'[]') FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted','completed'))));
 END LOOP;
 RETURN jsonb_build_object('policy',(SELECT to_jsonb(p) FROM app.evaluation_policies p WHERE code='EVAL_POLICY_V1'),'revision',cur.revision,'cursor',jsonb_build_object('lane',cur.lane,'domains',cur.domains,'universities',cur.universities),'cases',cases,'now',app.governance_now());
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.allocation_commit(run uuid,expected bigint,inputs jsonb,outputs jsonb,reviewer uuid DEFAULT NULL,packet uuid DEFAULT NULL,slot_value integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
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
  IF slot_value<=2 THEN IF EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id AND slot=slot_value AND status IN ('offered','accepted','completed')) OR (SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND slot<=2 AND status IN ('offered','accepted'))>=2 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='INITIAL_PAIR_RESERVED';END IF;
  ELSE IF NOT coalesce(pr.expansion_ready,false) OR (SELECT count(*) FROM app.external_assessments WHERE case_id=c.id)<2 OR EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='EXPANSION_NOT_READY';END IF;END IF;
 END IF;
 PERFORM app.external_policy_register(run,'scheduler-v1');
 IF reviewer IS NOT NULL THEN result:=app.external_offer(reviewer,packet,run,slot_value,run,true);outputs:=outputs||jsonb_build_object('offer',result);IF slot_value>2 THEN UPDATE app.evaluation_allocation_prerequisites SET expansion_ready=false WHERE case_id=c.id;END IF;END IF;
 INSERT INTO app.evaluation_policy_runs(id,policy_code,config_hash,inputs,outputs,executed_at,input_hash) SELECT run,'EVAL_POLICY_V1',config_hash,inputs,outputs,app.governance_now(),encode(sha256(convert_to(inputs::text,'UTF8')),'hex') FROM app.evaluation_policies WHERE code='EVAL_POLICY_V1';
 PERFORM app.progression_tick();
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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.allocation_view(who uuid,sid uuid,run_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE a app.users;cases jsonb;r jsonb;
BEGIN
 a:=app.partner_access_principal(who,sid);IF a.role_code NOT IN ('platform_admin','university_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='GOVERNANCE_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'case'),'[]') INTO cases FROM (SELECT jsonb_build_object('case',c.id,'project',c.project_id,'version',c.version_id,'title',v.title,'university',c.university_id,'progression',(SELECT jsonb_build_object('n',pr.n,'mean',CASE WHEN pr.n>0 THEN jsonb_build_object('numerator',pr.sum_quarter_points,'denominator',4*pr.n) ELSE NULL END,'range', (pr.max_quarter_points-pr.min_quarter_points)::numeric/4,'threshold',pr.threshold,'activeInitial',pr.active_initial,'activeExpansion',pr.active_expansion,'reasons',pr.reasons,'run',pr.last_decision) FROM app.evaluation_progression pr WHERE pr.case_id=c.id),'state',c.workflow_state,'lane',ad.lane,'eligible',ad.eligible,'admittedAt',ad.admitted_at,'waitingSince',ad.waiting_since,'reasons',ad.reasons,'run',ad.last_run,'coverage',(SELECT count(*) FROM app.external_assessments WHERE case_id=c.id),'active',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted')),'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('assignment',t.id,'reviewer',t.reviewer_id,'institution',t.institution_id,'status',t.status,'slot',t.slot,'offeredAt',t.offered_at,'policyRun',t.policy_run_id,'policySnapshot',EXISTS(SELECT 1 FROM app.evaluation_policy_runs er WHERE er.id=t.policy_run_id)) ORDER BY t.offered_at),'[]') FROM app.external_review_assignments t WHERE case_id=c.id)) value FROM app.evaluation_cases c JOIN app.project_versions v ON v.id=c.version_id LEFT JOIN app.evaluation_case_admissions ad ON ad.case_id=c.id WHERE a.role_code='platform_admin' OR c.university_id=a.university_id ORDER BY c.created_at DESC,c.id LIMIT 100) q;
 IF run_id IS NOT NULL THEN SELECT jsonb_build_object('id',p.id,'policy',p.policy_code,'hash',p.config_hash,'executedAt',p.executed_at,'inputs',p.inputs,'outputs',p.outputs) INTO r FROM app.evaluation_policy_runs p WHERE p.id=run_id AND (a.role_code='platform_admin' OR EXISTS(SELECT 1 FROM app.evaluation_case_admissions ad JOIN app.evaluation_cases c ON c.id=ad.case_id WHERE ad.last_run=p.id AND c.university_id=a.university_id) OR EXISTS(SELECT 1 FROM app.external_review_assignments t JOIN app.evaluation_cases c ON c.id=t.case_id WHERE t.policy_run_id=p.id AND c.university_id=a.university_id));IF r IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;IF a.role_code<>'platform_admin' THEN r:=r-'inputs'-'outputs';END IF;END IF;
 RETURN jsonb_build_object('policy','EVAL_POLICY_V1','cases',cases,'run',r,'cursor',CASE WHEN a.role_code='platform_admin' THEN (SELECT jsonb_build_object('revision',revision,'lane',lane,'domains',domains,'universities',universities) FROM app.evaluation_allocation_cursor WHERE policy_code='EVAL_POLICY_V1') ELSE NULL END);
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.external_live(who uuid,sid uuid,aid uuid,required_status text DEFAULT NULL) RETURNS app.external_review_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;t app.external_review_assignments;f jsonb;
BEGIN
 a:=app.partner_access_principal(who,sid);PERFORM 1 FROM app.projects p JOIN app.evaluation_cases c ON c.project_id=p.id JOIN app.external_review_assignments x ON x.case_id=c.id WHERE x.id=aid AND x.reviewer_id=who FOR UPDATE OF p;SELECT * INTO t FROM app.external_review_assignments WHERE id=aid AND reviewer_id=who FOR UPDATE;
 IF t.id IS NULL OR a.role_code<>'faculty_supervisor' THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF required_status IS NOT NULL THEN
 IF t.status<>required_status OR required_status='offered' AND app.governance_now()>=t.offer_expires_at OR required_status='accepted' AND app.governance_now()>=t.due_at THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='TASK_CLOSED';END IF;
 f:=app.external_candidate(who,t.packet_id,false);IF required_status='accepted' AND f->'committeeNameMatch'='true' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMITTEE_VERIFICATION_HOLD';END IF;IF f->>'institution'<>t.institution_id::text THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INSTITUTION_CHANGED';END IF;
 PERFORM app.external_packet(t.packet_id);
 END IF;
 RETURN t;
END $$;
--> statement-breakpoint
ALTER FUNCTION app.external_offer(uuid,uuid,uuid,integer,uuid,boolean) RENAME TO external_offer_before_progression;
CREATE FUNCTION app.external_offer(reviewer uuid,packet uuid,run uuid,slot_value integer,cid uuid,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c uuid;n integer;p app.evaluation_progression;technical boolean;result jsonb;case_record app.evaluation_cases;ev uuid;
BEGIN
 SELECT case_id INTO c FROM app.academic_review_packets WHERE id=packet;
 IF NOT EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c AND reviewer_id=reviewer AND packet_id=packet AND policy_run_id=run AND slot=slot_value) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(reviewer::text,29));PERFORM 1 FROM app.projects pr JOIN app.evaluation_cases ec ON ec.project_id=pr.id WHERE ec.id=c FOR UPDATE OF pr;PERFORM 1 FROM app.evaluation_cases WHERE id=c FOR UPDATE;
  SELECT count(*) INTO n FROM app.external_assessments WHERE case_id=c;
  IF n>=10 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMPLETED_LIMIT';END IF;
  IF slot_value<=2 AND ((SELECT count(*) FROM app.external_review_assignments WHERE case_id=c AND slot<=2 AND status IN ('offered','accepted'))>=2 OR EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c AND slot=slot_value AND status IN ('offered','accepted','completed'))) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='SLOT_OCCUPIED';END IF;
  IF slot_value>2 THEN
   technical:=left(current_database(),14)='capstone_test_' AND EXISTS(SELECT 1 FROM app.external_policy_runs WHERE id=run AND kind='technical-fixture-v1');
   SELECT * INTO p FROM app.evaluation_progression WHERE case_id=c;
   IF EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c AND slot>2 AND status IN ('offered','accepted')) OR NOT technical AND (p.case_id IS NULL OR p.n NOT BETWEEN 2 AND 9 OR p.quality_paused OR p.next_slot IS DISTINCT FROM slot_value OR p.state<>'queued_expansion' OR p.sum_quarter_points<p.n*p.threshold*4 OR p.min_quarter_points<280 OR p.max_quarter_points-p.min_quarter_points>80) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='EXPANSION_NOT_QUALIFIED';END IF;
  END IF;
 END IF;
 result:=app.external_offer_before_progression(reviewer,packet,run,slot_value,cid,commit_value);
 IF commit_value AND result->'replayed' IS DISTINCT FROM 'true'::jsonb AND EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c AND slot=slot_value AND status IN ('declined','expired','withdrawn','cancelled')) THEN
 SELECT * INTO case_record FROM app.evaluation_cases WHERE id=c;ev:=gen_random_uuid();INSERT INTO app.audit_logs(id,actor_kind,action,object_type,object_id,project_id,version_id,university_id,correlation_id,event_key,after_state,occurred_at) VALUES(ev,'system','system.progression.reassign','external_assignment',(result->>'assignment')::uuid,case_record.project_id,case_record.version_id,case_record.university_id,cid,ev,jsonb_build_object('scope',jsonb_build_object('case',c,'slot',slot_value,'run',run,'reason','incomplete_slot_reassigned')::text),app.governance_now());INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.external_offer_before_progression(uuid,uuid,uuid,integer,uuid,boolean),app.external_offer(uuid,uuid,uuid,integer,uuid,boolean) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_offer(uuid,uuid,uuid,integer,uuid,boolean) TO capstone_jobs;
