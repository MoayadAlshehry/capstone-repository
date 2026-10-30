-- Explicit generation only; existing root license variants always block generation.
ALTER TABLE app.project_versions ADD COLUMN generated_license_file_id uuid,
 ADD COLUMN license_template_hash text,
 ADD COLUMN license_inputs_hash text;
ALTER TABLE app.project_versions ADD FOREIGN KEY(university_id,project_id,id,generated_license_file_id) REFERENCES app.project_files(university_id,project_id,version_id,id);
CREATE FUNCTION app.license_state(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;files jsonb;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid,false);
 IF p.current_version_id IS DISTINCT FROM vid THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT * INTO v FROM app.project_versions WHERE id=vid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'path',relative_path,'sha256',sha256,'size',size_bytes) ORDER BY canonical_path),'[]') INTO files FROM app.project_files WHERE version_id=vid AND is_current AND processing_status='ready' AND canonical_path IN ('license','license.txt','license.md');
 RETURN jsonb_build_object('identifier',v.license_identifier,'generatedFile',v.generated_license_file_id,'revision',v.row_version,'assignmentRevision',p.row_version,'files',files,'canGenerate',v.status IN ('draft','revision_required') AND jsonb_array_length(files)=0 AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead));
END $$;
REVOKE ALL ON FUNCTION app.license_state(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.license_state(uuid,uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.license_begin(reader uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,command uuid,payload_hash text,bytes bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;r app.command_receipts;reservation jsonb;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid);
 IF NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAD_ONLY';END IF;
 SELECT * INTO v FROM app.project_versions WHERE id=vid;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN
  IF r.action<>'license.generate' OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('completed',r.result->>'scope');
 END IF;
 IF v.row_version IS DISTINCT FROM expected OR p.row_version IS DISTINCT FROM assignment_expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
 IF v.license_identifier IS NOT NULL OR EXISTS(SELECT 1 FROM app.project_files WHERE version_id=vid AND is_current AND canonical_path IN ('license','license.txt','license.md')) OR EXISTS(SELECT 1 FROM app.file_reservations WHERE version_id=vid AND status='active' AND expires_at>clock_timestamp() AND canonical_path IN ('license','license.txt','license.md')) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='EXISTING_LICENSE';END IF;
 reservation:=app.file_reserve(reader,sid,pid,vid,'LICENSE','',bytes,command);
 RETURN jsonb_build_object('reservation',reservation->>'id','key',(SELECT staging_key FROM app.file_reservations WHERE id=(reservation->>'id')::uuid));
END $$;
REVOKE ALL ON FUNCTION app.license_begin(uuid,uuid,uuid,uuid,integer,integer,uuid,text,bigint) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.license_begin(uuid,uuid,uuid,uuid,integer,integer,uuid,text,bigint) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.license_commit(reader uuid,sid uuid,pid uuid,vid uuid,command uuid,payload_hash text,identifier text,template_hash text,inputs_hash text,fid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;f app.project_files;ev uuid:=gen_random_uuid();result jsonb;rev integer;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid);
 IF NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader AND is_team_lead) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAD_ONLY';END IF;
 SELECT * INTO f FROM app.project_files WHERE id=fid AND project_id=pid AND version_id=vid AND relative_path='LICENSE' AND is_current AND processing_status='ready' AND uploaded_by=reader AND visibility='restricted';
 IF f.id IS NULL OR identifier NOT IN ('MIT','Apache-2.0','BSD-3-Clause','GPL-3.0-only') OR template_hash !~ '^[a-f0-9]{64}$' OR inputs_hash !~ '^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM app.file_reservations WHERE file_id=fid AND uploader_id=reader AND correlation_id=command AND status='finalized') OR EXISTS(SELECT 1 FROM app.project_files WHERE version_id=vid AND is_current AND canonical_path IN ('license','license.txt','license.md') AND id<>fid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='LICENSE_CONFLICT';END IF;
 UPDATE app.project_versions SET license_identifier=identifier,generated_license_file_id=fid,license_template_hash=template_hash,license_inputs_hash=inputs_hash,row_version=row_version+1,updated_at=clock_timestamp(),updated_by=reader WHERE id=vid AND license_identifier IS NULL RETURNING row_version INTO rev;
 IF rev IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='LICENSE_CONFLICT';END IF;
 result:=jsonb_build_object('identifier',identifier,'fileId',fid,'sha256',f.sha256,'size',f.size_bytes,'revision',rev);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state) VALUES(ev,reader,'student',p.university_id,'license.generate','project_version',vid,pid,vid,command,ev,jsonb_build_object('scope','{"identifier":null}'),jsonb_build_object('scope',(result||jsonb_build_object('templateHash',template_hash,'inputsHash',inputs_hash))::text));
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'license.generate',payload_hash,ev,jsonb_build_object('scope',result::text));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.license_commit(uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.license_commit(uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid) TO capstone_runtime;
--> statement-breakpoint
-- Ordinary manual uploads may supersede a generated mapping, but never retain its declaration.
CREATE FUNCTION app.license_manual_precedence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE v app.project_versions;ev uuid:=gen_random_uuid();
BEGIN
 IF NEW.is_current AND NEW.processing_status='ready' AND NEW.canonical_path IN ('license','license.txt','license.md') THEN
  SELECT * INTO v FROM app.project_versions WHERE id=NEW.version_id FOR UPDATE;
  IF v.generated_license_file_id IS NOT NULL THEN
   UPDATE app.project_files SET is_current=false WHERE id=v.generated_license_file_id AND id<>NEW.id AND is_current;
   UPDATE app.project_versions SET license_identifier=NULL,generated_license_file_id=NULL,license_template_hash=NULL,license_inputs_hash=NULL,row_version=row_version+1,updated_at=clock_timestamp(),updated_by=NEW.uploaded_by WHERE id=NEW.version_id;
   INSERT INTO app.audit_logs(actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state) SELECT NEW.uploaded_by,role_code,NEW.university_id,'license.manual.precedence','project_version',NEW.version_id,NEW.project_id,NEW.version_id,ev,ev,jsonb_build_object('scope',jsonb_build_object('identifier',v.license_identifier)::text),jsonb_build_object('scope',jsonb_build_object('identifier',NULL,'fileId',NEW.id,'sha256',NEW.sha256)::text) FROM app.users WHERE id=NEW.uploaded_by;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER license_manual_precedence AFTER INSERT ON app.project_files FOR EACH ROW EXECUTE FUNCTION app.license_manual_precedence();
REVOKE ALL ON FUNCTION app.license_manual_precedence() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.license_cleanup_key(reader uuid,sid uuid,pid uuid,vid uuid,k uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.file_actor(reader,sid,pid,vid,false);
 RETURN NOT EXISTS(SELECT 1 FROM app.storage_objects WHERE storage_key=k) AND NOT EXISTS(SELECT 1 FROM app.file_reservations WHERE staging_key=k);
END $$;
REVOKE ALL ON FUNCTION app.license_cleanup_key(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.license_cleanup_key(uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.license_consistency() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE vid uuid;v app.project_versions;
BEGIN
 IF TG_TABLE_NAME='project_versions' THEN vid:=NEW.id;ELSE vid:=NEW.version_id;END IF;
 SELECT * INTO v FROM app.project_versions WHERE id=vid;
 IF v.generated_license_file_id IS NOT NULL AND (v.license_identifier IS NULL OR v.license_identifier NOT IN ('MIT','Apache-2.0','BSD-3-Clause','GPL-3.0-only') OR v.license_template_hash IS NULL OR v.license_inputs_hash IS NULL OR NOT EXISTS(SELECT 1 FROM app.project_files WHERE id=v.generated_license_file_id AND version_id=vid AND relative_path='LICENSE' AND is_current AND processing_status='ready')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LICENSE_INCONSISTENT';END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER version_license_consistency AFTER INSERT OR UPDATE ON app.project_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.license_consistency();
CREATE CONSTRAINT TRIGGER file_license_consistency AFTER INSERT OR UPDATE ON app.project_files DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.license_consistency();
REVOKE ALL ON FUNCTION app.license_consistency() FROM PUBLIC,capstone_runtime,capstone_jobs;
