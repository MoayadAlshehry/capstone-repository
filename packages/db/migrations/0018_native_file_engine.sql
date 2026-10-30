-- Phase14 policy/engine only. No tus transport or public file routes.
CREATE TABLE app.storage_objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL, project_id uuid NOT NULL,
 storage_key uuid NOT NULL UNIQUE, size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 0 AND 250000000), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(university_id,project_id,id), UNIQUE(project_id,size_bytes,sha256), FOREIGN KEY(university_id,project_id) REFERENCES app.projects(university_id,id)
);
CREATE FUNCTION app.storage_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable storage object';END $$;
CREATE TRIGGER immutable_storage BEFORE UPDATE OR DELETE ON app.storage_objects FOR EACH ROW EXECUTE FUNCTION app.storage_identity_guard();
REVOKE ALL ON app.storage_objects FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.storage_identity_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER TABLE app.project_files ADD COLUMN canonical_path text GENERATED ALWAYS AS (lower(normalize(relative_path,NFC))) STORED;
CREATE UNIQUE INDEX current_file_canonical ON app.project_files(version_id,canonical_path) WHERE is_current;
ALTER TABLE app.project_files ADD CONSTRAINT file_storage_scope FOREIGN KEY(university_id,project_id,storage_object_id) REFERENCES app.storage_objects(university_id,project_id,id);
ALTER TABLE app.project_files ADD CONSTRAINT file_size_limit CHECK(size_bytes<=250000000), ADD CONSTRAINT file_path_limit CHECK(char_length(relative_path)<=512);
--> statement-breakpoint
CREATE TABLE app.file_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL, project_id uuid NOT NULL, version_id uuid NOT NULL, uploader_id uuid NOT NULL,
 relative_path text NOT NULL, canonical_path text GENERATED ALWAYS AS (lower(normalize(relative_path,NFC))) STORED,
 extension text NOT NULL, expected_bytes bigint NOT NULL CHECK(expected_bytes BETWEEN 0 AND 250000000), correlation_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','finalized','cancelled','failed','expired')), created_at timestamptz NOT NULL DEFAULT clock_timestamp(), activity_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '24 hours', file_id uuid,
 UNIQUE(uploader_id,correlation_id), FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id), FOREIGN KEY(university_id,uploader_id) REFERENCES app.users(university_id,id), FOREIGN KEY(university_id,project_id,version_id,file_id) REFERENCES app.project_files(university_id,project_id,version_id,id), CHECK((status='finalized')=(file_id IS NOT NULL))
);
CREATE UNIQUE INDEX active_reserved_path ON app.file_reservations(version_id,canonical_path) WHERE status='active';
REVOKE ALL ON app.file_reservations FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.native_path_valid(path text,ext text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app AS $$
DECLARE segment text; name text; actual text;
BEGIN
 IF char_length(path) NOT BETWEEN 1 AND 512 OR path ~ '(^/|^[A-Za-z]:|\\|[[:cntrl:]<>:"|?*‪-‮⁦-⁩])' THEN RETURN false; END IF;
 FOREACH segment IN ARRAY string_to_array(path,'/') LOOP
  IF segment IN ('','.','..') OR segment ~ '(^[[:space:]]|[. ]$)' OR lower(segment) IN ('.git','node_modules','vendor','dist','build') OR segment ~* '^\.env([._-].*)?$' OR segment ~* '^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)' THEN RETURN false;END IF;
 END LOOP;
 name:=segment;actual:=CASE WHEN lower(name)='.gitignore' THEN 'gitignore' WHEN name LIKE '%.%' THEN lower(regexp_replace(name,'^.*\.','')) ELSE '' END;
 RETURN actual=ext AND (ext=ANY(string_to_array('pdf docx pptx csv txt md png jpg jpeg webp mp4 mp3 wav ts tsx js jsx mjs cjs py java c h cpp hpp cs go rs php rb swift kt kts dart r m sh ps1 sql html css scss sass less vue svelte json yml yaml toml xml ini ipynb gitignore',' ')) OR (ext='' AND name IN ('README','LICENSE','Dockerfile','Makefile')));
END $$;
REVOKE ALL ON FUNCTION app.native_path_valid(text,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER TABLE app.file_reservations ADD CONSTRAINT native_reserved_path CHECK(app.native_path_valid(relative_path,extension));
--> statement-breakpoint
CREATE FUNCTION app.file_actor(reader uuid,sid uuid,pid uuid,vid uuid,editable boolean DEFAULT true) RETURNS app.projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;p app.projects;v app.project_versions;
BEGIN
 a:=app.assignment_principal(reader,sid);
 PERFORM 1 FROM app.universities WHERE id=a.university_id AND status='active' FOR SHARE;
 SELECT * INTO p FROM app.projects WHERE id=pid AND university_id=a.university_id AND assignment_managed FOR UPDATE;
 IF p.id IS NULL OR NOT ((a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader)) OR (a.role_code='faculty_supervisor' AND p.supervisor_id=reader) OR (NOT editable AND a.role_code='university_admin')) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND'; END IF;
 PERFORM 1 FROM app.users WHERE id=reader FOR SHARE;PERFORM 1 FROM app.auth_sessions WHERE id=sid AND user_id=reader AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;a:=app.assignment_principal(reader,sid);
 SELECT * INTO v FROM app.project_versions WHERE id=vid AND project_id=pid AND university_id=a.university_id FOR UPDATE;
 IF v.id IS NULL OR (editable AND (p.current_version_id IS DISTINCT FROM vid OR v.status NOT IN ('draft','revision_required'))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LOCKED'; END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION app.file_actor(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.file_quota_value(pid uuid) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog,app AS $$
 WITH usage AS (SELECT coalesce(sum(size_bytes),0)::bigint used FROM app.storage_objects WHERE project_id=pid), held AS (SELECT coalesce(sum(expected_bytes),0)::bigint reserved FROM app.file_reservations WHERE project_id=pid AND status='active' AND expires_at>clock_timestamp()) SELECT jsonb_build_object('used',used,'reserved',reserved,'available',1000000000-used-reserved,'limit',1000000000) FROM usage,held;
$$;
REVOKE ALL ON FUNCTION app.file_quota_value(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.file_quota(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN PERFORM app.file_actor(reader,sid,pid,vid,false);RETURN app.file_quota_value(pid)||jsonb_build_object('currentFiles',(SELECT count(*) FROM app.project_files WHERE version_id=vid AND is_current AND processing_status='ready'));END $$;
REVOKE ALL ON FUNCTION app.file_quota(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_quota(uuid,uuid,uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.file_reserve(reader uuid,sid uuid,pid uuid,vid uuid,path text,ext text,expected bigint,correlation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;r app.file_reservations;q jsonb;count_paths bigint;old_path text;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid);
 IF NOT app.native_path_valid(path,ext) OR expected NOT BETWEEN 0 AND 250000000 OR correlation IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FILE';END IF;
 UPDATE app.file_reservations SET status='expired' WHERE project_id=pid AND status='active' AND expires_at<=clock_timestamp();
 SELECT * INTO r FROM app.file_reservations WHERE uploader_id=reader AND correlation_id=correlation FOR UPDATE;
 IF r.id IS NOT NULL THEN IF (r.project_id,r.version_id,r.relative_path,r.expected_bytes) IS DISTINCT FROM (pid,vid,path,expected) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('id',r.id,'status',r.status,'expectedBytes',r.expected_bytes,'expiresAt',r.expires_at);END IF;
 SELECT relative_path INTO old_path FROM app.project_files WHERE version_id=vid AND canonical_path=lower(normalize(path,NFC)) AND is_current;
 IF old_path IS NOT NULL AND old_path<>path THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AMBIGUOUS_PATH';END IF;
 IF EXISTS(SELECT 1 FROM app.file_reservations WHERE version_id=vid AND canonical_path=lower(normalize(path,NFC)) AND status='active') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='PATH_RESERVED';END IF;
 SELECT count(*) INTO count_paths FROM (SELECT canonical_path FROM app.project_files WHERE version_id=vid AND is_current UNION SELECT canonical_path FROM app.file_reservations WHERE version_id=vid AND status='active') paths;
 IF old_path IS NULL AND count_paths>=10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PATH_LIMIT';END IF;
 q:=app.file_quota_value(pid);IF (q->>'used')::bigint+(q->>'reserved')::bigint+expected>1000000000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='QUOTA_LIMIT';END IF;
 INSERT INTO app.file_reservations(university_id,project_id,version_id,uploader_id,relative_path,extension,expected_bytes,correlation_id) VALUES(p.university_id,pid,vid,reader,path,ext,expected,correlation) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'expectedBytes',r.expected_bytes,'expiresAt',r.expires_at);
END $$;
REVOKE ALL ON FUNCTION app.file_reserve(uuid,uuid,uuid,uuid,text,text,bigint,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_reserve(uuid,uuid,uuid,uuid,text,text,bigint,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.file_access(reader uuid,sid uuid,rid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.file_reservations; p app.projects;
BEGIN
 SELECT * INTO r FROM app.file_reservations WHERE id=rid AND uploader_id=reader;
 IF r.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 p:=app.file_actor(reader,sid,r.project_id,r.version_id);SELECT * INTO r FROM app.file_reservations WHERE id=rid FOR UPDATE;
 IF r.status='finalized' THEN RETURN jsonb_build_object('status',r.status,'fileId',r.file_id);END IF;
 IF r.status<>'active' OR r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INACTIVE_RESERVATION';END IF;
 RETURN jsonb_build_object('status',r.status,'id',r.id,'project',r.project_id,'version',r.version_id,'path',r.relative_path,'extension',r.extension,'expected',r.expected_bytes);
END $$;
REVOKE ALL ON FUNCTION app.file_access(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_access(uuid,uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.file_reuse(reader uuid,sid uuid,rid uuid,size bigint,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.file_reservations;o app.storage_objects;
BEGIN PERFORM app.file_access(reader,sid,rid);SELECT * INTO r FROM app.file_reservations WHERE id=rid;SELECT * INTO o FROM app.storage_objects WHERE project_id=r.project_id AND size_bytes=size AND sha256=digest;
 IF o.id IS NULL THEN RETURN NULL;END IF;RETURN jsonb_build_object('id',o.id,'key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256);END $$;
REVOKE ALL ON FUNCTION app.file_reuse(uuid,uuid,uuid,bigint,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_reuse(uuid,uuid,uuid,bigint,text) TO capstone_runtime;
CREATE FUNCTION app.file_finalize(reader uuid,sid uuid,rid uuid,size bigint,digest text,mime text,reused uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.file_reservations;o app.storage_objects;old app.project_files;fid uuid:=gen_random_uuid();q jsonb;a app.users;
BEGIN
 PERFORM app.file_access(reader,sid,rid);SELECT * INTO r FROM app.file_reservations WHERE id=rid;
 IF r.status='finalized' THEN RETURN jsonb_build_object('fileId',r.file_id,'status','ready','visibility','restricted');END IF;
 IF size IS DISTINCT FROM r.expected_bytes OR size NOT BETWEEN 0 AND 250000000 OR digest !~ '^[a-f0-9]{64}$' OR char_length(mime) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MEASURED_FILE';END IF;
 q:=app.file_quota_value(r.project_id);
 IF reused IS NOT NULL THEN SELECT * INTO o FROM app.storage_objects WHERE id=reused AND project_id=r.project_id AND university_id=r.university_id AND size_bytes=size AND sha256=digest;IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_REUSE';END IF;
 ELSE
 IF (q->>'used')::bigint+(q->>'reserved')::bigint>1000000000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='QUOTA_LIMIT';END IF;
 INSERT INTO app.storage_objects(university_id,project_id,storage_key,size_bytes,sha256) VALUES(r.university_id,r.project_id,r.id,size,digest) RETURNING * INTO o;
 END IF;
 SELECT * INTO old FROM app.project_files WHERE version_id=r.version_id AND canonical_path=r.canonical_path AND is_current FOR UPDATE;
 IF old.id IS NULL AND (SELECT count(*) FROM app.project_files WHERE version_id=r.version_id AND is_current)>=10000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PATH_LIMIT';END IF;
 UPDATE app.project_files SET is_current=false WHERE id=old.id;
 INSERT INTO app.project_files(id,university_id,project_id,version_id,storage_object_id,relative_path,original_name,extension,detected_mime,size_bytes,sha256,uploaded_by,supersedes_file_id,processing_status,visibility)
 VALUES(fid,r.university_id,r.project_id,r.version_id,o.id,r.relative_path,regexp_replace(r.relative_path,'^.*/',''),r.extension,mime,size,digest,reader,old.id,'ready','restricted');
 UPDATE app.file_reservations SET status='finalized',file_id=fid WHERE id=rid;
 SELECT * INTO a FROM app.users WHERE id=reader;
 INSERT INTO app.audit_logs(actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,after_state) VALUES(reader,a.role_code,r.university_id,'file.finalize','project_file',fid,r.project_id,r.version_id,r.correlation_id,jsonb_build_object('scope',jsonb_build_object('size',size,'sha256',digest,'visibility','restricted')::text));
 RETURN jsonb_build_object('fileId',fid,'objectId',o.id,'sizeBytes',size,'sha256',digest,'status','ready','visibility','restricted','reused',reused IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION app.file_finalize(uuid,uuid,uuid,bigint,text,text,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_finalize(uuid,uuid,uuid,bigint,text,text,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.file_end(reader uuid,sid uuid,rid uuid,operation text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.file_reservations;p app.projects;
BEGIN
 SELECT * INTO r FROM app.file_reservations WHERE id=rid AND uploader_id=reader;IF r.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 p:=app.file_actor(reader,sid,r.project_id,r.version_id,false);SELECT * INTO r FROM app.file_reservations WHERE id=rid FOR UPDATE;
 IF operation NOT IN ('cancelled','failed','touch') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TRANSITION';END IF;
 IF r.status='active' THEN
 IF r.expires_at<=clock_timestamp() THEN UPDATE app.file_reservations SET status='expired' WHERE id=rid;
 ELSIF operation='touch' THEN UPDATE app.file_reservations SET activity_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' WHERE id=rid;
 ELSE UPDATE app.file_reservations SET status=operation WHERE id=rid;END IF;END IF;
 RETURN jsonb_build_object('id',rid,'status',(SELECT status FROM app.file_reservations WHERE id=rid));
END $$;
REVOKE ALL ON FUNCTION app.file_end(uuid,uuid,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_end(uuid,uuid,uuid,text) TO capstone_runtime;
CREATE FUNCTION app.file_cleanup(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.file_actor(reader,sid,pid,vid,false);
 UPDATE app.file_reservations SET status='expired' WHERE project_id=pid AND status='active' AND expires_at<=clock_timestamp();
 RETURN QUERY SELECT r.id FROM app.file_reservations r WHERE r.project_id=pid AND r.status IN ('expired','cancelled','failed') AND NOT EXISTS(SELECT 1 FROM app.storage_objects o WHERE o.storage_key=r.id) AND NOT EXISTS(SELECT 1 FROM app.project_files f WHERE f.storage_object_id=r.id) FOR UPDATE;
END $$;
REVOKE ALL ON FUNCTION app.file_cleanup(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_cleanup(uuid,uuid,uuid,uuid) TO capstone_runtime;
