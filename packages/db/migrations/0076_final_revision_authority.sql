-- Owner R09: a returned assessed attempt authorizes one new final in the same private project.
CREATE TABLE app.academic_return_authorities(
 request_id uuid PRIMARY KEY,university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,
 returned_submission_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('screening','assessed')),
 FOREIGN KEY(university_id,project_id,version_id,request_id) REFERENCES app.academic_completion_requests(university_id,project_id,version_id,id),
 FOREIGN KEY(university_id,project_id,version_id,returned_submission_id) REFERENCES app.project_submissions(university_id,project_id,version_id,id)
);
CREATE TRIGGER immutable_return_authority BEFORE UPDATE OR DELETE ON app.academic_return_authorities FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.academic_return_authorities FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.academic_issue_return_authority(who uuid,p app.projects,vid uuid,sub uuid,note_value text,kind_value text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE q uuid:=gen_random_uuid();BEGIN
 IF EXISTS(SELECT 1 FROM app.academic_return_authorities ra JOIN app.academic_completion_requests q ON q.id=ra.request_id WHERE ra.returned_submission_id=sub AND q.supervisor_id=who AND q.assignment_revision=p.row_version AND NOT EXISTS(SELECT 1 FROM app.academic_final_requests f WHERE f.request_id=q.id)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='RETURN_ALREADY_AUTHORIZED';END IF;
 INSERT INTO app.academic_completion_requests(id,university_id,project_id,version_id,supervisor_id,assignment_revision,note,actor_name) SELECT q,p.university_id,p.id,vid,who,p.row_version,left(note_value,500),full_name FROM app.users WHERE id=who;
 INSERT INTO app.academic_return_authorities VALUES(q,p.university_id,p.id,vid,sub,kind_value);RETURN q;
END $$;
REVOKE ALL ON FUNCTION app.academic_issue_return_authority(uuid,app.projects,uuid,uuid,text,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.academic_current_request(pid uuid,vid uuid) RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT q.id FROM app.academic_completion_requests q JOIN app.projects p ON p.id=q.project_id JOIN app.users u ON u.id=p.supervisor_id
 WHERE q.project_id=pid AND q.version_id=vid AND q.supervisor_id=p.supervisor_id AND q.assignment_revision=p.row_version AND u.account_status='active'
 AND NOT EXISTS(SELECT 1 FROM app.academic_final_requests used WHERE used.request_id=q.id)
 AND (NOT EXISTS(SELECT 1 FROM app.project_submissions s JOIN app.review_records r ON r.submission_id=s.id WHERE s.id=(SELECT id FROM app.project_submissions WHERE project_id=pid AND version_id=vid AND purpose='FINAL' ORDER BY round_number DESC LIMIT 1) AND r.decision='revision_required')
 OR EXISTS(SELECT 1 FROM app.academic_return_authorities a WHERE a.request_id=q.id AND a.returned_submission_id=(SELECT id FROM app.project_submissions WHERE project_id=pid AND version_id=vid AND purpose='FINAL' ORDER BY round_number DESC LIMIT 1)))
 ORDER BY q.requested_at DESC,q.id DESC LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION app.academic_decision_prepare(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome text,reason text,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.evaluation_actor(who,sid,sub,false);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=command) THEN
  IF outcome='revision' AND EXISTS(SELECT 1 FROM app.academic_screen_commands sc WHERE sc.actor_id=who AND sc.command_id=command AND sc.submission_id=sub AND sc.outcome='returned' AND sc.payload_digest=digest) THEN NULL;
  ELSIF NOT EXISTS(SELECT 1 FROM app.academic_final_admissions ad WHERE ad.submission_id=sub AND ad.outcome='accepted') OR NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor') OR NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='committee') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ASSESSMENTS_REQUIRED';END IF;
 END IF;
 RETURN app.academic_decision_prepare_r06(who,sid,sub,expected,assignment_expected,outcome,reason,manifest,command,digest);
END $$;
--> statement-breakpoint
ALTER FUNCTION app.academic_decision_commit(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) RENAME TO academic_decision_commit_before_r09;
CREATE FUNCTION app.academic_decision_commit(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome text,reason text,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;ev uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();result jsonb;BEGIN
 IF outcome<>'revision' OR EXISTS(SELECT 1 FROM app.academic_screen_commands sc WHERE sc.actor_id=who AND sc.command_id=command AND sc.submission_id=sub AND sc.outcome='returned' AND sc.payload_digest=digest) THEN RETURN app.academic_decision_commit_before_r09(who,sid,sub,expected,assignment_expected,outcome,reason,manifest,command,digest);END IF;
 -- The same prepare gate, version/assignment CAS and row locks serialize all three outcomes.
 IF NOT EXISTS(SELECT 1 FROM app.academic_decision_commands dc WHERE dc.actor_id=who AND dc.command_id=command AND dc.submission_id=sub AND dc.operation='revision' AND dc.payload_digest=digest AND dc.reason IS NOT DISTINCT FROM academic_decision_commit.reason AND dc.public_manifest_digest=manifest) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PREPARE_REQUIRED';END IF;
 p:=app.evaluation_actor(who,sid,sub,true,expected,assignment_expected);SELECT * INTO s FROM app.project_submissions WHERE id=sub;
 INSERT INTO app.review_records(id,university_id,project_id,version_id,submission_id,decided_by,decision,comment,decided_at) VALUES(rid,p.university_id,p.id,s.version_id,sub,who,'revision_required',app.evaluation_trim(reason),t);
 -- Existing working references are copy-on-write; immutable submission_files retain their original objects.
 UPDATE app.project_versions SET status='revision_required',row_version=row_version+1,updated_at=t,updated_by=who WHERE id=s.version_id;
 INSERT INTO app.academic_decision_scope(submission_id,actor_name,outcome,reason,public_manifest_digest) SELECT sub,full_name,'revision',app.evaluation_trim(reason),manifest FROM app.users WHERE id=who;
 PERFORM app.academic_issue_return_authority(who,p,s.version_id,sub,app.evaluation_trim(reason),'assessed');
 result:=jsonb_build_object('id',rid,'submission',sub,'round',s.round_number,'state','revision_required','revision',expected+1,'project',p.id);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,reason,correlation_id,event_key,after_state) VALUES(ev,who,'faculty_supervisor',p.university_id,'academic.final.revision_requested','review_record',rid,p.id,s.version_id,'Supervisor requested final revision',command,ev,jsonb_build_object('scope',result::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,user_id,p.university_id,p.id,'academic.final.revision_requested',jsonb_build_object('route','/projects/'||p.id::text,'message_key','academic.final.revision_requested') FROM app.project_authors WHERE project_id=p.id;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,command,'submission.revision',digest,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.academic_decision_commit_before_r09(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.academic_decision_commit(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_decision_commit(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) TO capstone_runtime;
--> statement-breakpoint
ALTER FUNCTION app.academic_screen_commit(uuid,uuid,uuid,integer,integer,text,text,uuid,text) RENAME TO academic_screen_commit_before_r09;
CREATE FUNCTION app.academic_screen_commit(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome_value text,reason_value text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;p app.projects;s app.project_submissions;BEGIN
 result:=app.academic_screen_commit_before_r09(who,sid,sub,expected,assignment_expected,outcome_value,reason_value,command,digest);
 IF outcome_value='returned' THEN SELECT * INTO s FROM app.project_submissions WHERE id=sub;p:=app.academic_flow_principal(who,sid,s.project_id);PERFORM app.academic_issue_return_authority(who,p,s.version_id,sub,reason_value,'screening');END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.academic_screen_commit_before_r09(uuid,uuid,uuid,integer,integer,text,text,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.academic_screen_commit(uuid,uuid,uuid,integer,integer,text,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_screen_commit(uuid,uuid,uuid,integer,integer,text,text,uuid,text) TO capstone_runtime;
--> statement-breakpoint
ALTER FUNCTION app.academic_flow_state(uuid,uuid,uuid) RENAME TO academic_flow_state_before_r09;
CREATE FUNCTION app.academic_flow_state(who uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;p app.projects;a app.academic_return_authorities;q app.academic_completion_requests;d app.review_records;BEGIN
 result:=app.academic_flow_state_before_r09(who,sid,pid);p:=app.academic_flow_principal(who,sid,pid);
 SELECT * INTO a FROM app.academic_return_authorities WHERE request_id=app.academic_current_request(pid,p.current_version_id);
 IF a.request_id IS NULL THEN SELECT ra.* INTO a FROM app.academic_final_requests f JOIN app.academic_return_authorities ra ON ra.request_id=f.request_id WHERE f.submission_id=(result->>'submission')::uuid;END IF;
 SELECT * INTO q FROM app.academic_completion_requests WHERE id=a.request_id;SELECT * INTO d FROM app.review_records WHERE submission_id=a.returned_submission_id;
 RETURN result||jsonb_build_object('revision',CASE WHEN a.request_id IS NULL THEN NULL ELSE jsonb_build_object('submission',a.returned_submission_id,'kind',a.kind,'reason',d.comment,'actor',(SELECT actor_name FROM app.academic_decision_scope WHERE submission_id=a.returned_submission_id),'requestedAt',d.decided_at) END,'finalNumber',(SELECT count(*) FROM app.project_submissions WHERE project_id=pid AND version_id=p.current_version_id AND purpose='FINAL'));
END $$;
REVOKE ALL ON FUNCTION app.academic_flow_state_before_r09(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.academic_flow_state(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_flow_state(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
-- A current supervisor can reauthorize a returned attempt after an assignment revision invalidates its old authority.
ALTER FUNCTION app.academic_request_final(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text) RENAME TO academic_request_final_before_r09;
CREATE FUNCTION app.academic_request_final(who uuid,sid uuid,pid uuid,vid uuid,assignment_expected integer,request_expected integer,note_value text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;sub uuid;kind_value text;q uuid;replayed boolean:=EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=command);BEGIN
 result:=app.academic_request_final_before_r09(who,sid,pid,vid,assignment_expected,request_expected,note_value,command,digest);IF replayed THEN RETURN result;END IF;q:=(result->>'request')::uuid;
 SELECT s.id,CASE WHEN EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=s.id) THEN 'assessed' ELSE 'screening' END INTO sub,kind_value FROM app.project_submissions s JOIN app.review_records r ON r.submission_id=s.id WHERE s.project_id=pid AND s.version_id=vid AND s.purpose='FINAL' AND r.decision='revision_required' ORDER BY s.round_number DESC LIMIT 1;
 IF sub IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.academic_return_authorities WHERE request_id=q) THEN INSERT INTO app.academic_return_authorities VALUES(q,(SELECT university_id FROM app.projects WHERE id=pid),pid,vid,sub,kind_value);END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.academic_request_final_before_r09(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.academic_request_final(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_request_final(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text) TO capstone_runtime;
--> statement-breakpoint
ALTER FUNCTION app.checkpoint_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid) RENAME TO checkpoint_prepare_before_r09;
CREATE FUNCTION app.checkpoint_prepare(who uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,manifest text,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.academic_flow_principal(who,sid,pid);
 IF app.academic_current_request(pid,vid) IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='FINAL_PREPARATION_ACTIVE';END IF;
 RETURN app.checkpoint_prepare_before_r09(who,sid,pid,vid,expected,assignment_expected,manifest,command);
END $$;
REVOKE ALL ON FUNCTION app.checkpoint_prepare_before_r09(uuid,uuid,uuid,uuid,integer,integer,text,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.checkpoint_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.checkpoint_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid) TO capstone_runtime;
