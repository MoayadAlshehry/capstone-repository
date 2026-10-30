-- R07 truthful file labels through the same current task-scoped native projection.
ALTER FUNCTION app.external_view(uuid,uuid,uuid) RENAME TO external_view_before_file_labels_r07;
CREATE FUNCTION app.external_view(who uuid,sid uuid,aid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;files jsonb;BEGIN
 result:=app.external_view_before_file_labels_r07(who,sid,aid);
 IF aid IS NOT NULL AND result->>'status'='accepted' AND result ? 'context' THEN
  BEGIN
   files:=app.file_delivery_read('review-packet',who,sid,(result->'context'->>'project')::uuid,(result->'context'->>'version')::uuid,NULL,(result->'context'->>'submission')::uuid,aid)->'files';
   result:=result||jsonb_build_object('files',files);
  EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE '42501' OR SQLSTATE '40001' OR SQLSTATE '23514' THEN result:=result-ARRAY['manifest','context','case','packet']||jsonb_build_object('usable',false);
  END;
 END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.external_view_before_file_labels_r07(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.external_view(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_view(uuid,uuid,uuid) TO capstone_runtime;
