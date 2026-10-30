-- Owner cross-workspace correction: one project, requested FINAL, quality screening, then assessment.
-- Existing immutable finals/assessments/objects remain unchanged. No local data reset.
CREATE TABLE app.academic_completion_requests(
 id uuid PRIMARY KEY,university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,
 supervisor_id uuid NOT NULL,assignment_revision integer NOT NULL,note text NOT NULL CHECK(char_length(note)<=500),
 actor_name text NOT NULL,requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(university_id,project_id,version_id,id),
 FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id),
 FOREIGN KEY(university_id,supervisor_id) REFERENCES app.users(university_id,id)
);
CREATE TABLE app.academic_final_requests(
 submission_id uuid PRIMARY KEY,university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,request_id uuid NOT NULL,
 FOREIGN KEY(university_id,project_id,version_id,request_id) REFERENCES app.academic_completion_requests(university_id,project_id,version_id,id),
 FOREIGN KEY(university_id,project_id,version_id,submission_id) REFERENCES app.project_submissions(university_id,project_id,version_id,id)
);
CREATE TABLE app.academic_final_admissions(
 submission_id uuid PRIMARY KEY,university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('accepted','returned')),reason text NOT NULL CHECK(char_length(reason)<=2000),
 actor_id uuid NOT NULL,actor_name text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(university_id,project_id,version_id,submission_id) REFERENCES app.project_submissions(university_id,project_id,version_id,id),
 FOREIGN KEY(university_id,actor_id) REFERENCES app.users(university_id,id)
);
CREATE TABLE app.academic_screen_commands(
 actor_id uuid NOT NULL,command_id uuid NOT NULL,submission_id uuid NOT NULL REFERENCES app.project_submissions(id),
 outcome text NOT NULL CHECK(outcome IN ('accepted','returned')),reason text NOT NULL,payload_digest text NOT NULL,
 PRIMARY KEY(actor_id,command_id)
);
CREATE TRIGGER immutable_completion_request BEFORE UPDATE OR DELETE ON app.academic_completion_requests FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_final_request BEFORE UPDATE OR DELETE ON app.academic_final_requests FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_final_admission BEFORE UPDATE OR DELETE ON app.academic_final_admissions FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_screen_command BEFORE UPDATE OR DELETE ON app.academic_screen_commands FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.academic_completion_requests,app.academic_final_requests,app.academic_final_admissions,app.academic_screen_commands FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
INSERT INTO app.academic_finals(submission_id,university_id,project_id,version_id,number,manifest_digest)
 SELECT s.id,s.university_id,s.project_id,s.version_id,(SELECT count(*) FROM app.project_submissions previous WHERE previous.version_id=s.version_id AND previous.purpose='FINAL' AND previous.round_number<=s.round_number),app.semester_manifest(s.project_id,s.version_id)
 FROM app.project_submissions s JOIN app.projects p ON p.id=s.project_id AND p.current_version_id=s.version_id JOIN app.project_versions v ON v.id=s.version_id
 WHERE s.purpose='FINAL' AND v.status='pending_review' AND NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=s.id);
--> statement-breakpoint
CREATE FUNCTION app.academic_flow_principal(who uuid,sid uuid,pid uuid) RETURNS app.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;p app.projects;BEGIN
 a:=app.assignment_principal(who,sid);SELECT * INTO p FROM app.projects WHERE id=pid;
 IF p.id IS NULL OR p.university_id IS DISTINCT FROM a.university_id OR NOT (a.role_code='university_admin' OR a.role_code='faculty_supervisor' AND p.supervisor_id=who OR a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=who)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PROJECT_UNAVAILABLE';END IF;RETURN p;
END $$;
CREATE FUNCTION app.academic_current_request(pid uuid,vid uuid) RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT q.id FROM app.academic_completion_requests q JOIN app.projects p ON p.id=q.project_id JOIN app.users u ON u.id=p.supervisor_id
 WHERE q.project_id=pid AND q.version_id=vid AND q.supervisor_id=p.supervisor_id AND q.assignment_revision=p.row_version AND u.account_status='active' ORDER BY q.requested_at DESC,q.id DESC LIMIT 1;
$$;
CREATE FUNCTION app.academic_flow_state(who uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;a app.users;v app.project_versions;req uuid;sub uuid;q app.academic_completion_requests;ad app.academic_final_admissions;decision text;stage text;BEGIN
 p:=app.academic_flow_principal(who,sid,pid);a:=app.assignment_principal(who,sid);SELECT * INTO v FROM app.project_versions WHERE id=p.current_version_id;
 req:=app.academic_current_request(pid,v.id);SELECT * INTO q FROM app.academic_completion_requests WHERE id=req;
 SELECT s.id INTO sub FROM app.project_submissions s WHERE s.version_id=v.id AND s.purpose='FINAL' ORDER BY s.round_number DESC LIMIT 1;
 SELECT * INTO ad FROM app.academic_final_admissions WHERE submission_id=sub;SELECT r.decision INTO decision FROM app.review_records r WHERE r.submission_id=sub;
 stage:=CASE WHEN v.status IN ('archived','rejected') THEN CASE WHEN v.status='archived' THEN 'published' ELSE 'retained' END
 WHEN sub IS NOT NULL AND v.status='pending_review' THEN CASE WHEN ad.outcome IS DISTINCT FROM 'accepted' THEN 'final_screening' WHEN NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor') THEN 'supervisor_assessment' WHEN NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='committee') THEN 'committee_consensus' ELSE 'faculty_decision' END
 WHEN ad.outcome='returned' OR decision='revision_required' THEN 'returned'
 WHEN req IS NOT NULL THEN 'final_requested' ELSE 'preparing' END;
 RETURN jsonb_build_object('stage',stage,'submission',sub,'requestValid',req IS NOT NULL,'requestRevision',(SELECT count(*)::integer FROM app.academic_completion_requests WHERE project_id=pid AND version_id=v.id),'request',CASE WHEN req IS NULL THEN NULL ELSE jsonb_build_object('id',q.id,'note',q.note,'actor',q.actor_name,'requestedAt',q.requested_at) END,'screening',CASE WHEN ad.submission_id IS NULL THEN NULL ELSE jsonb_build_object('outcome',ad.outcome,'reason',ad.reason,'actor',ad.actor_name,'recordedAt',ad.recorded_at) END,'waitingSince',CASE WHEN stage='final_screening' THEN (SELECT submitted_at FROM app.project_submissions WHERE id=sub) WHEN stage='supervisor_assessment' THEN ad.recorded_at WHEN stage='committee_consensus' THEN (SELECT recorded_at FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor') WHEN stage='faculty_decision' THEN (SELECT recorded_at FROM app.internal_assessments WHERE submission_id=sub AND layer='committee') ELSE NULL END,'canRequest',a.role_code='faculty_supervisor' AND p.supervisor_id=who AND v.status IN ('draft','revision_required') AND req IS NULL,'canScreen',a.role_code='faculty_supervisor' AND p.supervisor_id=who AND v.status='pending_review' AND sub IS NOT NULL AND ad.submission_id IS NULL);
END $$;
CREATE FUNCTION app.academic_flow_record(who uuid,p app.projects,vid uuid,obj uuid,action text,command uuid,digest text,result jsonb,route text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE ev uuid:=gen_random_uuid();BEGIN
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,after_state) VALUES(ev,who,'faculty_supervisor',p.university_id,action,'academic_flow',obj,p.id,vid,command,ev,jsonb_build_object('scope',result::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,user_id,p.university_id,p.id,action,jsonb_build_object('route',route,'message_key',action) FROM app.project_authors WHERE project_id=p.id;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,command,action,digest,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;
CREATE FUNCTION app.academic_request_final(who uuid,sid uuid,pid uuid,vid uuid,assignment_expected integer,request_expected integer,note_value text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;a app.users;v app.project_versions;r app.command_receipts;q uuid:=gen_random_uuid();result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));p:=app.academic_flow_principal(who,sid,pid);a:=app.assignment_principal(who,sid);
 IF a.role_code<>'faculty_supervisor' OR p.supervisor_id<>who THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ASSIGNED_SUPERVISOR_ONLY';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=command;IF r.command_id IS NOT NULL THEN IF r.action<>'academic.final.requested' OR r.payload_digest<>digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN (r.result->>'scope')::jsonb;END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid FOR UPDATE;SELECT * INTO v FROM app.project_versions WHERE id=vid AND project_id=pid FOR UPDATE;
 IF p.current_version_id IS DISTINCT FROM vid OR p.row_version IS DISTINCT FROM assignment_expected OR v.status NOT IN ('draft','revision_required') OR app.academic_current_request(pid,vid) IS NOT NULL OR request_expected IS DISTINCT FROM (SELECT count(*)::integer FROM app.academic_completion_requests WHERE project_id=pid AND version_id=vid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REQUEST_STATE_CHANGED';END IF;
 note_value:=app.evaluation_trim(note_value);IF note_value IS NULL OR char_length(note_value)>500 OR note_value~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f‪-‮⁦-⁩]' OR note_value~*'(password|secret|token|cookie)[[:space:]]*[:=]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_NOTE';END IF;
 INSERT INTO app.academic_completion_requests VALUES(q,p.university_id,pid,vid,who,p.row_version,note_value,a.full_name,clock_timestamp());result:=jsonb_build_object('operation','final.request','project',pid,'request',q,'stage','final_requested','requestRevision',request_expected+1);
 RETURN app.academic_flow_record(who,p,vid,q,'academic.final.requested',command,digest,result,'/projects/'||pid::text);
END $$;
--> statement-breakpoint
CREATE FUNCTION app.academic_new_final_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NEW.purpose='FINAL' AND app.academic_current_request(NEW.project_id,NEW.version_id) IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='FINAL_REQUEST_REQUIRED';END IF;RETURN NEW;
END $$;
CREATE FUNCTION app.academic_new_final_bind() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE req uuid;n integer;BEGIN
 IF NEW.purpose='FINAL' THEN
  req:=app.academic_current_request(NEW.project_id,NEW.version_id);SELECT count(*) INTO n FROM app.project_submissions WHERE version_id=NEW.version_id AND purpose='FINAL';
  INSERT INTO app.academic_final_requests VALUES(NEW.id,NEW.university_id,NEW.project_id,NEW.version_id,req);
  INSERT INTO app.academic_finals(submission_id,university_id,project_id,version_id,number,manifest_digest) VALUES(NEW.id,NEW.university_id,NEW.project_id,NEW.version_id,n,app.semester_manifest(NEW.project_id,NEW.version_id));
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER academic_new_final_guard BEFORE INSERT ON app.project_submissions FOR EACH ROW EXECUTE FUNCTION app.academic_new_final_guard();
CREATE TRIGGER academic_new_final_bind AFTER INSERT ON app.project_submissions FOR EACH ROW EXECUTE FUNCTION app.academic_new_final_bind();
ALTER FUNCTION app.academic_final_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text) RENAME TO academic_final_prepare_r06;
CREATE FUNCTION app.academic_final_prepare(who uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.academic_flow_principal(who,sid,pid);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=command) AND app.academic_current_request(pid,vid) IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='FINAL_REQUEST_REQUIRED';END IF;
 RETURN app.academic_final_prepare_r06(who,sid,pid,vid,expected,assignment_expected,manifest,command,digest);
END $$;
CREATE OR REPLACE FUNCTION app.academic_final_commit(who uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prep jsonb;result jsonb;BEGIN
 prep:=app.academic_final_prepare(who,sid,pid,vid,expected,assignment_expected,manifest,command,digest);IF prep?'completed' THEN RETURN (prep->>'completed')::jsonb;END IF;
 IF prep?'issues' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='FINAL_NOT_READY';END IF;
 result:=app.submission_commit(who,sid,pid,vid,expected,assignment_expected,command,digest);RETURN result;
END $$;
--> statement-breakpoint
ALTER FUNCTION app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) RENAME TO academic_decision_prepare_r06;
CREATE FUNCTION app.academic_decision_prepare(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome text,reason text,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.evaluation_actor(who,sid,sub,false);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=command) THEN
  IF outcome='revision' THEN IF NOT EXISTS(SELECT 1 FROM app.academic_screen_commands sc WHERE sc.actor_id=who AND sc.command_id=command AND sc.submission_id=sub AND sc.outcome='returned' AND sc.payload_digest=digest) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SCREENING_RETURN_REQUIRED';END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM app.academic_final_admissions ad WHERE ad.submission_id=sub AND ad.outcome='accepted') OR NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor') OR NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='committee') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ASSESSMENTS_REQUIRED';END IF;
 END IF;RETURN app.academic_decision_prepare_r06(who,sid,sub,expected,assignment_expected,outcome,reason,manifest,command,digest);
END $$;
CREATE FUNCTION app.academic_screen_prepare(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome_value text,reason_value text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;r app.command_receipts;files jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));p:=app.evaluation_actor(who,sid,sub,false);
 IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) OR outcome_value NOT IN ('accepted','returned') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINAL_REQUIRED';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=command;IF r.command_id IS NOT NULL THEN IF r.payload_digest<>digest OR NOT EXISTS(SELECT 1 FROM app.academic_screen_commands WHERE actor_id=who AND command_id=command AND submission_id=sub AND payload_digest=digest) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',(r.result->>'scope')::jsonb);END IF;
 PERFORM app.evaluation_actor(who,sid,sub,true,expected,assignment_expected);
 IF EXISTS(SELECT 1 FROM app.academic_final_admissions WHERE submission_id=sub) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ALREADY_SCREENED';END IF;
 reason_value:=app.evaluation_trim(reason_value);IF reason_value IS NULL OR char_length(reason_value)>2000 OR outcome_value='returned' AND char_length(reason_value)<3 OR reason_value~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f‪-‮⁦-⁩]' OR reason_value~*'(password|secret|token|cookie)[[:space:]]*[:=]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REASON_REQUIRED';END IF;
 INSERT INTO app.academic_screen_commands VALUES(who,command,sub,outcome_value,reason_value,digest);
 IF outcome_value='returned' THEN
  IF EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='FINALIZED_RESULT_PRESERVED';END IF;
  RETURN app.academic_decision_prepare(who,sid,sub,expected,assignment_expected,'revision',reason_value,app.academic_public_manifest(sub),command,digest);
 END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256) ORDER BY o.id) INTO files FROM app.submission_files f JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=f.project_id AND o.university_id=f.university_id WHERE f.submission_id=sub;
 RETURN jsonb_build_object('files',coalesce(files,'[]'::jsonb));
END $$;
CREATE FUNCTION app.academic_screen_commit(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome_value text,reason_value text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;a app.users;result jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.academic_screen_commands WHERE actor_id=who AND command_id=command AND submission_id=sub AND outcome=outcome_value AND payload_digest=digest) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PREPARE_REQUIRED';END IF;
 p:=app.evaluation_actor(who,sid,sub,true,expected,assignment_expected);SELECT * INTO s FROM app.project_submissions WHERE id=sub;a:=app.assignment_principal(who,sid);
 IF outcome_value='returned' THEN result:=app.academic_decision_commit(who,sid,sub,expected,assignment_expected,'revision',reason_value,app.academic_public_manifest(sub),command,digest);
 ELSE result:=jsonb_build_object('operation','final.screen','submission',sub,'project',p.id,'stage','supervisor_assessment');END IF;
 INSERT INTO app.academic_final_admissions VALUES(sub,p.university_id,p.id,s.version_id,outcome_value,app.evaluation_trim(reason_value),who,a.full_name,clock_timestamp());
 IF outcome_value='accepted' THEN RETURN app.academic_flow_record(who,p,s.version_id,sub,'academic.final.accepted',command,digest,result,'/projects/'||p.id::text);END IF;
 RETURN result;
END $$;
--> statement-breakpoint
ALTER FUNCTION app.academic_draft_save(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text) RENAME TO academic_draft_save_r06;
CREATE FUNCTION app.academic_draft_save(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,draft_expected integer,payload jsonb,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.evaluation_actor(who,sid,sub,false);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=command) AND NOT EXISTS(SELECT 1 FROM app.academic_final_admissions ad WHERE ad.submission_id=sub AND ad.outcome='accepted') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='SCREENING_ACCEPTANCE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'criteria') c WHERE jsonb_array_length(c->'locators')>0) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MANUAL_LOCATORS_RETIRED';END IF;
 RETURN app.academic_draft_save_r06(who,sid,sub,expected,assignment_expected,draft_expected,payload,command,digest);
END $$;
ALTER FUNCTION app.academic_evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text) RENAME TO academic_evaluation_prepare_r06;
CREATE FUNCTION app.academic_evaluation_prepare(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,payload jsonb,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.evaluation_actor(who,sid,sub,false);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=command) AND NOT EXISTS(SELECT 1 FROM app.academic_final_admissions ad WHERE ad.submission_id=sub AND ad.outcome='accepted') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='SCREENING_ACCEPTANCE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'criteria') c WHERE jsonb_array_length(c->'locators')>0) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MANUAL_LOCATORS_RETIRED';END IF;
 RETURN app.academic_evaluation_prepare_r06(who,sid,sub,expected,assignment_expected,payload,command,digest);
END $$;
--> statement-breakpoint
ALTER FUNCTION app.semester_state(uuid,uuid,uuid) RENAME TO semester_state_r06;
CREATE FUNCTION app.semester_state(who uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;BEGIN result:=app.semester_state_r06(who,sid,pid);RETURN result||jsonb_build_object('workflow',app.academic_flow_state(who,sid,pid));END $$;
ALTER FUNCTION app.academic_readiness(uuid,uuid,uuid) RENAME TO academic_readiness_r06;
CREATE FUNCTION app.academic_readiness(who uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;flow jsonb;final jsonb;BEGIN
 result:=app.academic_readiness_r06(who,sid,pid);flow:=app.academic_flow_state(who,sid,pid);final:=result->'final';
 IF NOT (flow->>'requestValid')::boolean AND (result->'studio'->>'editable')::boolean THEN final:=final||jsonb_build_object('canSubmit',false,'issues',(final->'issues')||jsonb_build_array('FINAL_REQUEST_REQUIRED'));END IF;
 RETURN result||jsonb_build_object('flow',flow,'final',final);
END $$;
ALTER FUNCTION app.academic_round_read(uuid,uuid,uuid) RENAME TO academic_round_read_r06;
CREATE FUNCTION app.academic_round_read(who uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;ad app.academic_final_admissions;screened boolean;flow jsonb;BEGIN
 result:=app.academic_round_read_r06(who,sid,sub);SELECT * INTO ad FROM app.academic_final_admissions WHERE submission_id=sub;
 screened:=ad.outcome='accepted';flow:=app.academic_flow_state(who,sid,(result->>'project')::uuid);
 RETURN result||jsonb_build_object('flow',flow,'screening',CASE WHEN ad.submission_id IS NULL THEN NULL ELSE jsonb_build_object('outcome',ad.outcome,'reason',ad.reason,'actor',ad.actor_name,'recordedAt',ad.recorded_at) END,'canScreen',(result->>'canDecide')::boolean AND (flow->>'canScreen')::boolean,'canAssess',coalesce(screened,false) AND (result->>'canAssess')::boolean,'assessment',CASE WHEN (result->>'canDecide')::boolean AND NOT coalesce(screened,false) THEN NULL ELSE result->'assessment' END);
END $$;
ALTER FUNCTION app.semester_collection(uuid,uuid,boolean) RENAME TO semester_collection_r06;
CREATE FUNCTION app.semester_collection(who uuid,sid uuid,needs_review boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;BEGIN result:=app.semester_collection_r06(who,sid,needs_review);RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(x||jsonb_build_object('workflow',app.academic_flow_state(who,sid,(x->>'id')::uuid),'feedback',(SELECT comment FROM app.checkpoint_decisions WHERE project_id=(x->>'id')::uuid ORDER BY decided_at DESC LIMIT 1),'submitter',(SELECT name FROM jsonb_array_elements((SELECT authors_snapshot FROM app.project_submissions WHERE id=(x->>'final')::uuid)) author WHERE (author->>'lead')::boolean LIMIT 1),'authorCount',(SELECT count(*) FROM app.project_authors WHERE project_id=(x->>'id')::uuid))),'[]') FROM jsonb_array_elements(result->'items') x));END $$;
--> statement-breakpoint
-- Private wrappers cannot be invoked as bypasses by runtime or jobs.
REVOKE ALL ON FUNCTION app.academic_flow_principal(uuid,uuid,uuid),app.academic_current_request(uuid,uuid),app.academic_flow_record(uuid,app.projects,uuid,uuid,text,uuid,text,jsonb,text),app.academic_new_final_guard(),app.academic_new_final_bind(),app.academic_final_prepare_r06(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text),app.academic_decision_prepare_r06(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text),app.academic_draft_save_r06(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text),app.academic_evaluation_prepare_r06(uuid,uuid,uuid,integer,integer,jsonb,uuid,text),app.semester_state_r06(uuid,uuid,uuid),app.academic_readiness_r06(uuid,uuid,uuid),app.academic_round_read_r06(uuid,uuid,uuid),app.semester_collection_r06(uuid,uuid,boolean),app.academic_evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.academic_request_final(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text),app.academic_screen_prepare(uuid,uuid,uuid,integer,integer,text,text,uuid,text),app.academic_screen_commit(uuid,uuid,uuid,integer,integer,text,text,uuid,text),app.academic_flow_state(uuid,uuid,uuid),app.academic_final_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text),app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text),app.academic_draft_save(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text),app.semester_state(uuid,uuid,uuid),app.academic_readiness(uuid,uuid,uuid),app.academic_round_read(uuid,uuid,uuid),app.semester_collection(uuid,uuid,boolean) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_request_final(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text),app.academic_screen_prepare(uuid,uuid,uuid,integer,integer,text,text,uuid,text),app.academic_screen_commit(uuid,uuid,uuid,integer,integer,text,text,uuid,text),app.academic_flow_state(uuid,uuid,uuid),app.academic_final_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text),app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text),app.academic_draft_save(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text),app.semester_state(uuid,uuid,uuid),app.academic_readiness(uuid,uuid,uuid),app.academic_round_read(uuid,uuid,uuid),app.semester_collection(uuid,uuid,boolean) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.academic_flow_inbox(who uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;BEGIN
 a:=app.assignment_principal(who,sid);
 RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id),'[]') FROM (
 SELECT n.id,n.type,n.created_at,n.read_at,p.id AS project,v.title,
 CASE WHEN p.id IS NULL THEN NULL WHEN a.role_code='university_admin' THEN '/admin/university/projects/'||p.id::text WHEN a.role_code='faculty_supervisor' THEN '/supervision/projects/'||p.id::text ELSE '/projects/'||p.id::text END AS route
 FROM app.notifications n LEFT JOIN app.projects p ON p.id=n.project_id LEFT JOIN app.project_versions v ON v.id=p.current_version_id
 WHERE n.recipient_id=who AND (p.id IS NULL OR p.university_id=a.university_id AND (p.supervisor_id=who AND a.role_code='faculty_supervisor' OR a.role_code='university_admin' OR EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=p.id AND user_id=who))) ORDER BY n.created_at DESC,n.id LIMIT 50
 ) x));
END $$;
REVOKE ALL ON FUNCTION app.academic_flow_inbox(uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_flow_inbox(uuid,uuid) TO capstone_runtime;


