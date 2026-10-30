-- Owner R05: immutable semester checkpoints, separate from every legacy FINAL.
ALTER TABLE app.project_submissions ADD COLUMN purpose text NOT NULL DEFAULT 'FINAL' CHECK(purpose IN ('CHECKPOINT','FINAL'));
ALTER TABLE app.project_submissions ADD UNIQUE(university_id,project_id,version_id,id,purpose);
CREATE TABLE app.checkpoint_rounds (
 submission_id uuid PRIMARY KEY,university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,
 purpose text NOT NULL DEFAULT 'CHECKPOINT' CHECK(purpose='CHECKPOINT'),
 contract text NOT NULL DEFAULT 'CHECKPOINT_V1' CHECK(contract='CHECKPOINT_V1'),
 checkpoint_number integer NOT NULL CHECK(checkpoint_number>0),manifest_digest text NOT NULL CHECK(manifest_digest~'^[a-f0-9]{64}$'),
 UNIQUE(version_id,checkpoint_number),UNIQUE(university_id,project_id,version_id,submission_id),
 FOREIGN KEY(university_id,project_id,version_id,submission_id,purpose) REFERENCES app.project_submissions(university_id,project_id,version_id,id,purpose)
);
CREATE TABLE app.checkpoint_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,submission_id uuid NOT NULL UNIQUE,
 actor_id uuid NOT NULL,actor_name text NOT NULL,decision text NOT NULL CHECK(decision IN ('changes_requested','accepted')),
 comment text NOT NULL CHECK(char_length(btrim(comment))<=2000 AND (decision='accepted' OR char_length(btrim(comment))>=3)),decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(university_id,project_id,version_id,submission_id) REFERENCES app.checkpoint_rounds(university_id,project_id,version_id,submission_id),
 FOREIGN KEY(university_id,actor_id) REFERENCES app.users(university_id,id)
);
CREATE TABLE app.semester_command_receipts (
 actor_id uuid NOT NULL REFERENCES app.users(id),command_id uuid NOT NULL,university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('metadata.save','checkpoint.send','checkpoint.changes','checkpoint.accept')),
 payload_digest text NOT NULL CHECK(payload_digest~'^[a-f0-9]{64}$'),result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,command_id),FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id)
);
CREATE TRIGGER immutable_checkpoint_round BEFORE UPDATE OR DELETE ON app.checkpoint_rounds FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_checkpoint_decision BEFORE UPDATE OR DELETE ON app.checkpoint_decisions FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_semester_receipt BEFORE UPDATE OR DELETE ON app.semester_command_receipts FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.checkpoint_rounds,app.checkpoint_decisions,app.semester_command_receipts FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
-- Current membership only for CHECKPOINT. Historical FINAL reader rules retained.
CREATE FUNCTION app.checkpoint_actor(who uuid,sid uuid,sub uuid) RETURNS app.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE s app.project_submissions;p app.projects;
BEGIN
 SELECT * INTO s FROM app.project_submissions WHERE id=sub AND purpose='CHECKPOINT';
 IF s.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 p:=app.file_actor(who,sid,s.project_id,s.version_id,false);RETURN p;
END $$;
ALTER FUNCTION app.submission_actor(uuid,uuid,uuid) RENAME TO final_submission_actor_legacy;
CREATE FUNCTION app.submission_actor(who uuid,sid uuid,sub uuid) RETURNS app.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.project_submissions WHERE id=sub AND purpose='CHECKPOINT') THEN RETURN app.checkpoint_actor(who,sid,sub);END IF;
 RETURN app.final_submission_actor_legacy(who,sid,sub);
END $$;
REVOKE ALL ON FUNCTION app.checkpoint_actor(uuid,uuid,uuid),app.final_submission_actor_legacy(uuid,uuid,uuid),app.submission_actor(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.final_reference_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE sub uuid;
BEGIN
 sub:=(to_jsonb(NEW)->>TG_ARGV[0])::uuid;
 IF sub IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.project_submissions WHERE id=sub AND purpose='FINAL') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='FINAL_REQUIRED';END IF;RETURN NEW;
END $$;
CREATE TRIGGER final_review_only BEFORE INSERT OR UPDATE ON app.review_records FOR EACH ROW EXECUTE FUNCTION app.final_reference_guard('submission_id');
CREATE TRIGGER final_evaluation_only BEFORE INSERT OR UPDATE ON app.evaluation_cases FOR EACH ROW EXECUTE FUNCTION app.final_reference_guard('submission_id');
CREATE TRIGGER final_packet_only BEFORE INSERT OR UPDATE ON app.academic_review_packets FOR EACH ROW EXECUTE FUNCTION app.final_reference_guard('submission_id');
CREATE TRIGGER final_publication_only BEFORE INSERT OR UPDATE OF approved_submission_id ON app.project_versions FOR EACH ROW EXECUTE FUNCTION app.final_reference_guard('approved_submission_id');
REVOKE ALL ON FUNCTION app.final_reference_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER FUNCTION app.submission_read(uuid,uuid,uuid) RENAME TO final_submission_read_legacy;
CREATE FUNCTION app.submission_read(who uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.project_submissions WHERE id=sub AND purpose='FINAL') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN app.final_submission_read_legacy(who,sid,sub)||jsonb_build_object('purpose','FINAL');
END $$;
ALTER FUNCTION app.submission_queue(uuid,uuid) RENAME TO final_submission_queue_legacy;
CREATE FUNCTION app.submission_queue(who uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE old jsonb;
BEGIN
 old:=app.final_submission_queue_legacy(who,sid);
 RETURN jsonb_build_object('purpose','FINAL','items',(SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(old->'items') x WHERE EXISTS(SELECT 1 FROM app.project_submissions WHERE id=(x->>'id')::uuid AND purpose='FINAL')));
END $$;
REVOKE ALL ON FUNCTION app.final_submission_read_legacy(uuid,uuid,uuid),app.final_submission_queue_legacy(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.submission_read(uuid,uuid,uuid),app.submission_queue(uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.submission_read(uuid,uuid,uuid),app.submission_queue(uuid,uuid) TO capstone_runtime;
ALTER FUNCTION app.submission_state(uuid,uuid,uuid,uuid) RENAME TO final_submission_state_legacy;
CREATE FUNCTION app.submission_state(who uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE old jsonb;
BEGIN
 old:=app.final_submission_state_legacy(who,sid,pid,vid);
 RETURN old||jsonb_build_object('purpose','FINAL','contract','FINAL_LEGACY','history',(SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(old->'history') x WHERE EXISTS(SELECT 1 FROM app.project_submissions WHERE id=(x->>'id')::uuid AND purpose='FINAL')),'latest',(SELECT id FROM app.project_submissions WHERE version_id=vid AND purpose='FINAL' ORDER BY round_number DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION app.final_submission_state_legacy(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.submission_state(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.submission_state(uuid,uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.semester_files(pid uuid,vid uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'path',f.relative_path,'size',f.size_bytes,'sha256',f.sha256,'visibility',f.visibility,'mime',f.detected_mime,'policyRevision',f.policy_revision) ORDER BY f.canonical_path,f.id),'[]') FROM app.project_files f WHERE f.project_id=pid AND f.version_id=vid AND f.is_current AND f.processing_status='ready';
$$;
CREATE FUNCTION app.semester_manifest(pid uuid,vid uuid) RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('metadata',jsonb_build_object('title',v.title,'abstract',v.abstract,'keywords',v.keywords,'academicYear',v.academic_year,'domain',v.domain),'supervisor',jsonb_build_object('id',sup.id,'name',sup.full_name),'university',jsonb_build_object('id',un.id,'nameEn',un.name_en,'nameAr',un.name_ar),'department',jsonb_build_object('id',dep.id,'code',dep.code,'nameEn',dep.name_en,'nameAr',dep.name_ar),'authors',(SELECT jsonb_agg(jsonb_build_object('id',a.user_id,'name',u.full_name,'order',a.author_order,'lead',a.is_team_lead) ORDER BY a.author_order) FROM app.project_authors a JOIN app.users u ON u.id=a.user_id WHERE a.project_id=pid),'files',app.semester_files(pid,vid))::text,'UTF8')),'hex') FROM app.projects p JOIN app.project_versions v ON v.id=vid AND v.project_id=p.id JOIN app.users sup ON sup.id=p.supervisor_id JOIN app.universities un ON un.id=p.university_id JOIN app.departments dep ON dep.id=p.department_id WHERE p.id=pid;
$$;
CREATE FUNCTION app.checkpoint_issues(pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;issues text[]:='{}';
BEGIN
 SELECT * INTO p FROM app.projects WHERE id=pid;SELECT * INTO v FROM app.project_versions WHERE id=vid;
 IF v.status NOT IN ('draft','revision_required') OR p.current_version_id IS DISTINCT FROM vid THEN issues:=array_append(issues,'WORKING_LOCKED');END IF;
 IF char_length(btrim(coalesce(v.title,''))) NOT BETWEEN 1 AND 200 THEN issues:=array_append(issues,'TITLE_REQUIRED');END IF;
 IF NOT app.draft_fields_valid(jsonb_build_object('title',coalesce(v.title,''),'abstract',coalesce(v.abstract,''),'keywords',v.keywords,'academic_year',coalesce(v.academic_year,''),'domain',coalesce(v.domain,''))) THEN issues:=array_append(issues,'INVALID_DRAFT');END IF;
 IF NOT EXISTS(SELECT 1 FROM app.users WHERE id=p.supervisor_id AND university_id=p.university_id AND role_code='faculty_supervisor' AND account_status='active') THEN issues:=array_append(issues,'SUPERVISOR_INACTIVE');END IF;
 IF (SELECT count(*) FROM app.project_authors WHERE project_id=pid AND is_team_lead)<>1 OR NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid) OR EXISTS(SELECT 1 FROM app.project_authors a JOIN app.users u ON u.id=a.user_id WHERE a.project_id=pid AND (u.account_status<>'active' OR u.role_code<>'student' OR u.university_id<>p.university_id OR u.department_id IS DISTINCT FROM p.department_id)) THEN issues:=array_append(issues,'TEAM_INACTIVE');END IF;
 IF NOT EXISTS(SELECT 1 FROM app.project_files WHERE version_id=vid AND is_current AND processing_status='ready') THEN issues:=array_append(issues,'FILES_REQUIRED');END IF;
 IF EXISTS(SELECT 1 FROM app.project_files f LEFT JOIN app.storage_objects o ON o.id=f.storage_object_id WHERE f.version_id=vid AND f.is_current AND (f.processing_status<>'ready' OR o.id IS NULL OR (o.university_id,o.project_id,o.size_bytes,o.sha256) IS DISTINCT FROM (f.university_id,f.project_id,f.size_bytes,f.sha256))) THEN issues:=array_append(issues,'FILES_NOT_READY');END IF;
 IF EXISTS(SELECT 1 FROM app.file_reservations WHERE project_id=pid AND status='active') OR EXISTS(SELECT 1 FROM app.upload_sessions WHERE project_id=pid AND status='active') THEN issues:=array_append(issues,'ACTIVE_UPLOAD');END IF;
 IF (app.file_quota_value(pid)->>'used')::bigint+(app.file_quota_value(pid)->>'reserved')::bigint>1000000000 OR (SELECT count(*) FROM app.project_files WHERE version_id=vid AND is_current)>10000 THEN issues:=array_append(issues,'QUOTA');END IF;
 RETURN to_jsonb(issues);
END $$;
REVOKE ALL ON FUNCTION app.semester_files(uuid,uuid),app.semester_manifest(uuid,uuid),app.checkpoint_issues(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.semester_receipt(who uuid,sid uuid,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.semester_command_receipts;
BEGIN
 PERFORM app.assignment_principal(who,sid);SELECT * INTO r FROM app.semester_command_receipts WHERE actor_id=who AND command_id=command;
 IF r.command_id IS NULL THEN RETURN NULL;END IF;
 PERFORM app.file_actor(who,sid,r.project_id,r.version_id,false);RETURN r.result;
END $$;
CREATE FUNCTION app.semester_metadata_save(who uuid,sid uuid,pid uuid,vid uuid,expected integer,fields jsonb,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;r app.semester_command_receipts;digest text;result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));p:=app.file_actor(who,sid,pid,vid,false);
 IF NOT EXISTS(SELECT 1 FROM app.users WHERE id=who AND role_code='student') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHOR_ONLY';END IF;
 IF command IS NULL OR expected IS NULL OR expected<0 OR NOT app.draft_fields_valid(fields) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_object('contract','SEMESTER_V1','operation','metadata.save','project',pid,'version',vid,'revision',expected,'fields',fields)::text,'UTF8')),'hex');
 SELECT * INTO r FROM app.semester_command_receipts WHERE actor_id=who AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.operation<>'metadata.save' OR r.payload_digest<>digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN r.result;END IF;
 PERFORM app.draft_save_command(who,sid,pid,vid,expected,fields);
 result:=jsonb_build_object('operation','metadata.save','project',pid,'version',vid,'revision',expected+1);
 INSERT INTO app.semester_command_receipts(actor_id,command_id,university_id,project_id,version_id,operation,payload_digest,result) VALUES(who,command,p.university_id,pid,vid,'metadata.save',digest,result);RETURN result;
END $$;
CREATE FUNCTION app.checkpoint_prepare(who uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,manifest text,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;r app.semester_command_receipts;digest text;issues jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));p:=app.edition_lead(who,sid,pid,vid);
 IF command IS NULL OR expected IS NULL OR expected<0 OR assignment_expected IS NULL OR assignment_expected<0 OR manifest IS NULL OR manifest!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_object('contract','CHECKPOINT_V1','operation','checkpoint.send','project',pid,'version',vid,'revision',expected,'assignmentRevision',assignment_expected,'manifestDigest',manifest)::text,'UTF8')),'hex');
 SELECT * INTO r FROM app.semester_command_receipts WHERE actor_id=who AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.operation<>'checkpoint.send' OR r.payload_digest<>digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result);END IF;
 PERFORM app.file_actor(who,sid,pid,vid,true);SELECT * INTO v FROM app.project_versions WHERE id=vid;
 PERFORM 1 FROM app.users WHERE id=p.supervisor_id OR id IN (SELECT user_id FROM app.project_authors WHERE project_id=pid) ORDER BY id FOR SHARE;
 IF expected<>v.row_version OR assignment_expected<>p.row_version OR manifest<>app.semester_manifest(pid,vid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 issues:=app.checkpoint_issues(pid,vid);IF jsonb_array_length(issues)>0 THEN RETURN jsonb_build_object('issues',issues);END IF;
 RETURN jsonb_build_object('digest',digest,'files',(SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256) ORDER BY f.canonical_path,f.id) FROM app.project_files f JOIN app.storage_objects o ON o.id=f.storage_object_id WHERE f.version_id=vid AND f.is_current));
END $$;
REVOKE ALL ON FUNCTION app.semester_receipt(uuid,uuid,uuid),app.semester_metadata_save(uuid,uuid,uuid,uuid,integer,jsonb,uuid),app.checkpoint_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.semester_receipt(uuid,uuid,uuid),app.semester_metadata_save(uuid,uuid,uuid,uuid,integer,jsonb,uuid),app.checkpoint_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.checkpoint_commit(who uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,manifest text,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prep jsonb;p app.projects;v app.project_versions;meta jsonb;authors jsonb;sub uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();global_number integer;number integer;t timestamptz:=clock_timestamp();result jsonb;
BEGIN
 prep:=app.checkpoint_prepare(who,sid,pid,vid,expected,assignment_expected,manifest,command);
 IF prep ? 'completed' THEN RETURN prep->'completed';END IF;
 IF prep ? 'issues' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CHECKPOINT_NOT_READY';END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid;SELECT * INTO v FROM app.project_versions WHERE id=vid;
 SELECT jsonb_build_object('title',coalesce(v.title,''),'abstract',coalesce(v.abstract,''),'keywords',v.keywords,'academicYear',coalesce(v.academic_year,''),'domain',coalesce(v.domain,''),'university',jsonb_build_object('id',u.id,'nameEn',u.name_en,'nameAr',u.name_ar),'department',jsonb_build_object('id',d.id,'code',d.code,'nameEn',d.name_en,'nameAr',d.name_ar),'supervisor',jsonb_build_object('id',s.id,'name',s.full_name),'version',jsonb_build_object('id',v.id,'number',v.version_number),'license',jsonb_build_object('identifier',v.license_identifier,'state',CASE WHEN v.generated_license_file_id IS NOT NULL THEN 'generated' ELSE 'none' END,'noticeKey','rights.noTransfer')) INTO meta FROM app.universities u JOIN app.departments d ON d.id=p.department_id AND d.university_id=u.id JOIN app.users s ON s.id=p.supervisor_id WHERE u.id=p.university_id;
 SELECT jsonb_agg(jsonb_build_object('id',a.user_id,'name',u.full_name,'order',a.author_order,'lead',a.is_team_lead) ORDER BY a.author_order) INTO authors FROM app.project_authors a JOIN app.users u ON u.id=a.user_id WHERE a.project_id=pid;
 SELECT coalesce(max(round_number),0)+1 INTO global_number FROM app.project_submissions WHERE version_id=vid;
 SELECT coalesce(max(checkpoint_number),0)+1 INTO number FROM app.checkpoint_rounds WHERE version_id=vid;
 INSERT INTO app.project_submissions(id,university_id,project_id,version_id,round_number,submitted_by,submitted_at,metadata_snapshot,authors_snapshot,purpose) VALUES(sub,p.university_id,pid,vid,global_number,who,t,meta,authors,'CHECKPOINT');
 INSERT INTO app.checkpoint_rounds(submission_id,university_id,project_id,version_id,checkpoint_number,manifest_digest) VALUES(sub,p.university_id,pid,vid,number,manifest);
 INSERT INTO app.submission_files(university_id,project_id,version_id,submission_id,file_id,relative_path,visibility_at_submit,sha256_at_submit,storage_object_id,size_at_submit,mime_at_submit,extension_at_submit,uploader_id_at_submit,uploader_name_at_submit,uploader_role_at_submit,uploaded_at_at_submit) SELECT f.university_id,pid,vid,sub,f.id,f.relative_path,f.visibility,f.sha256,f.storage_object_id,f.size_bytes,f.detected_mime,f.extension,f.uploaded_by,coalesce(f.source_uploader_name,u.full_name),coalesce(f.source_uploader_role,u.role_code),f.uploaded_at FROM app.project_files f JOIN app.users u ON u.id=f.uploaded_by WHERE f.version_id=vid AND f.is_current AND f.processing_status='ready';
 UPDATE app.project_versions SET status='pending_review',row_version=row_version+1,updated_at=t,updated_by=who WHERE id=vid;
 result:=jsonb_build_object('operation','checkpoint.send','project',pid,'version',vid,'submission',sub,'number',number,'state','awaiting_review','revision',expected+1);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state) VALUES(ev,who,'student',p.university_id,'checkpoint.send','checkpoint_round',sub,pid,vid,command,ev,jsonb_build_object('scope',jsonb_build_object('state',v.status)::text),jsonb_build_object('scope',jsonb_build_object('number',number,'manifestDigest',manifest,'purpose','CHECKPOINT','fileCount',jsonb_array_length(prep->'files'))::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(ev,p.supervisor_id,p.university_id,pid,'checkpoint.sent',jsonb_build_object('route','/supervision/rounds/'||sub::text,'message_key','checkpoint.sent'));
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.semester_command_receipts(actor_id,command_id,university_id,project_id,version_id,operation,payload_digest,result) VALUES(who,command,p.university_id,pid,vid,'checkpoint.send',prep->>'digest',result);RETURN result;
END $$;
CREATE FUNCTION app.checkpoint_decide(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,operation text,note text,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;v app.project_versions;a app.users;r app.semester_command_receipts;digest text;decision text;result jsonb;ev uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));p:=app.checkpoint_actor(who,sid,sub);a:=app.assignment_principal(who,sid);
 IF a.role_code<>'faculty_supervisor' OR p.supervisor_id IS DISTINCT FROM who THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ASSIGNED_SUPERVISOR_ONLY';END IF;
 note:=btrim(note);
 IF command IS NULL OR operation IS NULL OR operation NOT IN ('checkpoint.changes','checkpoint.accept') OR expected IS NULL OR expected<0 OR assignment_expected IS NULL OR assignment_expected<0 OR note IS NULL OR char_length(note)>2000 OR (operation='checkpoint.changes' AND (char_length(note)<3 OR note!~'[[:alnum:]]')) OR note ~ '[[:cntrl:]‪-‮⁦-⁩]' OR note ~* '(password|secret|token|cookie)[[:space:]]*[:=]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DECISION';END IF;
 digest:=encode(sha256(convert_to(jsonb_build_object('contract','CHECKPOINT_V1','operation',operation,'submission',sub,'revision',expected,'assignmentRevision',assignment_expected,'comment',note)::text,'UTF8')),'hex');
 SELECT * INTO r FROM app.semester_command_receipts WHERE actor_id=who AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.operation<>operation OR r.payload_digest<>digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN r.result;END IF;
 SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO v FROM app.project_versions WHERE id=s.version_id FOR UPDATE;
 IF p.current_version_id IS DISTINCT FROM v.id OR v.status<>'pending_review' OR expected<>v.row_version OR assignment_expected<>p.row_version OR EXISTS(SELECT 1 FROM app.checkpoint_decisions WHERE submission_id=sub) OR sub IS DISTINCT FROM (SELECT id FROM app.project_submissions WHERE version_id=v.id ORDER BY round_number DESC LIMIT 1) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_ROUND';END IF;
 decision:=CASE WHEN operation='checkpoint.changes' THEN 'changes_requested' ELSE 'accepted' END;
 INSERT INTO app.checkpoint_decisions(id,university_id,project_id,version_id,submission_id,actor_id,actor_name,decision,comment,decided_at) VALUES(rid,p.university_id,p.id,v.id,sub,who,a.full_name,decision,note,t);
 UPDATE app.project_versions SET status='draft',row_version=row_version+1,updated_at=t,updated_by=who WHERE id=v.id;
 result:=jsonb_build_object('operation',operation,'project',p.id,'version',v.id,'submission',sub,'state',decision,'revision',expected+1);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state) VALUES(ev,who,a.role_code,p.university_id,operation,'checkpoint_decision',rid,p.id,v.id,command,ev,jsonb_build_object('scope','awaiting_review'),jsonb_build_object('scope',jsonb_build_object('submission',sub,'decision',decision,'commentHash',encode(sha256(convert_to(note,'UTF8')),'hex'),'workingState','draft')::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,user_id,p.university_id,p.id,operation,jsonb_build_object('route','/projects/'||p.id::text||'/reviews','message_key',operation) FROM app.project_authors WHERE project_id=p.id;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.semester_command_receipts(actor_id,command_id,university_id,project_id,version_id,operation,payload_digest,result) VALUES(who,command,p.university_id,p.id,v.id,operation,digest,result);RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.checkpoint_commit(uuid,uuid,uuid,uuid,integer,integer,text,uuid),app.checkpoint_decide(uuid,uuid,uuid,integer,integer,text,text,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.checkpoint_commit(uuid,uuid,uuid,uuid,integer,integer,text,uuid),app.checkpoint_decide(uuid,uuid,uuid,integer,integer,text,text,uuid) TO capstone_runtime;
