-- Preserve the existing actor-owned receipt and exact-version read authority.
-- Attach the committed command identity and its already-authorized audit scope
-- so an old command cannot acknowledge a different current task/version.
ALTER FUNCTION app.academic_receipt(uuid,uuid,uuid) RENAME TO academic_receipt_before_context;
REVOKE ALL ON FUNCTION app.academic_receipt_before_context(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.academic_receipt(who uuid,sid uuid,command uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;r app.command_receipts;a app.audit_logs;
BEGIN
 result:=app.academic_receipt_before_context(who,sid,command);
 IF result IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=command;
 SELECT * INTO a FROM app.audit_logs WHERE id=r.audit_id;
 RETURN result||jsonb_build_object('receiptContext',jsonb_build_object('command',command,'action',r.action,'project',a.project_id,'version',a.version_id));
END $$;
REVOKE ALL ON FUNCTION app.academic_receipt(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_receipt(uuid,uuid,uuid) TO capstone_runtime;
