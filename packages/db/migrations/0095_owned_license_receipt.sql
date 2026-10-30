-- Recover only the caller's already-committed license command.  This read adds
-- no file grant, license inputs, terms, or private storage locator.
CREATE FUNCTION app.license_receipt(reader uuid,sid uuid,pid uuid,vid uuid,command_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.command_receipts;ev app.audit_logs;result jsonb;
BEGIN
 IF command_value IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 -- Reuse the installed current account/tenant/project/version read predicate.
 -- Historical command ownership alone never grants continued project access.
 PERFORM app.file_actor(reader,sid,pid,vid,false);
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command_value;
 IF NOT FOUND OR r.action<>'license.generate' THEN RETURN NULL;END IF;
 SELECT * INTO ev FROM app.audit_logs WHERE id=r.audit_id AND actor_id=reader AND action='license.generate' AND project_id=pid AND version_id=vid;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 result:=(r.result->>'scope')::jsonb;
 RETURN jsonb_build_object('command',command_value,'action',r.action,'project',pid,'version',vid,
  'result',jsonb_build_object('identifier',result->'identifier','fileId',result->'fileId',
   'sha256',result->'sha256','size',result->'size','revision',result->'revision'));
END $$;
REVOKE ALL ON FUNCTION app.license_receipt(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.license_receipt(uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
