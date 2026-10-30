-- Separate safe reservation IDs from private physical keys.
ALTER TABLE app.file_reservations ADD COLUMN staging_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;
CREATE OR REPLACE FUNCTION app.file_access(reader uuid,sid uuid,rid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.file_reservations; p app.projects;
BEGIN
 SELECT * INTO r FROM app.file_reservations WHERE id=rid AND uploader_id=reader;
 IF r.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 p:=app.file_actor(reader,sid,r.project_id,r.version_id);SELECT * INTO r FROM app.file_reservations WHERE id=rid FOR UPDATE;
 IF r.status='finalized' THEN RETURN jsonb_build_object('status',r.status,'fileId',r.file_id);END IF;
 IF r.status<>'active' OR r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INACTIVE_RESERVATION';END IF;
 RETURN jsonb_build_object('status',r.status,'id',r.id,'key',r.staging_key,'project',r.project_id,'version',r.version_id,'path',r.relative_path,'extension',r.extension,'expected',r.expected_bytes);
END $$;
REVOKE ALL ON FUNCTION app.file_access(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_access(uuid,uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.file_finalize(reader uuid,sid uuid,rid uuid,size bigint,digest text,mime text,reused uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.file_reservations;o app.storage_objects;old app.project_files;fid uuid:=gen_random_uuid();q jsonb;a app.users;
BEGIN
 PERFORM app.file_access(reader,sid,rid);SELECT * INTO r FROM app.file_reservations WHERE id=rid;
 IF r.status='finalized' THEN RETURN jsonb_build_object('fileId',r.file_id,'status','ready','visibility','restricted');END IF;
 IF size IS DISTINCT FROM r.expected_bytes OR size NOT BETWEEN 0 AND 250000000 OR digest !~ '^[a-f0-9]{64}$' OR char_length(mime) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MEASURED_FILE';END IF;
 q:=app.file_quota_value(r.project_id);
 IF reused IS NOT NULL THEN SELECT * INTO o FROM app.storage_objects WHERE id=reused AND project_id=r.project_id AND university_id=r.university_id AND size_bytes=size AND sha256=digest;IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_REUSE';END IF;
 ELSE
 IF (q->>'used')::bigint+(q->>'reserved')::bigint>1000000000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='QUOTA_LIMIT';END IF;
 INSERT INTO app.storage_objects(university_id,project_id,storage_key,size_bytes,sha256) VALUES(r.university_id,r.project_id,r.staging_key,size,digest) RETURNING * INTO o;
 END IF;
 SELECT * INTO old FROM app.project_files WHERE version_id=r.version_id AND canonical_path=r.canonical_path AND is_current FOR UPDATE;
 IF old.id IS NULL AND (SELECT count(*) FROM app.project_files WHERE version_id=r.version_id AND is_current)>=10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PATH_LIMIT';END IF;
 UPDATE app.project_files SET is_current=false WHERE id=old.id;
 INSERT INTO app.project_files(id,university_id,project_id,version_id,storage_object_id,relative_path,original_name,extension,detected_mime,size_bytes,sha256,uploaded_by,supersedes_file_id,processing_status,visibility)
 VALUES(fid,r.university_id,r.project_id,r.version_id,o.id,r.relative_path,regexp_replace(r.relative_path,'^.*/',''),r.extension,mime,size,digest,reader,old.id,'ready','restricted');
 UPDATE app.file_reservations SET status='finalized',file_id=fid WHERE id=rid;
 SELECT * INTO a FROM app.users WHERE id=reader;
 INSERT INTO app.audit_logs(actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,after_state) VALUES(reader,a.role_code,r.university_id,'file.finalize','project_file',fid,r.project_id,r.version_id,r.correlation_id,r.id,jsonb_build_object('scope',jsonb_build_object('size',size,'sha256',digest,'visibility','restricted')::text));
 RETURN jsonb_build_object('fileId',fid,'objectId',o.id,'sizeBytes',size,'sha256',digest,'status','ready','visibility','restricted','reused',reused IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION app.file_finalize(uuid,uuid,uuid,bigint,text,text,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_finalize(uuid,uuid,uuid,bigint,text,text,uuid) TO capstone_runtime;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.file_cleanup(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.file_actor(reader,sid,pid,vid,false);
 UPDATE app.file_reservations SET status='expired' WHERE project_id=pid AND status='active' AND expires_at<=clock_timestamp();
 RETURN QUERY SELECT r.staging_key FROM app.file_reservations r WHERE r.project_id=pid AND r.status IN ('expired','cancelled','failed') AND NOT EXISTS(SELECT 1 FROM app.storage_objects o WHERE o.storage_key=r.staging_key) AND NOT EXISTS(SELECT 1 FROM app.project_files f WHERE f.storage_object_id=r.staging_key) FOR UPDATE;
END $$;
REVOKE ALL ON FUNCTION app.file_cleanup(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_cleanup(uuid,uuid,uuid,uuid) TO capstone_runtime;
