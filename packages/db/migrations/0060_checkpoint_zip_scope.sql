-- Owner R05: exact immutable checkpoint ZIP through the existing exporter.
-- Reuse the existing scoped ZIP exporter for an exact CHECKPOINT manifest.
-- Every other delivery context, including legacy FINAL/public/grant/reviewer,
-- continues through the unchanged pre-checkpoint delivery function.
ALTER FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) RENAME TO file_delivery_read_before_checkpoint;
CREATE FUNCTION app.file_delivery_read(kind text,who uuid,sid uuid,pid uuid,vid uuid,fid uuid DEFAULT NULL,sub uuid DEFAULT NULL,capability uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF kind='internal-zip' AND EXISTS(SELECT 1 FROM app.project_submissions WHERE id=sub AND purpose='CHECKPOINT') THEN RETURN app.submission_native_read(who,sid,pid,vid,sub,fid);END IF;
 RETURN app.file_delivery_read_before_checkpoint(kind,who,sid,pid,vid,fid,sub,capability);
END $$;
REVOKE ALL ON FUNCTION app.file_delivery_read_before_checkpoint(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
