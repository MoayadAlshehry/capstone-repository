-- One finite read boundary. Special future capabilities remain default-deny.
CREATE FUNCTION app.file_delivery_read(kind text,reader uuid,sid uuid,pid uuid,vid uuid,fid uuid DEFAULT NULL,sub uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE projection jsonb; result jsonb;
BEGIN
 IF kind IN ('internal','internal-zip') THEN
  IF kind='internal-zip' AND NOT EXISTS(SELECT 1 FROM app.project_versions WHERE id=vid AND project_id=pid AND status='archived') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
  IF sub IS NOT NULL THEN RETURN app.submission_native_read(reader,sid,pid,vid,sub,fid);END IF;
  RETURN app.native_file_read(reader,sid,pid,vid,fid);
 END IF;
 IF kind IS DISTINCT FROM 'public' OR sub IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 projection:=app.publication_projection(pid);
 IF projection IS NULL OR projection->>'version' IS DISTINCT FROM vid::text THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF EXISTS(
  SELECT 1 FROM app.projects p JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id AND v.university_id=p.university_id AND v.status='archived'
  JOIN app.submission_files m ON m.submission_id=v.approved_submission_id AND m.project_id=p.id AND m.version_id=v.id AND m.university_id=p.university_id
  JOIN app.project_files f ON f.id=m.file_id AND f.project_id=p.id AND f.version_id=v.id AND f.university_id=p.university_id AND f.is_current AND f.processing_status='ready' AND f.visibility='public'
  LEFT JOIN app.storage_objects o ON o.id=m.storage_object_id AND o.project_id=p.id AND o.university_id=p.university_id
  WHERE p.id=pid AND v.id=vid AND (fid IS NULL OR f.id=fid) AND (o.id IS NULL OR (f.storage_object_id,f.size_bytes,f.sha256,f.relative_path,f.detected_mime,f.extension) IS DISTINCT FROM (m.storage_object_id,m.size_at_submit,m.sha256_at_submit,m.relative_path,m.mime_at_submit,m.extension_at_submit) OR (o.size_bytes,o.sha256) IS DISTINCT FROM (m.size_at_submit,m.sha256_at_submit))
 ) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INTEGRITY_FAILED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'project',pid,'version',vid,'path',m.relative_path,'name',regexp_replace(m.relative_path,'^.*/',''),'extension',m.extension_at_submit,'mime',m.mime_at_submit,'size',m.size_at_submit,'sha256',m.sha256_at_submit,'visibility','public','status','ready') || CASE WHEN fid IS NOT NULL THEN jsonb_build_object('key',o.storage_key) ELSE '{}'::jsonb END ORDER BY m.relative_path,f.id),'[]'::jsonb) INTO result
 FROM app.projects p
 JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id AND v.university_id=p.university_id AND v.status='archived'
 JOIN app.submission_files m ON m.submission_id=v.approved_submission_id AND m.project_id=p.id AND m.version_id=v.id AND m.university_id=p.university_id
 JOIN app.project_files f ON f.id=m.file_id AND f.project_id=p.id AND f.version_id=v.id AND f.university_id=p.university_id AND f.is_current AND f.processing_status='ready' AND f.visibility='public'
 JOIN app.storage_objects o ON o.id=m.storage_object_id AND o.project_id=p.id AND o.university_id=p.university_id
 WHERE p.id=pid AND v.id=vid AND (fid IS NULL OR f.id=fid)
 AND (f.storage_object_id,f.size_bytes,f.sha256,f.relative_path,f.detected_mime,f.extension)=(m.storage_object_id,m.size_at_submit,m.sha256_at_submit,m.relative_path,m.mime_at_submit,m.extension_at_submit)
 AND (o.size_bytes,o.sha256)=(m.size_at_submit,m.sha256_at_submit);
 IF fid IS NOT NULL AND jsonb_array_length(result)<>1 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN CASE WHEN fid IS NULL THEN jsonb_build_object('files',result) ELSE result->0 END;
END $$;
REVOKE ALL ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
