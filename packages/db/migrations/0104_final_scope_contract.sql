-- Complete frozen-round lead consent before publication and retain authentic scoped receipts.
CREATE FUNCTION app.committee_final_case() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 INSERT INTO app.evaluation_cases(university_id,project_id,version_id,submission_id,rubric_code) SELECT university_id,project_id,version_id,id,'CORE_V1' FROM app.project_submissions WHERE id=NEW.submission_id ON CONFLICT(submission_id) DO NOTHING;RETURN NEW;
END $$;
CREATE TRIGGER committee_final_case AFTER INSERT ON app.academic_finals FOR EACH ROW EXECUTE FUNCTION app.committee_final_case();
CREATE FUNCTION app.pending_final_manifest(cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.evaluation_cases;entries jsonb;BEGIN
 SELECT * INTO c FROM app.evaluation_cases WHERE id=cid;
 IF c.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=c.submission_id) OR NOT EXISTS(SELECT 1 FROM app.projects p JOIN app.project_versions v ON v.id=p.current_version_id WHERE p.id=c.project_id AND v.id=c.version_id AND v.status='pending_review') OR c.submission_id IS DISTINCT FROM (SELECT id FROM app.project_submissions WHERE version_id=c.version_id ORDER BY round_number DESC LIMIT 1) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FINAL_UNAVAILABLE';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',file_id,'path',relative_path,'sha256',sha256_at_submit,'size',size_at_submit,'mime',mime_at_submit) ORDER BY relative_path COLLATE "C",file_id) INTO entries FROM app.submission_files WHERE submission_id=c.submission_id;
 IF entries IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='EVIDENCE_REQUIRED';END IF;
 RETURN jsonb_build_object('schema','FULL_FINAL_ARTIFACTS_V2','case',c.id,'project',c.project_id,'version',c.version_id,'submission',c.submission_id,'entries',entries,'languages',(SELECT CASE WHEN title||abstract ~ '[ء-ي]' THEN '["ar","en"]'::jsonb ELSE '["en"]'::jsonb END FROM app.project_versions WHERE id=c.version_id));
END $$;
ALTER FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid) RENAME TO full_final_packet_state_archived;
CREATE FUNCTION app.full_final_packet_state(who uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;c app.evaluation_cases;w app.academic_packet_workspaces;m jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.project_versions WHERE id=vid AND project_id=pid AND status='pending_review') THEN RETURN app.full_final_packet_state_archived(who,sid,pid,vid);END IF;
 SELECT * INTO c FROM app.evaluation_cases WHERE project_id=pid AND version_id=vid ORDER BY created_at DESC LIMIT 1;
 p:=app.submission_actor(who,sid,c.submission_id);m:=app.pending_final_manifest(c.id);SELECT * INTO w FROM app.academic_packet_workspaces WHERE case_id=c.id;
 RETURN jsonb_build_object('schema','FULL_FINAL_ARTIFACTS_V2','project',pid,'version',vid,'submission',c.submission_id,'case',c.id,'revision',coalesce(w.revision,0),'manifestHash',app.packet_hash(m),'files',m->'entries','languages',m->'languages','current',w.current_packet_id,'authorized',EXISTS(SELECT 1 FROM app.full_final_packet_consents WHERE packet_id=w.current_packet_id) AND NOT EXISTS(SELECT 1 FROM app.academic_packet_revocations WHERE packet_id=w.current_packet_id),'canAuthorize',EXISTS(SELECT 1 FROM app.project_authors a JOIN app.users u ON u.id=a.user_id WHERE a.project_id=pid AND a.user_id=who AND a.is_team_lead AND u.role_code='student' AND u.account_status='active'));
END $$;
ALTER FUNCTION app.full_final_packet_authorize(uuid,uuid,uuid,uuid,integer,text,boolean,uuid,boolean) RENAME TO full_final_packet_authorize_archived;
CREATE FUNCTION app.full_final_packet_authorize(who uuid,sid uuid,pid uuid,vid uuid,expected integer,expected_hash text,ack boolean,cid uuid,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;c app.evaluation_cases;state jsonb;m jsonb;files jsonb;packet uuid:=gen_random_uuid();digest text;r app.command_receipts;ev uuid;result jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.project_versions WHERE id=vid AND project_id=pid AND status='pending_review') THEN RETURN app.full_final_packet_authorize_archived(who,sid,pid,vid,expected,expected_hash,ack,cid,commit_value);END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid FOR UPDATE;
 SELECT * INTO c FROM app.evaluation_cases WHERE project_id=pid AND version_id=vid ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 PERFORM app.submission_actor(who,sid,c.submission_id);
 IF (app.assignment_principal(who,sid)).role_code<>'student' OR NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=who AND is_team_lead) OR ack IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='EXPLICIT_LEAD_ONLY';END IF;
 digest:=app.packet_hash(jsonb_build_array(pid,vid,expected,expected_hash,ack));SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=cid;
 IF r.command_id IS NOT NULL THEN IF r.action<>'academic-packet.authorize-final' OR r.payload_digest<>digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result);END IF;
 state:=app.full_final_packet_state(who,sid,pid,vid);
 IF state->'authorized'='true'::jsonb OR expected IS NULL OR expected<>(state->>'revision')::integer OR expected_hash IS DISTINCT FROM state->>'manifestHash' OR cid IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 m:=app.pending_final_manifest(c.id);
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',sf.size_at_submit,'sha256',sf.sha256_at_submit) ORDER BY sf.file_id) INTO files FROM app.submission_files sf JOIN app.storage_objects o ON o.id=sf.storage_object_id AND o.project_id=sf.project_id AND o.university_id=sf.university_id WHERE sf.submission_id=c.submission_id;
 IF NOT commit_value THEN RETURN jsonb_build_object('manifest',m,'files',files);END IF;
 INSERT INTO app.academic_review_packets(id,university_id,project_id,version_id,submission_id,case_id,manifest,manifest_hash,authorized_by,authorized_at,supersedes_packet_id) VALUES(packet,c.university_id,pid,vid,c.submission_id,c.id,m,expected_hash,who,app.governance_now(),(state->>'current')::uuid);
 INSERT INTO app.full_final_packet_consents VALUES(packet,who,app.governance_now(),'SCORE_FREE_V1');
 INSERT INTO app.academic_packet_workspaces(case_id,revision,draft,draft_hash,current_packet_id,updated_by,updated_at) VALUES(c.id,expected+1,m,expected_hash,packet,who,app.governance_now()) ON CONFLICT(case_id) DO UPDATE SET revision=expected+1,draft=m,draft_hash=expected_hash,current_packet_id=packet,updated_by=who,updated_at=app.governance_now();
 ev:=app.packet_event(app.partner_access_principal(who,sid),c,packet,'authorize-final',cid,'awaiting-lead','authorized',expected_hash,jsonb_array_length(m->'entries'));
 result:=jsonb_build_object('scope',packet,'row_version',expected+1);INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'academic-packet.authorize-final',digest,ev,result);RETURN jsonb_build_object('completed',result);
END $$;
--> statement-breakpoint
-- Revocation is append-only in academic_packet_revocations, not a mutable packet column.
DO $$ DECLARE d text;BEGIN d:=pg_get_functiondef('app.first_pair_reasons(uuid)'::regprocedure);d:=replace(d,'ap.revoked_at IS NULL','NOT EXISTS(SELECT 1 FROM app.academic_packet_revocations rev WHERE rev.packet_id=ap.id)');EXECUTE d;END $$;
CREATE TRIGGER wake_packet_revoked AFTER INSERT ON app.academic_packet_revocations FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
-- A submitted member may read their own receipt after publication; file_scope still closes bytes on submission.
DO $$ DECLARE d text;BEGIN d:=pg_get_functiondef('app.committee_live_invite(uuid)'::regprocedure);d:=replace(d,'OR p.current_version_id<>c.version_id','OR (i.submitted_at IS NULL AND p.current_version_id<>c.version_id)');d:=replace(d,'AND status=''pending_review''','AND (status=''pending_review'' OR i.submitted_at IS NOT NULL)');EXECUTE d;END $$;
ALTER FUNCTION app.evaluation_read(uuid,uuid,uuid) RENAME TO evaluation_read_before_guest_contract;
CREATE FUNCTION app.evaluation_read(reader uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN RETURN app.evaluation_read_before_guest_contract(reader,sid,sub)||jsonb_build_object('committeeWorkflow',EXISTS(SELECT 1 FROM app.committee_rounds WHERE submission_id=sub));END $$;
ALTER FUNCTION app.academic_round_read(uuid,uuid,uuid) RENAME TO academic_round_read_before_guest_contract;
CREATE FUNCTION app.academic_round_read(who uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN RETURN app.academic_round_read_before_guest_contract(who,sid,sub)||jsonb_build_object('committeeWorkflow',EXISTS(SELECT 1 FROM app.committee_rounds WHERE submission_id=sub));END $$;
CREATE OR REPLACE FUNCTION app.academic_evaluation_prepare(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,payload jsonb,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 PERFORM app.evaluation_actor(who,sid,sub,false);
 IF payload->>'layer'='committee' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INDIVIDUAL_GUEST_ASSESSMENTS_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.academic_final_admissions WHERE submission_id=sub AND outcome='accepted') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='SCREENING_ACCEPTANCE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM app.committee_rounds WHERE submission_id=sub) THEN PERFORM app.committee_validate(sub,payload-ARRAY['layer','members','assessedOn','attestation'],true);END IF;
 RETURN app.academic_evaluation_prepare_r06(who,sid,sub,expected,assignment_expected,payload,command,digest);
END $$;
CREATE OR REPLACE FUNCTION app.academic_draft_save(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,draft_expected integer,payload jsonb,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 PERFORM app.evaluation_actor(who,sid,sub,false);
 IF payload->>'layer'='committee' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INDIVIDUAL_GUEST_ASSESSMENTS_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.academic_final_admissions WHERE submission_id=sub AND outcome='accepted') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='SCREENING_ACCEPTANCE_REQUIRED';END IF;
 RETURN app.academic_draft_save_r06(who,sid,sub,expected,assignment_expected,draft_expected,payload,command,digest);
END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('committee_final_case','pending_final_manifest','full_final_packet_state_archived','full_final_packet_authorize_archived','evaluation_read_before_guest_contract','academic_round_read_before_guest_contract') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,capstone_runtime,capstone_jobs',f.sig);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid),app.full_final_packet_authorize(uuid,uuid,uuid,uuid,integer,text,boolean,uuid,boolean),app.evaluation_read(uuid,uuid,uuid),app.academic_round_read(uuid,uuid,uuid) TO capstone_runtime;
