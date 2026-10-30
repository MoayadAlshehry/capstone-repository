-- Phase15 transport state. Authoritative bytes/identity/quota remain Phase14 services.
CREATE FUNCTION app.upload_now() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT clock_timestamp() $$;
REVOKE ALL ON FUNCTION app.upload_now() FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE TABLE app.upload_sessions (
 id uuid PRIMARY KEY, reservation_id uuid NOT NULL UNIQUE REFERENCES app.file_reservations(id), university_id uuid NOT NULL, project_id uuid NOT NULL, version_id uuid NOT NULL, uploader_id uuid NOT NULL,
 transfer_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), offset_bytes bigint NOT NULL DEFAULT 0 CHECK(offset_bytes BETWEEN 0 AND 250000000), expected_bytes bigint NOT NULL CHECK(expected_bytes BETWEEN 0 AND 250000000),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled','failed','expired')), fingerprint text NOT NULL CHECK(char_length(fingerprint) BETWEEN 1 AND 300), activity_at timestamptz NOT NULL DEFAULT app.upload_now(), created_at timestamptz NOT NULL DEFAULT app.upload_now(), file_id uuid,
 FOREIGN KEY(university_id,project_id,version_id) REFERENCES app.project_versions(university_id,project_id,id), FOREIGN KEY(university_id,uploader_id) REFERENCES app.users(university_id,id), FOREIGN KEY(university_id,project_id,version_id,file_id) REFERENCES app.project_files(university_id,project_id,version_id,id),CHECK(offset_bytes<=expected_bytes),CHECK((status='completed')=(file_id IS NOT NULL))
);
REVOKE ALL ON app.upload_sessions FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.upload_create(reader uuid,sid uuid,uid uuid,pid uuid,vid uuid,path text,ext text,size bigint,correlation uuid,fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r jsonb;u app.upload_sessions;p app.projects;clock timestamptz:=app.upload_now();
BEGIN
 p:=app.file_actor(reader,sid,pid,vid);
 IF char_length(fingerprint) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FINGERPRINT';END IF;
 r:=app.file_reserve(reader,sid,pid,vid,path,ext,size,correlation);
 SELECT * INTO u FROM app.upload_sessions WHERE reservation_id=(r->>'id')::uuid FOR UPDATE;
 IF u.id IS NOT NULL THEN IF u.fingerprint<>fingerprint THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='FINGERPRINT_CONFLICT';END IF;RETURN jsonb_build_object('id',u.id,'status',u.status);END IF;
 IF r->>'status'<>'active' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INACTIVE_RESERVATION';END IF;
 INSERT INTO app.upload_sessions(id,reservation_id,university_id,project_id,version_id,uploader_id,expected_bytes,fingerprint,activity_at,created_at) VALUES(uid,(r->>'id')::uuid,p.university_id,pid,vid,reader,size,fingerprint,clock,clock) RETURNING * INTO u;
 UPDATE app.file_reservations SET activity_at=clock,expires_at=clock+interval '24 hours' WHERE id=u.reservation_id;
 RETURN jsonb_build_object('id',u.id,'status',u.status);
END $$;
REVOKE ALL ON FUNCTION app.upload_create(uuid,uuid,uuid,uuid,uuid,text,text,bigint,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.upload_create(uuid,uuid,uuid,uuid,uuid,text,text,bigint,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.upload_access(reader uuid,sid uuid,uid uuid,completed boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.upload_sessions;r app.file_reservations;q jsonb;
BEGIN
 SELECT * INTO u FROM app.upload_sessions WHERE id=uid AND uploader_id=reader;IF u.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 PERFORM app.file_actor(reader,sid,u.project_id,u.version_id);SELECT * INTO u FROM app.upload_sessions WHERE id=uid FOR UPDATE;SELECT * INTO r FROM app.file_reservations WHERE id=u.reservation_id FOR UPDATE;
 IF u.status='completed' AND completed AND r.status='finalized' THEN RETURN jsonb_build_object('id',u.id,'status',u.status,'offset',u.offset_bytes,'expected',u.expected_bytes,'reservation',r.id,'project',u.project_id,'version',u.version_id,'path',r.relative_path,'fileId',u.file_id);END IF;
 IF u.status<>'active' OR r.status<>'active' OR u.activity_at+interval '24 hours'<=app.upload_now() OR r.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='INACTIVE_UPLOAD';END IF;
 q:=app.file_quota_value(u.project_id);IF (q->>'used')::bigint+(q->>'reserved')::bigint>1000000000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='QUOTA_LIMIT';END IF;
 RETURN jsonb_build_object('id',u.id,'status',u.status,'offset',u.offset_bytes,'expected',u.expected_bytes,'reservation',r.id,'key',u.transfer_key,'project',u.project_id,'version',u.version_id,'path',r.relative_path,'fingerprint',u.fingerprint);
END $$;
REVOKE ALL ON FUNCTION app.upload_access(uuid,uuid,uuid,boolean) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.upload_access(uuid,uuid,uuid,boolean) TO capstone_runtime;
CREATE FUNCTION app.upload_advance(reader uuid,sid uuid,uid uuid,expected_offset bigint,new_offset bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.upload_sessions;clock timestamptz:=app.upload_now();
BEGIN
 PERFORM app.upload_access(reader,sid,uid);SELECT * INTO u FROM app.upload_sessions WHERE id=uid;
 IF u.offset_bytes<>expected_offset THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='OFFSET_CONFLICT';END IF;
 IF new_offset NOT BETWEEN expected_offset AND least(u.expected_bytes,expected_offset+5000000) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='BYTE_LIMIT';END IF;
 UPDATE app.upload_sessions SET offset_bytes=new_offset,activity_at=clock WHERE id=uid;
 UPDATE app.file_reservations SET activity_at=clock,expires_at=clock+interval '24 hours' WHERE id=u.reservation_id;
 RETURN jsonb_build_object('offset',new_offset);
END $$;
REVOKE ALL ON FUNCTION app.upload_advance(uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.upload_advance(uuid,uuid,uuid,bigint,bigint) TO capstone_runtime;
CREATE FUNCTION app.upload_complete(reader uuid,sid uuid,uid uuid,fid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.upload_sessions;r app.file_reservations;
BEGIN
 SELECT * INTO u FROM app.upload_sessions WHERE id=uid AND uploader_id=reader;IF u.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;PERFORM app.file_actor(reader,sid,u.project_id,u.version_id);
 SELECT * INTO u FROM app.upload_sessions WHERE id=uid FOR UPDATE;SELECT * INTO r FROM app.file_reservations WHERE id=u.reservation_id;
 IF u.status<>'active' OR u.offset_bytes<>u.expected_bytes OR r.status<>'finalized' OR r.file_id IS DISTINCT FROM fid OR NOT EXISTS(SELECT 1 FROM app.project_files WHERE id=fid AND project_id=u.project_id AND version_id=u.version_id AND university_id=u.university_id AND uploaded_by=reader AND visibility='restricted' AND processing_status='ready') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='FINALIZATION_REQUIRED';END IF;
 UPDATE app.upload_sessions SET status='completed',file_id=fid WHERE id=uid;
END $$;
REVOKE ALL ON FUNCTION app.upload_complete(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.upload_complete(uuid,uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.upload_end(reader uuid,sid uuid,uid uuid,operation text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.upload_sessions;
BEGIN
 SELECT * INTO u FROM app.upload_sessions WHERE id=uid AND uploader_id=reader;IF u.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;PERFORM app.file_actor(reader,sid,u.project_id,u.version_id,false);SELECT * INTO u FROM app.upload_sessions WHERE id=uid FOR UPDATE;
 IF operation NOT IN ('failed','cancelled') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TRANSITION';END IF;
 IF u.status='active' THEN PERFORM app.file_end(reader,sid,u.reservation_id,operation);UPDATE app.upload_sessions SET status=operation WHERE id=uid;END IF;
 RETURN jsonb_build_object('key',u.transfer_key,'status',(SELECT status FROM app.upload_sessions WHERE id=uid));
END $$;
REVOKE ALL ON FUNCTION app.upload_end(uuid,uuid,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.upload_end(uuid,uuid,uuid,text) TO capstone_runtime;
CREATE FUNCTION app.upload_view(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;a app.users;can_upload boolean;clock timestamptz:=app.upload_now();
BEGIN
 p:=app.file_actor(reader,sid,pid,vid,false);a:=app.assignment_principal(reader,sid);
 can_upload:=p.current_version_id=vid AND EXISTS(SELECT 1 FROM app.project_versions WHERE id=vid AND status IN ('draft','revision_required')) AND ((a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader)) OR (a.role_code='faculty_supervisor' AND p.supervisor_id=reader));
 UPDATE app.upload_sessions SET status='expired' WHERE project_id=pid AND status='active' AND activity_at+interval '24 hours'<=clock;
 UPDATE app.file_reservations r SET status='expired' FROM app.upload_sessions u WHERE u.reservation_id=r.id AND u.project_id=pid AND u.status='expired' AND r.status='active';
 RETURN jsonb_build_object('canUpload',can_upload,'quota',app.file_quota_value(pid),'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'path',f.relative_path,'mime',f.detected_mime,'size',f.size_bytes,'sha256',f.sha256,'visibility',f.visibility,'uploader',u.full_name,'uploaderRole',u.role_code,'uploadedAt',f.uploaded_at)) FROM app.project_files f JOIN app.users u ON u.id=f.uploaded_by WHERE f.project_id=pid AND f.version_id=vid AND f.is_current AND f.processing_status='ready'),'[]'::jsonb),'transfers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'path',r.relative_path,'size',u.expected_bytes,'offset',u.offset_bytes,'status',u.status,'fingerprint',u.fingerprint,'expiresAt',u.activity_at+interval '24 hours','fileId',u.file_id)) FROM app.upload_sessions u JOIN app.file_reservations r ON r.id=u.reservation_id WHERE u.project_id=pid AND u.version_id=vid AND u.uploader_id=reader),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION app.upload_view(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.upload_view(uuid,uuid,uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.upload_cleanup(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.upload_view(reader,sid,pid,vid);
 RETURN QUERY SELECT u.transfer_key FROM app.upload_sessions u WHERE u.project_id=pid AND u.status IN ('cancelled','failed','expired','completed') AND NOT EXISTS(SELECT 1 FROM app.storage_objects o WHERE o.storage_key=u.transfer_key) FOR UPDATE;
END $$;
REVOKE ALL ON FUNCTION app.upload_cleanup(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.upload_cleanup(uuid,uuid,uuid,uuid) TO capstone_runtime;
