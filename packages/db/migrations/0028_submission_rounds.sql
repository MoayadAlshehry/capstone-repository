-- Phase18: internal immutable rounds only. No archive/publication operation.
CREATE TABLE app.review_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,submission_id uuid NOT NULL UNIQUE,
 decided_by uuid NOT NULL,decision text NOT NULL CHECK(decision IN ('revision_required','rejected')),comment text NOT NULL CHECK(char_length(btrim(comment)) BETWEEN 3 AND 2000),decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(university_id,project_id,version_id,submission_id) REFERENCES app.project_submissions(university_id,project_id,version_id,id),FOREIGN KEY(university_id,decided_by) REFERENCES app.users(university_id,id)
);
CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON app.review_records FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.review_records FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER TABLE app.submission_files ADD COLUMN storage_object_id uuid,ADD COLUMN size_at_submit bigint,ADD COLUMN mime_at_submit text,ADD COLUMN extension_at_submit text,ADD COLUMN uploader_id_at_submit uuid,ADD COLUMN uploader_name_at_submit text,ADD COLUMN uploader_role_at_submit text,ADD COLUMN uploaded_at_at_submit timestamptz;
ALTER TABLE app.submission_files ADD FOREIGN KEY(university_id,project_id,storage_object_id) REFERENCES app.storage_objects(university_id,project_id,id);
CREATE FUNCTION app.round_author_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE pid uuid;state text;
BEGIN
 IF TG_OP='DELETE' THEN pid:=OLD.project_id;ELSE pid:=NEW.project_id;END IF;
 SELECT v.status INTO state FROM app.projects p JOIN app.project_versions v ON v.id=p.current_version_id WHERE p.id=pid FOR UPDATE OF p,v;
 IF state IN ('pending_review','rejected','archived') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHOR_LOCKED';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
CREATE TRIGGER round_author_lock BEFORE INSERT OR UPDATE OR DELETE ON app.project_authors FOR EACH ROW EXECUTE FUNCTION app.round_author_lock();
REVOKE ALL ON FUNCTION app.round_author_lock() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.submission_actor(reader uuid,sid uuid,sub uuid) RETURNS app.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;s app.project_submissions;p app.projects;
BEGIN
 a:=app.assignment_principal(reader,sid);
 SELECT * INTO s FROM app.project_submissions WHERE id=sub AND university_id=a.university_id;
 SELECT * INTO p FROM app.projects WHERE id=s.project_id AND university_id=a.university_id AND assignment_managed FOR UPDATE;
 IF s.id IS NULL OR p.id IS NULL OR NOT ((a.role_code='student' AND (EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=p.id AND user_id=reader) OR EXISTS(SELECT 1 FROM jsonb_array_elements(s.authors_snapshot) x WHERE x->>'id'=reader::text))) OR (a.role_code='faculty_supervisor' AND p.supervisor_id=reader) OR a.role_code='university_admin') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 PERFORM 1 FROM app.users WHERE id=reader FOR SHARE;PERFORM 1 FROM app.auth_sessions WHERE id=sid AND user_id=reader AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 PERFORM app.assignment_principal(reader,sid);RETURN p;
END $$;
REVOKE ALL ON FUNCTION app.submission_actor(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.submission_read(reader uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;v app.project_versions;r app.review_records;
BEGIN
 p:=app.submission_actor(reader,sid,sub);SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO v FROM app.project_versions WHERE id=s.version_id;SELECT * INTO r FROM app.review_records WHERE submission_id=sub;
 RETURN jsonb_build_object('id',s.id,'project',s.project_id,'version',s.version_id,'round',s.round_number,'submittedAt',s.submitted_at,'metadata',s.metadata_snapshot,'authors',s.authors_snapshot,'status',v.status,'revision',v.row_version,'assignmentRevision',p.row_version,'firstSubmittedAt',p.first_submitted_at,'retainedAt',v.retained_at,'currentRound',s.id=(SELECT id FROM app.project_submissions WHERE version_id=s.version_id ORDER BY round_number DESC LIMIT 1),'canDecide',p.supervisor_id=reader AND v.status='pending_review' AND s.id=(SELECT id FROM app.project_submissions WHERE version_id=s.version_id ORDER BY round_number DESC LIMIT 1) AND r.id IS NULL,'decision',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'decision',r.decision,'comment',r.comment,'actor',r.decided_by,'decidedAt',r.decided_at) END,'files',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',file_id,'path',relative_path,'sha256',sha256_at_submit,'visibility',visibility_at_submit,'size',size_at_submit,'mime',mime_at_submit) ORDER BY relative_path,file_id),'[]') FROM app.submission_files WHERE submission_id=sub));
END $$;
REVOKE ALL ON FUNCTION app.submission_read(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.submission_read(uuid,uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.submission_queue(reader uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;result jsonb;
BEGIN
 a:=app.assignment_principal(reader,sid);IF a.role_code<>'faculty_supervisor' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FACULTY_ONLY';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'project',p.id,'version',v.id,'round',s.round_number,'title',s.metadata_snapshot->>'title','submittedAt',s.submitted_at) ORDER BY s.submitted_at,s.id),'[]') INTO result FROM app.projects p JOIN app.project_versions v ON v.id=p.current_version_id JOIN app.project_submissions s ON s.version_id=v.id WHERE p.assignment_managed AND p.university_id=a.university_id AND p.supervisor_id=reader AND v.status='pending_review' AND s.id=(SELECT id FROM app.project_submissions WHERE version_id=v.id ORDER BY round_number DESC LIMIT 1);
 RETURN jsonb_build_object('items',result);
END $$;
REVOKE ALL ON FUNCTION app.submission_queue(uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.submission_queue(uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.submission_state(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;issues text[]:='{}';n bigint;result jsonb;last_id uuid;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid,false);IF p.current_version_id IS DISTINCT FROM vid THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT * INTO v FROM app.project_versions WHERE id=vid;
 IF char_length(btrim(coalesce(v.title,''))) NOT BETWEEN 5 AND 200 THEN issues:=array_append(issues,'TITLE');END IF;
 IF char_length(btrim(coalesce(v.abstract,''))) NOT BETWEEN 50 AND 5000 THEN issues:=array_append(issues,'ABSTRACT');END IF;
 IF NOT app.draft_fields_valid(jsonb_build_object('title',coalesce(v.title,''),'abstract',coalesce(v.abstract,''),'keywords',v.keywords,'academic_year',coalesce(v.academic_year,''),'domain',coalesce(v.domain,''))) OR jsonb_array_length(v.keywords) NOT BETWEEN 1 AND 10 THEN issues:=array_append(issues,'METADATA');END IF;
 IF coalesce(v.academic_year,'')='' THEN issues:=array_append(issues,'YEAR');END IF;IF coalesce(v.domain,'') NOT IN ('software','data','hardware') THEN issues:=array_append(issues,'DOMAIN');END IF;
 IF NOT EXISTS(SELECT 1 FROM app.departments WHERE id=p.department_id AND university_id=p.university_id) THEN issues:=array_append(issues,'DEPARTMENT');END IF;
 IF NOT EXISTS(SELECT 1 FROM app.users WHERE id=p.supervisor_id AND university_id=p.university_id AND role_code='faculty_supervisor' AND account_status='active') THEN issues:=array_append(issues,'SUPERVISOR');END IF;
 IF NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid) OR (SELECT count(*) FROM app.project_authors WHERE project_id=pid AND is_team_lead)<>1 OR EXISTS(SELECT 1 FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id WHERE pa.project_id=pid AND (u.role_code<>'student' OR u.account_status<>'active' OR u.university_id<>p.university_id OR u.department_id IS DISTINCT FROM p.department_id OR btrim(u.full_name)='')) THEN issues:=array_append(issues,'AUTHORS');END IF;
 SELECT count(*) INTO n FROM app.project_files WHERE version_id=vid AND is_current AND processing_status='ready';IF n=0 THEN issues:=array_append(issues,'FILES_REQUIRED');END IF;
 IF EXISTS(SELECT 1 FROM app.project_files f LEFT JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=pid AND o.university_id=p.university_id WHERE f.version_id=vid AND f.is_current AND (f.processing_status<>'ready' OR o.id IS NULL OR (f.size_bytes,f.sha256) IS DISTINCT FROM (o.size_bytes,o.sha256))) THEN issues:=array_append(issues,'FILES_NOT_READY');END IF;
 IF EXISTS(SELECT 1 FROM app.file_reservations WHERE project_id=pid AND status='active') OR EXISTS(SELECT 1 FROM app.upload_sessions WHERE project_id=pid AND status='active') THEN issues:=array_append(issues,'ACTIVE_UPLOAD');END IF;
 IF (app.file_quota_value(pid)->>'used')::bigint+(app.file_quota_value(pid)->>'reserved')::bigint>1000000000 OR n>10000 THEN issues:=array_append(issues,'QUOTA');END IF;
 SELECT id INTO last_id FROM app.project_submissions WHERE version_id=vid ORDER BY round_number DESC LIMIT 1;
 RETURN jsonb_build_object('project',pid,'version',vid,'status',v.status,'revision',v.row_version,'assignmentRevision',p.row_version,'issues',issues,'canSubmit',v.status IN ('draft','revision_required') AND cardinality(issues)=0 AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead),'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'round',s.round_number,'submittedAt',s.submitted_at,'decision',r.decision,'comment',r.comment) ORDER BY s.round_number),'[]') FROM app.project_submissions s LEFT JOIN app.review_records r ON r.submission_id=s.id WHERE s.version_id=vid),'latest',last_id);
END $$;
REVOKE ALL ON FUNCTION app.submission_state(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.submission_state(uuid,uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.submission_prepare(reader uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;r app.command_receipts;state jsonb;files jsonb;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid,false);
 IF NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAD_ONLY';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'submission.submit' OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result->>'scope');END IF;
 PERFORM app.file_actor(reader,sid,pid,vid,true);SELECT * INTO v FROM app.project_versions WHERE id=vid;
 IF v.row_version IS DISTINCT FROM expected OR p.row_version IS DISTINCT FROM assignment_expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 PERFORM 1 FROM app.users WHERE id=p.supervisor_id OR id IN (SELECT user_id FROM app.project_authors WHERE project_id=pid) ORDER BY id FOR SHARE;
 state:=app.submission_state(reader,sid,pid,vid);IF jsonb_array_length(state->'issues')>0 THEN RETURN jsonb_build_object('issues',state->'issues');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'key',o.storage_key,'size',f.size_bytes,'sha256',f.sha256) ORDER BY f.canonical_path,f.id),'[]') INTO files FROM app.project_files f JOIN app.storage_objects o ON o.id=f.storage_object_id WHERE f.version_id=vid AND f.is_current AND f.processing_status='ready';
 RETURN jsonb_build_object('files',files);
END $$;
REVOKE ALL ON FUNCTION app.submission_prepare(uuid,uuid,uuid,uuid,integer,integer,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.submission_prepare(uuid,uuid,uuid,uuid,integer,integer,uuid,text) TO capstone_runtime;
CREATE FUNCTION app.submission_commit(reader uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
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
 INSERT INTO app.submission_files(university_id,project_id,version_id,submission_id,file_id,relative_path,visibility_at_submit,sha256_at_submit,storage_object_id,size_at_submit,mime_at_submit,extension_at_submit,uploader_id_at_submit,uploader_name_at_submit,uploader_role_at_submit,uploaded_at_at_submit) SELECT f.university_id,pid,vid,sub,f.id,f.relative_path,f.visibility,f.sha256,f.storage_object_id,f.size_bytes,f.detected_mime,f.extension,f.uploaded_by,u.full_name,coalesce((SELECT actor_role FROM app.audit_logs WHERE object_id=f.id AND action='file.finalize' ORDER BY occurred_at DESC LIMIT 1),u.role_code),f.uploaded_at FROM app.project_files f JOIN app.users u ON u.id=f.uploaded_by WHERE f.version_id=vid AND f.is_current AND f.processing_status='ready';
 UPDATE app.projects SET first_submitted_at=coalesce(first_submitted_at,t) WHERE id=pid;
 UPDATE app.project_versions SET status='pending_review',submitted_at=t,row_version=row_version+1,updated_at=t,updated_by=reader WHERE id=vid;
 result:=jsonb_build_object('id',sub,'round',num,'state','pending_review','revision',expected+1,'project',pid,'version',vid);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state) VALUES(ev,reader,'student',p.university_id,CASE WHEN num=1 THEN 'submission.submit' ELSE 'submission.resubmit' END,'project_submission',sub,pid,vid,command,ev,jsonb_build_object('scope',jsonb_build_object('state',v.status)::text),jsonb_build_object('scope',jsonb_build_object('submission',sub,'round',num,'state','pending_review','metadataHash',encode(sha256(convert_to(meta::text,'UTF8')),'hex'),'authorsHash',encode(sha256(convert_to(authors::text,'UTF8')),'hex'),'fileCount',jsonb_array_length(prepared->'files'))::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(ev,p.supervisor_id,p.university_id,pid,'submission.created',jsonb_build_object('route','/submissions/'||sub::text,'message_key','submission.created'));
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'submission.submit',payload_hash,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.submission_commit(uuid,uuid,uuid,uuid,integer,integer,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.submission_commit(uuid,uuid,uuid,uuid,integer,integer,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.submission_decide(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,operation text,comment_value text,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;v app.project_versions;a app.users;r app.command_receipts;ev uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();state text;result jsonb;
BEGIN
 p:=app.submission_actor(reader,sid,sub);a:=app.assignment_principal(reader,sid);
 IF a.role_code<>'faculty_supervisor' OR p.supervisor_id IS DISTINCT FROM reader THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ASSIGNED_SUPERVISOR_ONLY';END IF;
 IF operation NOT IN ('revision','reject') OR char_length(btrim(comment_value)) NOT BETWEEN 3 AND 2000 OR comment_value ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f‪-‮⁦-⁩]' OR comment_value ~* '(password|secret|token|cookie)[[:space:]]*[:=]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DECISION';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'submission.'||operation OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN (r.result->>'scope')::jsonb;END IF;
 SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO v FROM app.project_versions WHERE id=s.version_id FOR UPDATE;
 IF p.current_version_id IS DISTINCT FROM v.id OR v.status<>'pending_review' OR sub IS DISTINCT FROM (SELECT id FROM app.project_submissions WHERE version_id=v.id ORDER BY round_number DESC LIMIT 1) OR expected IS DISTINCT FROM v.row_version OR assignment_expected IS DISTINCT FROM p.row_version OR EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=sub) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_ROUND';END IF;
 state:=CASE WHEN operation='revision' THEN 'revision_required' ELSE 'rejected' END;
 INSERT INTO app.review_records(id,university_id,project_id,version_id,submission_id,decided_by,decision,comment,decided_at) VALUES(rid,p.university_id,p.id,v.id,sub,reader,state,btrim(comment_value),t);
 UPDATE app.project_versions SET status=state,retained_at=CASE WHEN operation='reject' THEN t ELSE NULL END,row_version=row_version+1,updated_at=t,updated_by=reader WHERE id=v.id;
 result:=jsonb_build_object('id',rid,'submission',sub,'round',s.round_number,'state',state,'revision',expected+1);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,reason,correlation_id,event_key,before_state,after_state) VALUES(ev,reader,a.role_code,p.university_id,'submission.'||operation,'review_record',rid,p.id,v.id,CASE WHEN operation='revision' THEN 'Faculty requested revision' ELSE 'Faculty retained rejection internally' END,command,ev,jsonb_build_object('scope',jsonb_build_object('submission',sub,'round',s.round_number,'state','pending_review')::text),jsonb_build_object('scope',jsonb_build_object('state',state,'commentHash',encode(sha256(convert_to(btrim(comment_value),'UTF8')),'hex'),'commentLength',char_length(btrim(comment_value)))::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,(x->>'id')::uuid,p.university_id,p.id,'review.'||operation,jsonb_build_object('route','/submissions/'||sub::text,'message_key','review.'||operation) FROM jsonb_array_elements(s.authors_snapshot) x;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'submission.'||operation,payload_hash,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.submission_decide(uuid,uuid,uuid,integer,integer,text,text,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.submission_decide(uuid,uuid,uuid,integer,integer,text,text,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.submission_native_read(reader uuid,sid uuid,pid uuid,vid uuid,sub uuid,fid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;result jsonb;
BEGIN
 p:=app.submission_actor(reader,sid,sub);SELECT * INTO s FROM app.project_submissions WHERE id=sub;
 IF s.project_id IS DISTINCT FROM pid OR s.version_id IS DISTINCT FROM vid THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM app.submission_files m LEFT JOIN app.project_files f ON f.id=m.file_id AND f.version_id=m.version_id AND f.project_id=m.project_id LEFT JOIN app.storage_objects o ON o.id=m.storage_object_id AND o.project_id=m.project_id AND o.university_id=m.university_id WHERE m.submission_id=sub AND (fid IS NULL OR m.file_id=fid) AND (f.id IS NULL OR o.id IS NULL OR (m.storage_object_id,m.size_at_submit,m.sha256_at_submit,m.relative_path,m.mime_at_submit,m.extension_at_submit) IS DISTINCT FROM (f.storage_object_id,f.size_bytes,f.sha256,f.relative_path,f.detected_mime,f.extension) OR (m.size_at_submit,m.sha256_at_submit) IS DISTINCT FROM (o.size_bytes,o.sha256))) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='SNAPSHOT_INTEGRITY_FAILED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.file_id,'project',pid,'version',vid,'path',m.relative_path,'name',regexp_replace(m.relative_path,'^.*/',''),'extension',m.extension_at_submit,'mime',m.mime_at_submit,'size',m.size_at_submit,'sha256',m.sha256_at_submit,'visibility',m.visibility_at_submit,'status','ready','uploader',m.uploader_name_at_submit,'uploaderRole',m.uploader_role_at_submit,'uploadedAt',m.uploaded_at_at_submit) || CASE WHEN fid IS NOT NULL THEN jsonb_build_object('key',o.storage_key) ELSE '{}'::jsonb END ORDER BY m.relative_path,m.file_id),'[]') INTO result FROM app.submission_files m JOIN app.storage_objects o ON o.id=m.storage_object_id AND o.project_id=m.project_id AND o.university_id=m.university_id WHERE m.submission_id=sub AND (fid IS NULL OR m.file_id=fid);
 IF fid IS NOT NULL AND jsonb_array_length(result)<>1 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN CASE WHEN fid IS NULL THEN jsonb_build_object('files',result) ELSE result->0 END;
END $$;
REVOKE ALL ON FUNCTION app.submission_native_read(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.submission_native_read(uuid,uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
