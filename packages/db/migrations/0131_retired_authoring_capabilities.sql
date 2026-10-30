-- IMPR_2 owner amendment: retire the account bulk importer and license generator.
-- Historic receipts, audit records, files and frozen metadata remain unchanged.
DROP FUNCTION app.csv_commit(uuid,uuid,uuid,text,text,jsonb);
DROP FUNCTION app.csv_context(uuid,uuid);
DROP FUNCTION app.csv_groups(uuid,uuid);
DROP FUNCTION app.csv_history(uuid,uuid,uuid);
DROP FUNCTION app.csv_principal(uuid,uuid);
REVOKE ALL ON app.account_imports FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
-- Preserve factual origin independently of the retired authoring fields. Copies
-- inherit generated provenance through their source_file_id chain.
CREATE TABLE app.retired_generated_license_origins (
 file_id uuid PRIMARY KEY REFERENCES app.project_files(id)
);
INSERT INTO app.retired_generated_license_origins(file_id)
 SELECT generated_license_file_id FROM app.project_versions WHERE generated_license_file_id IS NOT NULL
 ON CONFLICT DO NOTHING;
INSERT INTO app.retired_generated_license_origins(file_id)
 SELECT f.id FROM app.command_receipts r
 CROSS JOIN LATERAL (SELECT CASE WHEN r.action='license.generate' AND jsonb_typeof(r.result->'scope')='string' THEN (r.result->>'scope')::jsonb ELSE '{}'::jsonb END data) receipt
 JOIN app.project_files f ON f.id::text=receipt.data->>'fileId'
 WHERE r.action='license.generate' AND jsonb_typeof(r.result->'scope')='string'
 ON CONFLICT DO NOTHING;
REVOKE ALL ON app.retired_generated_license_origins FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
DO $retire$
DECLARE t record;
BEGIN
 FOR t IN SELECT n.nspname,c.relname,g.tgname FROM pg_trigger g JOIN pg_proc f ON f.oid=g.tgfoid JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='app' AND f.proname IN('license_manual_precedence','license_consistency') AND NOT g.tgisinternal
 LOOP EXECUTE format('DROP TRIGGER %I ON %I.%I',t.tgname,t.nspname,t.relname); END LOOP;
END $retire$;
DROP FUNCTION app.license_begin(uuid,uuid,uuid,uuid,integer,integer,uuid,text,bigint);
DROP FUNCTION app.license_commit(uuid,uuid,uuid,uuid,uuid,text,text,text,text,uuid);
DROP FUNCTION app.license_cleanup_key(uuid,uuid,uuid,uuid,uuid);
DROP FUNCTION app.license_receipt(uuid,uuid,uuid,uuid,uuid);
DROP FUNCTION app.license_state(uuid,uuid,uuid,uuid);
DROP FUNCTION app.license_manual_precedence();
DROP FUNCTION app.license_consistency();
--> statement-breakpoint
CREATE FUNCTION app.author_uploaded_license(fid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $origin$
 WITH RECURSIVE lineage AS (
  SELECT id,source_file_id FROM app.project_files WHERE id=fid
  UNION SELECT parent.id,parent.source_file_id FROM app.project_files parent JOIN lineage child ON parent.id=child.source_file_id
 )
 SELECT coalesce((SELECT uploaded_by IS NOT NULL AND lower(regexp_replace(relative_path,'^.*/','')) IN('license','license.md','license.txt')
 FROM app.project_files WHERE id=fid),false)
 AND NOT EXISTS(SELECT 1 FROM lineage l JOIN app.retired_generated_license_origins g ON g.file_id=l.id)
 $origin$;
REVOKE ALL ON FUNCTION app.author_uploaded_license(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
-- Enrich only bytes/entries already admitted by the existing exact-scope reader.
ALTER FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) RENAME TO file_delivery_read_before_impr2;
REVOKE ALL ON FUNCTION app.file_delivery_read_before_impr2(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.file_delivery_read(kind text,who uuid,sid uuid,pid uuid,vid uuid,fid uuid,sub uuid,capability uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $read$
DECLARE result jsonb;
BEGIN
 result:=app.file_delivery_read_before_impr2(kind,who,sid,pid,vid,fid,sub,capability);
 IF result ? 'files' THEN RETURN jsonb_set(result,'{files}',coalesce((SELECT jsonb_agg(item||jsonb_build_object('uploadedLicense',app.author_uploaded_license((item->>'id')::uuid)) ORDER BY ordinal) FROM jsonb_array_elements(result->'files') WITH ORDINALITY f(item,ordinal)),'[]'::jsonb)); END IF;
 RETURN result||jsonb_build_object('uploadedLicense',app.author_uploaded_license((result->>'id')::uuid));
END $read$;
REVOKE ALL ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
ALTER FUNCTION app.publication_projection(uuid) RENAME TO publication_projection_before_impr2;
REVOKE ALL ON FUNCTION app.publication_projection_before_impr2(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.publication_projection(pid uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $projection$
 SELECT app.publication_projection_before_impr2(pid)-'license'
$projection$;
REVOKE ALL ON FUNCTION app.publication_projection(uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.publication_projection(uuid) TO capstone_runtime;
