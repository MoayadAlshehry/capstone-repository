-- Display/audit the exact approved/latest frozen round, never an arbitrary earlier UUID.
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
 SELECT visibility_at_submit INTO submitted FROM app.submission_files WHERE file_id=fid AND submission_id=CASE WHEN v.status='archived' THEN v.approved_submission_id ELSE (SELECT id FROM app.project_submissions WHERE version_id=vid ORDER BY round_number DESC LIMIT 1) END;
 UPDATE app.project_files SET visibility=intended,policy_revision=policy_revision+1 WHERE id=fid;
 result:=jsonb_build_object('file',fid,'visibility',intended,'revision',f.policy_revision+1,'externallyPublic',v.status='archived' AND intended='public');
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state)
 VALUES(ev,reader,'student',p.university_id,'file.visibility','project_file',fid,pid,vid,command,ev,jsonb_build_object('scope',jsonb_build_object('visibility',f.visibility,'submitted',submitted,'sha256',f.sha256)::text),jsonb_build_object('scope',result::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,user_id,p.university_id,pid,'file.visibility.changed',jsonb_build_object('route','/projects/'||pid::text,'message_key','file.visibility.changed') FROM app.project_authors WHERE project_id=pid;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'file.visibility',digest,ev,jsonb_build_object('scope',result::text));
 RETURN result;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.edition_history(reader uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;lead boolean;items jsonb;
BEGIN
 SELECT * INTO p FROM app.projects WHERE id=pid;
 p:=app.file_actor(reader,sid,pid,p.current_version_id,false);
 lead:=(app.assignment_principal(reader,sid)).role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'number',v.version_number,'status',v.status,'base',v.base_version_id,'createdAt',v.created_at,'submittedAt',v.submitted_at,'archivedAt',v.archived_at,'retainedAt',v.retained_at,'current',v.id=p.current_version_id,'published',v.id=p.published_version_id,'approvedSubmission',v.approved_submission_id,'submission',CASE WHEN v.status='archived' THEN v.approved_submission_id ELSE (SELECT id FROM app.project_submissions WHERE version_id=v.id ORDER BY round_number DESC LIMIT 1) END,'canCreate',lead AND v.status IN ('archived','rejected') AND NOT EXISTS(SELECT 1 FROM app.project_versions active WHERE active.project_id=pid AND active.status IN ('draft','pending_review','revision_required')),'license',v.license_identifier,'files',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'path',f.relative_path,'size',f.size_bytes,'sha256',f.sha256,'visibility',f.visibility,'revision',f.policy_revision,'submittedVisibility',(SELECT visibility_at_submit FROM app.submission_files WHERE file_id=f.id AND submission_id=CASE WHEN v.status='archived' THEN v.approved_submission_id ELSE (SELECT id FROM app.project_submissions WHERE version_id=v.id ORDER BY round_number DESC LIMIT 1) END),'externallyPublic',v.status='archived' AND f.visibility='public','canChange',lead AND (v.status='archived' OR (v.id=p.current_version_id AND v.status IN ('draft','revision_required')))) ORDER BY f.canonical_path),'[]') FROM app.project_files f JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=pid AND o.university_id=p.university_id WHERE f.version_id=v.id AND f.is_current AND f.processing_status='ready' AND (f.size_bytes,f.sha256)=(o.size_bytes,o.sha256))) ORDER BY v.version_number DESC),'[]') INTO items FROM app.project_versions v WHERE v.project_id=pid AND v.university_id=p.university_id;
 RETURN jsonb_build_object('project',pid,'assignmentRevision',p.row_version,'currentVersion',p.current_version_id,'publishedVersion',p.published_version_id,'lead',lead,'items',items);
END $$;
