-- Bind a recovered acknowledgment to its immutable case/logical assessment.
-- These opaque IDs add no form/score/evidence grant and follow the existing
-- actor-owned receipt authorization before any projection.
ALTER FUNCTION app.governance_receipt(uuid,uuid,uuid) RENAME TO governance_receipt_before_scope;
REVOKE ALL ON FUNCTION app.governance_receipt_before_scope(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.governance_receipt(reader uuid,sid uuid,command_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;h app.assessment_heads;
BEGIN
 result:=app.governance_receipt_before_scope(reader,sid,command_value);
 IF result IS NULL THEN RETURN NULL;END IF;
 SELECT ah.* INTO h FROM app.assessment_heads ah JOIN app.assessment_issues i ON i.logical_id=ah.id WHERE i.id=(result->'result'->>'issue')::uuid;
 RETURN result||jsonb_build_object('case',h.case_id,'logical',h.id);
END $$;
REVOKE ALL ON FUNCTION app.governance_receipt(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_receipt(uuid,uuid,uuid) TO capstone_runtime;
