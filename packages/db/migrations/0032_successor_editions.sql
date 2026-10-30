-- Successors reuse exact frozen same-project objects. No external delivery/grants.
ALTER TABLE app.project_files ADD COLUMN source_file_id uuid,
 ADD COLUMN source_uploader_name text, ADD COLUMN source_uploader_role text,
 ADD COLUMN policy_revision integer NOT NULL DEFAULT 0 CHECK(policy_revision>=0);
ALTER TABLE app.project_files ADD CONSTRAINT file_project_identity UNIQUE(university_id,project_id,id);
ALTER TABLE app.project_files ADD CONSTRAINT successor_source_scope FOREIGN KEY(university_id,project_id,source_file_id) REFERENCES app.project_files(university_id,project_id,id);
CREATE FUNCTION app.edition_lead(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS app.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;a app.users;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid,false);a:=app.assignment_principal(reader,sid);
 IF a.role_code<>'student' OR NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAD_ONLY';END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION app.edition_lead(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.successor_prepare(reader uuid,sid uuid,pid uuid,base uuid,expected integer,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;s app.project_submissions;r app.command_receipts;files jsonb;
BEGIN
 p:=app.edition_lead(reader,sid,pid,base);SELECT * INTO v FROM app.project_versions WHERE id=base FOR UPDATE;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN
  IF r.action<>'edition.create' OR r.payload_digest IS DISTINCT FROM digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('completed',r.result->>'scope');
 END IF;
 IF expected IS DISTINCT FROM p.row_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 IF v.status NOT IN ('archived','rejected') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='IMMUTABLE_BASE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM app.project_versions WHERE project_id=pid AND status IN ('draft','pending_review','revision_required')) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ACTIVE_WORKSPACE';END IF;
 SELECT * INTO s FROM app.project_submissions WHERE version_id=base AND id=CASE WHEN v.status='archived' THEN v.approved_submission_id ELSE (SELECT id FROM app.project_submissions WHERE version_id=base ORDER BY round_number DESC LIMIT 1) END;
 IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=s.id AND decision=v.status) OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=s.id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='BASE_INTEGRITY';END IF;
 PERFORM app.submission_native_read(reader,sid,pid,base,s.id,NULL);
 IF EXISTS(SELECT 1 FROM app.submission_files m JOIN app.project_files f ON f.id=m.file_id WHERE m.submission_id=s.id AND (f.processing_status<>'ready' OR NOT app.native_path_valid(m.relative_path,m.extension_at_submit))) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='BASE_INTEGRITY';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',m.size_at_submit,'sha256',m.sha256_at_submit) ORDER BY m.file_id) INTO files FROM app.submission_files m JOIN app.storage_objects o ON o.id=m.storage_object_id AND o.project_id=pid AND o.university_id=p.university_id WHERE m.submission_id=s.id;
 RETURN jsonb_build_object('submission',s.id,'files',files);
END $$;
REVOKE ALL ON FUNCTION app.successor_prepare(uuid,uuid,uuid,uuid,integer,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.successor_prepare(uuid,uuid,uuid,uuid,integer,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.successor_commit(reader uuid,sid uuid,pid uuid,base uuid,expected integer,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prepared jsonb;p app.projects;v app.project_versions;s app.project_submissions;nv uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();n integer;result jsonb;generated uuid;
BEGIN
 prepared:=app.successor_prepare(reader,sid,pid,base,expected,command,digest);
 IF prepared ? 'completed' THEN RETURN (prepared->>'completed')::jsonb;END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid;SELECT * INTO v FROM app.project_versions WHERE id=base;SELECT * INTO s FROM app.project_submissions WHERE id=(prepared->>'submission')::uuid;
 SELECT max(version_number)+1 INTO n FROM app.project_versions WHERE project_id=pid;
 INSERT INTO app.project_versions(id,university_id,project_id,version_number,base_version_id,status,title,abstract,keywords,academic_year,domain,updated_by)
 VALUES(nv,p.university_id,pid,n,base,'draft',s.metadata_snapshot->>'title',s.metadata_snapshot->>'abstract',s.metadata_snapshot->'keywords',s.metadata_snapshot->>'academicYear',s.metadata_snapshot->>'domain',reader);
 INSERT INTO app.project_files(university_id,project_id,version_id,storage_object_id,relative_path,original_name,extension,detected_mime,size_bytes,sha256,visibility,uploaded_by,uploaded_at,processing_status,source_file_id,source_uploader_name,source_uploader_role)
 SELECT p.university_id,pid,nv,m.storage_object_id,m.relative_path,f.original_name,m.extension_at_submit,m.mime_at_submit,m.size_at_submit,m.sha256_at_submit,
 CASE WHEN m.visibility_at_submit='restricted' OR f.visibility='restricted' THEN 'restricted' ELSE 'public' END,m.uploader_id_at_submit,m.uploaded_at_at_submit,'ready',f.id,m.uploader_name_at_submit,m.uploader_role_at_submit
 FROM app.submission_files m JOIN app.project_files f ON f.id=m.file_id WHERE m.submission_id=s.id;
 -- Explicit seed preserves existing rights; it never generates or relicenses bytes.
 IF v.generated_license_file_id IS NOT NULL THEN
  SELECT id INTO generated FROM app.project_files WHERE version_id=nv AND source_file_id=v.generated_license_file_id;
  IF generated IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LICENSE_INCONSISTENT';END IF;
  UPDATE app.project_versions SET license_identifier=v.license_identifier,generated_license_file_id=generated,license_template_hash=v.license_template_hash,license_inputs_hash=v.license_inputs_hash WHERE id=nv;
 END IF;
 UPDATE app.projects SET current_version_id=nv,row_version=row_version+1 WHERE id=pid;
 result:=jsonb_build_object('project',pid,'version',nv,'number',n,'base',base,'state','draft','publishedVersion',p.published_version_id);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state)
 VALUES(ev,reader,'student',p.university_id,'edition.create','project_version',nv,pid,nv,command,ev,jsonb_build_object('scope',jsonb_build_object('base',base,'publishedVersion',p.published_version_id)::text),jsonb_build_object('scope',result::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,user_id,p.university_id,pid,'edition.created',jsonb_build_object('route','/projects/'||pid::text,'message_key','edition.created') FROM app.project_authors WHERE project_id=pid;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'edition.create',digest,ev,jsonb_build_object('scope',result::text));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.successor_commit(uuid,uuid,uuid,uuid,integer,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.successor_commit(uuid,uuid,uuid,uuid,integer,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.edition_visibility(reader uuid,sid uuid,pid uuid,vid uuid,fid uuid,expected integer,intended text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
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
 IF v.status='archived' AND f.visibility='restricted' AND intended='public' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='REVIEWED_SUCCESSOR_REQUIRED';END IF;
 IF v.status<>'archived' AND (v.status NOT IN ('draft','revision_required') OR p.current_version_id<>vid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LOCKED';END IF;
 IF expected IS DISTINCT FROM f.policy_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 SELECT visibility_at_submit INTO submitted FROM app.submission_files WHERE file_id=fid ORDER BY submission_id LIMIT 1;
 UPDATE app.project_files SET visibility=intended,policy_revision=policy_revision+1 WHERE id=fid;
 result:=jsonb_build_object('file',fid,'visibility',intended,'revision',f.policy_revision+1,'externallyPublic',v.status='archived' AND intended='public');
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state)
 VALUES(ev,reader,'student',p.university_id,'file.visibility','project_file',fid,pid,vid,command,ev,jsonb_build_object('scope',jsonb_build_object('visibility',f.visibility,'submitted',submitted,'sha256',f.sha256)::text),jsonb_build_object('scope',result::text));
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'file.visibility',digest,ev,jsonb_build_object('scope',result::text));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.edition_visibility(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.edition_visibility(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.edition_history(reader uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;lead boolean;items jsonb;
BEGIN
 SELECT * INTO p FROM app.projects WHERE id=pid;
 p:=app.file_actor(reader,sid,pid,p.current_version_id,false);
 lead:=(app.assignment_principal(reader,sid)).role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'number',v.version_number,'status',v.status,'base',v.base_version_id,'createdAt',v.created_at,'submittedAt',v.submitted_at,'archivedAt',v.archived_at,'retainedAt',v.retained_at,'current',v.id=p.current_version_id,'published',v.id=p.published_version_id,'approvedSubmission',v.approved_submission_id,'submission',CASE WHEN v.status='archived' THEN v.approved_submission_id ELSE (SELECT id FROM app.project_submissions WHERE version_id=v.id ORDER BY round_number DESC LIMIT 1) END,'canCreate',lead AND v.status IN ('archived','rejected') AND NOT EXISTS(SELECT 1 FROM app.project_versions active WHERE active.project_id=pid AND active.status IN ('draft','pending_review','revision_required')),'license',v.license_identifier,'files',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'path',f.relative_path,'size',f.size_bytes,'sha256',f.sha256,'visibility',f.visibility,'revision',f.policy_revision,'submittedVisibility',(SELECT visibility_at_submit FROM app.submission_files WHERE file_id=f.id ORDER BY submission_id LIMIT 1),'externallyPublic',v.status='archived' AND f.visibility='public','canChange',lead AND (v.status='archived' OR (v.id=p.current_version_id AND v.status IN ('draft','revision_required')))) ORDER BY f.canonical_path),'[]') FROM app.project_files f JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=pid AND o.university_id=p.university_id WHERE f.version_id=v.id AND f.is_current AND f.processing_status='ready' AND (f.size_bytes,f.sha256)=(o.size_bytes,o.sha256))) ORDER BY v.version_number DESC),'[]') INTO items FROM app.project_versions v WHERE v.project_id=pid AND v.university_id=p.university_id;
 RETURN jsonb_build_object('project',pid,'assignmentRevision',p.row_version,'currentVersion',p.current_version_id,'publishedVersion',p.published_version_id,'lead',lead,'items',items);
END $$;
REVOKE ALL ON FUNCTION app.edition_history(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.edition_history(uuid,uuid,uuid) TO capstone_runtime;
-- Exact-version current restrictions for future grant policy; no grant is created here.
CREATE FUNCTION app.edition_effective_policy(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;result jsonb;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid,false);SELECT * INTO v FROM app.project_versions WHERE id=vid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('file',f.id,'visibility',f.visibility,'externallyPublic',v.status='archived' AND f.visibility='public','requiresRestrictedAccess',f.visibility='restricted') ORDER BY f.id),'[]') INTO result FROM app.project_files f JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=pid AND o.university_id=p.university_id WHERE f.version_id=vid AND f.is_current AND f.processing_status='ready' AND (f.size_bytes,f.sha256)=(o.size_bytes,o.sha256);
 RETURN jsonb_build_object('version',vid,'state',v.status,'files',result);
END $$;
REVOKE ALL ON FUNCTION app.edition_effective_policy(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.edition_effective_policy(uuid,uuid,uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.native_file_read(reader uuid,sid uuid,pid uuid,vid uuid,fid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;result jsonb;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid,false);
 IF p.current_version_id IS DISTINCT FROM vid THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'project',f.project_id,'version',f.version_id,'path',f.relative_path,'name',f.original_name,'extension',f.extension,'mime',f.detected_mime,'size',f.size_bytes,'sha256',f.sha256,'visibility',f.visibility,'status',f.processing_status,'uploader',coalesce(f.source_uploader_name,u.full_name),'uploaderRole',coalesce(f.source_uploader_role,(SELECT actor_role FROM app.audit_logs WHERE object_id=f.id AND action='file.finalize' ORDER BY occurred_at DESC LIMIT 1),u.role_code),'uploadedAt',f.uploaded_at) || CASE WHEN fid IS NOT NULL THEN jsonb_build_object('key',o.storage_key) ELSE '{}'::jsonb END ORDER BY f.canonical_path,f.relative_path,f.id),'[]'::jsonb) INTO result
 FROM app.project_files f JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=f.project_id AND o.university_id=f.university_id JOIN app.users u ON u.id=f.uploaded_by
 WHERE f.project_id=pid AND f.version_id=vid AND f.university_id=p.university_id AND f.is_current AND f.processing_status='ready' AND (fid IS NULL OR f.id=fid) AND (f.size_bytes,f.sha256)=(o.size_bytes,o.sha256);
 IF fid IS NOT NULL AND jsonb_array_length(result)<>1 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN CASE WHEN fid IS NULL THEN jsonb_build_object('files',result) ELSE result->0 END;
END $$;
CREATE OR REPLACE FUNCTION app.submission_commit(reader uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prepared jsonb;p app.projects;v app.project_versions;meta jsonb;authors jsonb;sub uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();num integer;t timestamptz:=clock_timestamp();result jsonb;
BEGIN
 prepared:=app.submission_prepare(reader,sid,pid,vid,expected,assignment_expected,command,payload_hash);
 IF prepared ? 'completed' THEN RETURN (prepared->>'completed')::jsonb;END IF;
 IF prepared ? 'issues' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NOT_READY';END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid;SELECT * INTO v FROM app.project_versions WHERE id=vid;
 SELECT jsonb_build_object('title',v.title,'abstract',v.abstract,'keywords',v.keywords,'academicYear',v.academic_year,'domain',v.domain,'university',jsonb_build_object('id',u.id,'nameEn',u.name_en,'nameAr',u.name_ar),'department',jsonb_build_object('id',d.id,'code',d.code,'nameEn',d.name_en,'nameAr',d.name_ar),'supervisor',jsonb_build_object('id',s.id,'name',s.full_name),'version',jsonb_build_object('id',v.id,'number',v.version_number),'license',jsonb_build_object('identifier',v.license_identifier,'state',CASE WHEN v.generated_license_file_id IS NOT NULL THEN 'generated' WHEN EXISTS(SELECT 1 FROM app.project_files WHERE version_id=vid AND is_current AND canonical_path IN ('license','license.txt','license.md')) THEN 'manual' ELSE 'none' END,'noticeKey','rights.noTransfer')) INTO meta FROM app.universities u JOIN app.departments d ON d.university_id=u.id AND d.id=p.department_id JOIN app.users s ON s.id=p.supervisor_id WHERE u.id=p.university_id;
 SELECT jsonb_agg(jsonb_build_object('id',pa.user_id,'name',u.full_name,'order',pa.author_order,'lead',pa.is_team_lead) ORDER BY pa.author_order) INTO authors FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id WHERE pa.project_id=pid;
 SELECT coalesce(max(round_number),0)+1 INTO num FROM app.project_submissions WHERE version_id=vid;
 INSERT INTO app.project_submissions(id,university_id,project_id,version_id,round_number,submitted_by,submitted_at,metadata_snapshot,authors_snapshot) VALUES(sub,p.university_id,pid,vid,num,reader,t,meta,authors);
 INSERT INTO app.submission_files(university_id,project_id,version_id,submission_id,file_id,relative_path,visibility_at_submit,sha256_at_submit,storage_object_id,size_at_submit,mime_at_submit,extension_at_submit,uploader_id_at_submit,uploader_name_at_submit,uploader_role_at_submit,uploaded_at_at_submit) SELECT f.university_id,pid,vid,sub,f.id,f.relative_path,f.visibility,f.sha256,f.storage_object_id,f.size_bytes,f.detected_mime,f.extension,f.uploaded_by,coalesce(f.source_uploader_name,u.full_name),coalesce(f.source_uploader_role,(SELECT actor_role FROM app.audit_logs WHERE object_id=f.id AND action='file.finalize' ORDER BY occurred_at DESC LIMIT 1),u.role_code),f.uploaded_at FROM app.project_files f JOIN app.users u ON u.id=f.uploaded_by WHERE f.version_id=vid AND f.is_current AND f.processing_status='ready';
 UPDATE app.projects SET first_submitted_at=coalesce(first_submitted_at,t) WHERE id=pid;
 UPDATE app.project_versions SET status='pending_review',submitted_at=t,row_version=row_version+1,updated_at=t,updated_by=reader WHERE id=vid;
 result:=jsonb_build_object('id',sub,'round',num,'state','pending_review','revision',expected+1,'project',pid,'version',vid);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state) VALUES(ev,reader,'student',p.university_id,CASE WHEN num=1 THEN 'submission.submit' ELSE 'submission.resubmit' END,'project_submission',sub,pid,vid,command,ev,jsonb_build_object('scope',jsonb_build_object('state',v.status)::text),jsonb_build_object('scope',jsonb_build_object('submission',sub,'round',num,'state','pending_review','metadataHash',encode(sha256(convert_to(meta::text,'UTF8')),'hex'),'authorsHash',encode(sha256(convert_to(authors::text,'UTF8')),'hex'),'fileCount',jsonb_array_length(prepared->'files'))::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(ev,p.supervisor_id,p.university_id,pid,'submission.created',jsonb_build_object('route','/submissions/'||sub::text,'message_key','submission.created'));
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'submission.submit',payload_hash,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;
--> statement-breakpoint
CREATE TABLE app.edition_supersessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL,project_id uuid NOT NULL,previous_version_id uuid NOT NULL,published_version_id uuid NOT NULL UNIQUE,submission_id uuid NOT NULL,actor_id uuid NOT NULL,occurred_at timestamptz NOT NULL,
 FOREIGN KEY(university_id,project_id,previous_version_id) REFERENCES app.project_versions(university_id,project_id,id),
 FOREIGN KEY(university_id,project_id,published_version_id,submission_id) REFERENCES app.project_submissions(university_id,project_id,version_id,id),
 FOREIGN KEY(university_id,actor_id) REFERENCES app.users(university_id,id),CHECK(previous_version_id<>published_version_id)
);
CREATE TRIGGER immutable_supersession BEFORE UPDATE OR DELETE ON app.edition_supersessions FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.edition_supersessions FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE OR REPLACE FUNCTION app.publication_prepare(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;v app.project_versions;r app.command_receipts;state jsonb;files jsonb;rv app.rubric_versions;
BEGIN
 p:=app.evaluation_actor(reader,sid,sub,false);SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO v FROM app.project_versions WHERE id=s.version_id FOR UPDATE;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'submission.publish' OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result->>'scope');END IF;
 IF v.status='archived' AND v.approved_submission_id=sub AND p.published_version_id=v.id THEN RETURN jsonb_build_object('completed',jsonb_build_object('submission',sub,'version',v.id,'project',p.id,'state','archived','archivedAt',v.archived_at)::text);END IF;
 PERFORM app.evaluation_actor(reader,sid,sub,true,expected,assignment_expected);state:=app.publication_state(reader,sid,sub);
 IF jsonb_array_length(state->'issues')>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PUBLICATION_PREREQUISITES';END IF;
 SELECT * INTO rv FROM app.rubric_versions WHERE code='CORE_V1';
 IF rv.code IS NULL OR rv.kind<>'internal' OR rv.schema_version<>1 OR rv.config_hash<>encode(sha256(convert_to(rv.config::text,'UTF8')),'hex') OR EXISTS(SELECT 1 FROM app.internal_assessments a WHERE a.submission_id=sub AND (a.rubric_code<>'CORE_V1' OR a.rubric_hash<>rv.config_hash OR NOT a.calibration_ack OR (SELECT count(*) FROM app.internal_criterion_scores WHERE assessment_id=a.id)<>7 OR a.quarter_points<>(SELECT sum((ARRAY[10,20,20,20,15,10,5])[(substring(code FROM 2))::int]*level) FROM app.internal_criterion_scores WHERE assessment_id=a.id) OR EXISTS(SELECT 1 FROM app.internal_criterion_scores c WHERE c.assessment_id=a.id AND NOT EXISTS(SELECT 1 FROM app.internal_evidence_locators l WHERE l.assessment_id=a.id AND l.code=c.code)))) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='ASSESSMENT_INTEGRITY';END IF;
 IF (p.published_version_id IS NOT NULL AND p.published_version_id<>v.id AND NOT EXISTS(SELECT 1 FROM app.project_versions old WHERE old.id=p.published_version_id AND old.project_id=p.id AND old.university_id=p.university_id AND old.status='archived' AND old.version_number<v.version_number)) OR v.approved_submission_id IS NOT NULL OR v.archived_at IS NOT NULL OR v.retained_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub) OR EXISTS(SELECT 1 FROM app.submission_files m LEFT JOIN app.project_files f ON f.id=m.file_id WHERE m.submission_id=sub AND (f.id IS NULL OR f.processing_status<>'ready')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PUBLICATION_INTEGRITY';END IF;
 PERFORM app.submission_native_read(reader,sid,p.id,v.id,sub,NULL);
 IF (SELECT count(*) FROM app.submission_files WHERE submission_id=sub)<>(SELECT count(*) FROM app.project_files WHERE version_id=v.id AND is_current) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_MANIFEST';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',m.size_at_submit,'sha256',m.sha256_at_submit) ORDER BY m.file_id) INTO files FROM app.submission_files m JOIN app.storage_objects o ON o.id=m.storage_object_id WHERE m.submission_id=sub;
 RETURN jsonb_build_object('files',files);
END $$;
CREATE OR REPLACE FUNCTION app.publication_commit(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prepared jsonb;p app.projects;s app.project_submissions;t timestamptz;ev uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();result jsonb;
BEGIN
 prepared:=app.publication_prepare(reader,sid,sub,expected,assignment_expected,command,payload_hash);IF prepared ? 'completed' THEN RETURN (prepared->>'completed')::jsonb;END IF;
 SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO p FROM app.projects WHERE id=s.project_id;t:=clock_timestamp();
 INSERT INTO app.review_records(id,university_id,project_id,version_id,submission_id,decided_by,decision,comment,decided_at) VALUES(rid,p.university_id,p.id,s.version_id,sub,reader,'archived','Assigned supervisor explicitly approved this frozen round for publication.',t);
 UPDATE app.project_versions SET status='archived',archived_at=t,retained_at=NULL,approved_submission_id=sub,row_version=row_version+1,updated_at=t,updated_by=reader WHERE id=s.version_id;
 UPDATE app.projects SET published_version_id=s.version_id WHERE id=p.id;
 IF p.published_version_id IS NOT NULL AND p.published_version_id<>s.version_id THEN INSERT INTO app.edition_supersessions(university_id,project_id,previous_version_id,published_version_id,submission_id,actor_id,occurred_at) VALUES(p.university_id,p.id,p.published_version_id,s.version_id,sub,reader,t);END IF;
 result:=jsonb_build_object('submission',sub,'version',s.version_id,'project',p.id,'state','archived','archivedAt',t);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state) VALUES(ev,reader,'faculty_supervisor',p.university_id,'submission.publish','review_record',rid,p.id,s.version_id,command,ev,jsonb_build_object('scope','pending_review'),jsonb_build_object('scope',jsonb_build_object('state','archived','approvedSubmission',sub,'publishedVersion',s.version_id,'archivedAt',t)::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,(x->>'id')::uuid,p.university_id,p.id,'review.published',jsonb_build_object('route','/submissions/'||sub::text,'message_key','review.published') FROM jsonb_array_elements(s.authors_snapshot) x;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'submission.publish',payload_hash,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;

--> statement-breakpoint

CREATE FUNCTION app.successor_provenance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF (NEW.source_file_id,NEW.source_uploader_name,NEW.source_uploader_role) IS DISTINCT FROM (OLD.source_file_id,OLD.source_uploader_name,OLD.source_uploader_role) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable successor provenance';END IF;RETURN NEW;
END $$;
CREATE TRIGGER immutable_successor_provenance BEFORE UPDATE ON app.project_files FOR EACH ROW EXECUTE FUNCTION app.successor_provenance_guard();
REVOKE ALL ON FUNCTION app.successor_provenance_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
