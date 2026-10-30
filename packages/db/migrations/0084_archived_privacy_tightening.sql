-- Restore the existing protective privacy action for an archived edition.
-- All ordinary archive editing, retained work and public widening stay closed.
CREATE OR REPLACE FUNCTION app.edition_visibility(reader uuid,sid uuid,pid uuid,vid uuid,fid uuid,expected integer,intended text,command uuid,digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE status_value text;
BEGIN
 PERFORM app.edition_lead(reader,sid,pid,vid);
 SELECT status INTO status_value FROM app.project_versions WHERE id=vid AND project_id=pid;
 IF status_value='rejected' OR status_value='archived' AND intended IS DISTINCT FROM 'restricted' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ARCHIVE_READ_ONLY';END IF;
 -- Legacy writer rechecks current lead, exact scope, policy CAS and receipts,
 -- and commits the policy, audit, immediate notices and receipt atomically.
 RETURN app.edition_visibility_legacy(reader,sid,pid,vid,fid,expected,intended,command,digest);
END $$;
REVOKE ALL ON FUNCTION app.edition_visibility(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.edition_visibility(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text) TO capstone_runtime;
--> statement-breakpoint
ALTER FUNCTION app.edition_history(uuid,uuid,uuid) RENAME TO edition_history_before_privacy_tightening;
REVOKE ALL ON FUNCTION app.edition_history_before_privacy_tightening(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.edition_history(reader uuid,sid uuid,pid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;items jsonb;
BEGIN
 result:=app.edition_history_before_privacy_tightening(reader,sid,pid);
 SELECT coalesce(jsonb_agg(v||jsonb_build_object('files',(
   SELECT coalesce(jsonb_agg(f||jsonb_build_object('canChange',
     CASE WHEN v->>'status'='archived' THEN (result->>'lead')::boolean AND f->>'visibility'='public' ELSE (f->>'canChange')::boolean END
   )),'[]'::jsonb) FROM jsonb_array_elements(v->'files') f
 )) ORDER BY (v->>'number')::integer DESC),'[]'::jsonb) INTO items FROM jsonb_array_elements(result->'items') v;
 RETURN jsonb_set(result,'{items}',items);
END $$;
REVOKE ALL ON FUNCTION app.edition_history(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.edition_history(uuid,uuid,uuid) TO capstone_runtime;
