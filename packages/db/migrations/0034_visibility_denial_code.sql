-- Stable safe domain denial code; identical receipt retries retain prior behavior.
-- Current-author immediate notices are atomic with policy/audit/receipt.
CREATE OR REPLACE FUNCTION app.edition_visibility(reader uuid,sid uuid,pid uuid,vid uuid,fid uuid,expected integer,intended text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;f app.project_files;r app.command_receipts;ev uuid:=gen_random_uuid();result jsonb;submitted text;
BEGIN
 p:=app.edition_lead(reader,sid,pid,vid);SELECT * INTO v FROM app.project_versions WHERE id=vid;
 SELECT * INTO f FROM app.project_files WHERE id=fid AND version_id=vid AND project_id=pid AND university_id=p.university_id AND is_current AND processing_status='ready' FOR UPDATE;
 IF f.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN
  IF r.action<>'file.visibility' OR r.payload_digest IS DISTINCT FROM digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;
  RETURN (r.result->>'scope')::jsonb;
 END IF;
 IF intended NOT IN ('public','restricted') OR intended IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_POLICY';END IF;
 IF v.status='archived' AND f.visibility='restricted' AND intended='public' THEN RAISE EXCEPTION USING ERRCODE='P1021',MESSAGE='REVIEWED_SUCCESSOR_REQUIRED';END IF;
 IF v.status<>'archived' AND (v.status NOT IN ('draft','revision_required') OR p.current_version_id<>vid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LOCKED';END IF;
 IF expected IS DISTINCT FROM f.policy_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 SELECT visibility_at_submit INTO submitted FROM app.submission_files WHERE file_id=fid ORDER BY submission_id LIMIT 1;
 UPDATE app.project_files SET visibility=intended,policy_revision=policy_revision+1 WHERE id=fid;
 result:=jsonb_build_object('file',fid,'visibility',intended,'revision',f.policy_revision+1,'externallyPublic',v.status='archived' AND intended='public');
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state)
 VALUES(ev,reader,'student',p.university_id,'file.visibility','project_file',fid,pid,vid,command,ev,jsonb_build_object('scope',jsonb_build_object('visibility',f.visibility,'submitted',submitted,'sha256',f.sha256)::text),jsonb_build_object('scope',result::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,user_id,p.university_id,pid,'file.visibility.changed',jsonb_build_object('route','/projects/'||pid::text,'message_key','file.visibility.changed') FROM app.project_authors WHERE project_id=pid;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'file.visibility',digest,ev,jsonb_build_object('scope',result::text));
 RETURN result;
END $$;
