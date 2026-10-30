-- New immutable policy. EVAL_POLICY_V1 rows and recorded runs retain their original semantics.
ALTER TABLE app.evaluation_policies DROP CONSTRAINT evaluation_policies_code_check;
ALTER TABLE app.evaluation_policies ADD CHECK(code IN ('EVAL_POLICY_V1','EVAL_POLICY_V2'));
INSERT INTO app.evaluation_policies SELECT 'EVAL_POLICY_V2',j,encode(sha256(convert_to(j::text,'UTF8')),'hex') FROM (SELECT '{"code":"EVAL_POLICY_V2","schemaVersion":2,"initial":"committed-event-first-pair","internalFloor":70,"committeeFloor":65,"eachMemberC3C4Floor":2,"capacity":2,"offerDays":7,"taskDays":14,"maxReviewers":10,"targetSeconds":60,"scarcity":"persist-and-retry-on-capacity-event","caseOrder":["half-pair","oldest-wait","stable-case-id"],"reviewerOrder":["institution-diversity","exact-tag-overlap","workload","oldest-assignment","user-id"],"expansion":"unchanged-progressive-thresholds"}'::jsonb j) x;
ALTER TABLE app.external_policy_runs DROP CONSTRAINT external_policy_runs_kind_check;
ALTER TABLE app.external_policy_runs ADD CHECK(kind IN ('technical-fixture-v1','scheduler-v1','event-first-pair-v2'));
CREATE TABLE app.evaluation_wake_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),handled_at timestamptz);
CREATE INDEX evaluation_wake_pending ON app.evaluation_wake_events(created_at) WHERE handled_at IS NULL;
CREATE TABLE app.evaluation_pair_status(case_id uuid PRIMARY KEY REFERENCES app.evaluation_cases(id),eligible_at timestamptz,checked_at timestamptz NOT NULL,reasons jsonb NOT NULL,offered integer NOT NULL,waiting integer NOT NULL,last_run uuid NOT NULL);
CREATE TABLE app.evaluation_v2_runs(id uuid PRIMARY KEY,policy_code text NOT NULL REFERENCES app.evaluation_policies(code),config_hash text NOT NULL,triggered_at timestamptz NOT NULL,executed_at timestamptz NOT NULL,inputs jsonb NOT NULL,outputs jsonb NOT NULL,FOREIGN KEY(policy_code,config_hash) REFERENCES app.evaluation_policies(code,config_hash));
CREATE TRIGGER immutable_v2_run BEFORE UPDATE OR DELETE ON app.evaluation_v2_runs FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.evaluation_wake_events,app.evaluation_pair_status,app.evaluation_v2_runs FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.evaluation_wake() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 INSERT INTO app.evaluation_wake_events(kind) VALUES(TG_TABLE_NAME||'.'||TG_OP);PERFORM pg_notify('capstone_evaluation_eligible','changed');RETURN NULL;
END $$;
CREATE TRIGGER wake_publication AFTER UPDATE OF published_version_id ON app.projects FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_packet AFTER INSERT ON app.full_final_packet_consents FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_packet_revocation AFTER UPDATE ON app.academic_review_packets FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_profile AFTER INSERT OR UPDATE ON app.reviewer_profiles FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_task AFTER INSERT OR UPDATE ON app.external_review_assignments FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_holds AFTER INSERT OR UPDATE ON app.evaluation_holds FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_relations AFTER INSERT OR UPDATE ON app.evaluation_reviewer_relations FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_accounts AFTER UPDATE OF account_status ON app.users FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE FUNCTION app.committee_result_refresh() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 PERFORM app.governance_refresh(NEW.case_id);INSERT INTO app.evaluation_wake_events(kind) VALUES('committee.result');RETURN NEW;
END $$;
CREATE TRIGGER committee_refresh AFTER INSERT ON app.committee_results FOR EACH ROW EXECUTE FUNCTION app.committee_result_refresh();
--> statement-breakpoint
ALTER FUNCTION app.external_candidate(uuid,uuid,boolean) RENAME TO external_candidate_before_committee_guest;
CREATE FUNCTION app.external_candidate(reviewer uuid,packet uuid,new_offer boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE f jsonb;cid uuid;BEGIN
 SELECT case_id INTO cid FROM app.academic_review_packets WHERE id=packet;
 IF EXISTS(SELECT 1 FROM app.committee_invitations i JOIN app.users u ON lower(u.email)=i.email WHERE i.case_id=cid AND u.id=reviewer) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMITTEE_IDENTITY_CONFLICT';END IF;
 f:=app.external_candidate_before_committee_guest(reviewer,packet,new_offer);RETURN f;
END $$;
CREATE FUNCTION app.first_pair_reasons(cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.evaluation_cases;s app.effective_internal_assessments;cm app.effective_internal_assessments;p app.projects;v app.project_versions;why text[]:='{}';packet uuid;BEGIN
 SELECT * INTO c FROM app.evaluation_cases WHERE id=cid;SELECT * INTO p FROM app.projects WHERE id=c.project_id;SELECT * INTO v FROM app.project_versions WHERE id=c.version_id;
 SELECT * INTO s FROM app.effective_internal_assessments WHERE case_id=cid AND layer='supervisor';SELECT * INTO cm FROM app.effective_internal_assessments WHERE case_id=cid AND layer='committee';
 IF p.published_version_id IS DISTINCT FROM c.version_id OR v.status IS DISTINCT FROM 'archived' OR v.approved_submission_id IS DISTINCT FROM c.submission_id THEN why:=array_append(why,'not_current_published');END IF;
 IF s.id IS NULL OR cm.id IS NULL THEN why:=array_append(why,'incomplete_internal');
 ELSE
  IF 2*s.quarter_points+3*cm.quarter_points<1400 THEN why:=array_append(why,'internal_floor');END IF;
  IF cm.quarter_points<260 THEN why:=array_append(why,'committee_floor');END IF;
  IF EXISTS(SELECT 1 FROM app.effective_internal_criterion_scores WHERE assessment_id IN (s.id,cm.id) AND code IN ('C3','C4') AND level<2) OR EXISTS(SELECT 1 FROM app.current_committee_members a JOIN app.committee_invitations i ON i.id=a.invite_id AND i.revoked_at IS NULL CROSS JOIN LATERAL jsonb_array_elements(a.payload->'criteria') cr WHERE a.case_id=cid AND cr->>'code' IN ('C3','C4') AND (cr->>'level')::integer<2) THEN why:=array_append(why,'individual_criterion_floor');END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM app.evaluation_holds WHERE case_id=cid AND state='open') OR coalesce((SELECT hold FROM app.evaluation_allocation_prerequisites WHERE case_id=cid),false) THEN why:=array_append(why,'governance_hold');END IF;
 IF EXISTS(SELECT 1 FROM app.effective_internal_disagreements WHERE case_id=cid) AND NOT EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id) THEN why:=array_append(why,'discrepancy_explanation_required');END IF;
 SELECT current_packet_id INTO packet FROM app.academic_packet_workspaces WHERE case_id=cid;
 IF packet IS NULL OR NOT EXISTS(SELECT 1 FROM app.academic_review_packets ap JOIN app.full_final_packet_consents co ON co.packet_id=ap.id WHERE ap.id=packet AND ap.revoked_at IS NULL AND ap.submission_id=c.submission_id) THEN why:=array_append(why,'lead_packet_required');END IF;
 RETURN to_jsonb(why);
END $$;
CREATE FUNCTION app.first_pair_snapshot(force_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE snap jsonb;cases jsonb;cutoff timestamptz;BEGIN
 PERFORM pg_advisory_xact_lock(4630);
 IF NOT force_value AND NOT EXISTS(SELECT 1 FROM app.evaluation_wake_events WHERE handled_at IS NULL) THEN RETURN NULL;END IF;
 cutoff:=clock_timestamp();snap:=app.allocation_snapshot();
 SELECT coalesce(jsonb_agg(x||jsonb_build_object('gateReasons',app.first_pair_reasons((x->>'id')::uuid),'eventEligibleAt',(SELECT eligible_at FROM app.evaluation_pair_status WHERE case_id=(x->>'id')::uuid),
 'reviewers',(SELECT coalesce(jsonb_agg(r||jsonb_build_object('committeeConflict',coalesce((r->>'committeeConflict')::boolean,false) OR EXISTS(SELECT 1 FROM app.committee_invitations i JOIN app.users u ON lower(u.email)=i.email WHERE i.case_id=(x->>'id')::uuid AND u.id=(r->>'id')::uuid))),'[]') FROM jsonb_array_elements(x->'reviewers') r))),'[]') INTO cases FROM jsonb_array_elements(snap->'cases') x;
 RETURN snap||jsonb_build_object('cases',cases,'cutoff',cutoff,'eventAt',(SELECT min(created_at) FROM app.evaluation_wake_events WHERE handled_at IS NULL),'policyV2',(SELECT to_jsonb(p) FROM app.evaluation_policies p WHERE code='EVAL_POLICY_V2'));
END $$;
CREATE FUNCTION app.first_pair_offer(run uuid,reviewer uuid,packet uuid,slot_value integer,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE cid uuid;BEGIN
 PERFORM pg_advisory_xact_lock(4630);SELECT case_id INTO cid FROM app.academic_review_packets WHERE id=packet;
 IF jsonb_array_length(app.first_pair_reasons(cid))<>0 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ELIGIBILITY_CHANGED';END IF;
 INSERT INTO app.external_policy_runs(id,kind) VALUES(run,'event-first-pair-v2') ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM app.external_policy_runs WHERE id=run AND kind='event-first-pair-v2') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='POLICY_RUN_CONFLICT';END IF;
 RETURN app.external_offer(reviewer,packet,run,slot_value,run,commit_value);
END $$;
CREATE FUNCTION app.first_pair_finish(run uuid,cutoff timestamptz,inputs jsonb,outputs jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE x jsonb;c app.evaluation_cases;ev uuid;BEGIN
 PERFORM pg_advisory_xact_lock(4630);
 INSERT INTO app.evaluation_v2_runs SELECT run,code,config_hash,coalesce((inputs->>'eventAt')::timestamptz,cutoff),clock_timestamp(),inputs,outputs FROM app.evaluation_policies WHERE code='EVAL_POLICY_V2';
 FOR x IN SELECT value FROM jsonb_array_elements(outputs->'cases') LOOP
  SELECT * INTO c FROM app.evaluation_cases WHERE id=(x->>'case')::uuid;
  INSERT INTO app.evaluation_pair_status VALUES(c.id,CASE WHEN x->'gateReasons'='[]'::jsonb THEN clock_timestamp() END,clock_timestamp(),x->'reasons',(x->>'offered')::integer,(x->>'waiting')::integer,run) ON CONFLICT(case_id) DO UPDATE SET eligible_at=coalesce(app.evaluation_pair_status.eligible_at,EXCLUDED.eligible_at),checked_at=EXCLUDED.checked_at,reasons=EXCLUDED.reasons,offered=EXCLUDED.offered,waiting=EXCLUDED.waiting,last_run=run;
  IF x->'gateReasons'='[]'::jsonb THEN UPDATE app.evaluation_cases SET workflow_state=CASE WHEN (x->>'offered')::integer>0 THEN 'reviewing_initial' ELSE 'queued_initial' END WHERE id=c.id AND workflow_state NOT IN ('paused_quality','completed_limit','reviewing_expansion','queued_expansion');END IF;
 END LOOP;
 UPDATE app.evaluation_wake_events SET handled_at=clock_timestamp() WHERE handled_at IS NULL AND created_at<=cutoff;
 ev:=gen_random_uuid();INSERT INTO app.audit_logs(id,actor_kind,action,object_type,object_id,correlation_id,event_key,after_state) VALUES(ev,'system','system.evaluation.event_pair','evaluation_policy_run',run,run,ev,jsonb_build_object('scope',jsonb_build_object('policy','EVAL_POLICY_V2','run',run)::text));INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');RETURN outputs;
END $$;
INSERT INTO app.evaluation_wake_events(kind) VALUES('policy_v2.installed');
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND (p.proname LIKE 'first_pair_%' OR p.proname IN ('evaluation_wake','committee_result_refresh','external_candidate_before_committee_guest')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,capstone_runtime,capstone_jobs',f.sig);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION app.first_pair_snapshot(boolean),app.first_pair_offer(uuid,uuid,uuid,integer,boolean),app.first_pair_finish(uuid,timestamptz,jsonb,jsonb) TO capstone_jobs;
