-- Phase16 internal current-version reads only; no public/grant/historical delivery.
CREATE FUNCTION app.native_file_read(reader uuid,sid uuid,pid uuid,vid uuid,fid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;result jsonb;
BEGIN
 p:=app.file_actor(reader,sid,pid,vid,false);
 IF p.current_version_id IS DISTINCT FROM vid THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'project',f.project_id,'version',f.version_id,'path',f.relative_path,'name',f.original_name,'extension',f.extension,'mime',f.detected_mime,'size',f.size_bytes,'sha256',f.sha256,'visibility',f.visibility,'status',f.processing_status,'uploader',u.full_name,'uploaderRole',coalesce((SELECT actor_role FROM app.audit_logs WHERE object_id=f.id AND action='file.finalize' ORDER BY occurred_at DESC LIMIT 1),u.role_code),'uploadedAt',f.uploaded_at) || CASE WHEN fid IS NOT NULL THEN jsonb_build_object('key',o.storage_key) ELSE '{}'::jsonb END ORDER BY f.canonical_path,f.relative_path,f.id),'[]'::jsonb) INTO result
 FROM app.project_files f JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=f.project_id AND o.university_id=f.university_id JOIN app.users u ON u.id=f.uploaded_by
 WHERE f.project_id=pid AND f.version_id=vid AND f.university_id=p.university_id AND f.is_current AND f.processing_status='ready' AND (fid IS NULL OR f.id=fid) AND (f.size_bytes,f.sha256)=(o.size_bytes,o.sha256);
 IF fid IS NOT NULL AND jsonb_array_length(result)<>1 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN CASE WHEN fid IS NULL THEN jsonb_build_object('files',result) ELSE result->0 END;
END $$;
REVOKE ALL ON FUNCTION app.native_file_read(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.native_file_read(uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
