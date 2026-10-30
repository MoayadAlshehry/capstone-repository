-- A single faculty evaluator can hold two distinct internal layers in one case.
-- Bind the recovered acknowledgment to the exact immutable layer as well.
ALTER FUNCTION app.governance_receipt(uuid,uuid,uuid) RENAME TO governance_receipt_before_layer;
REVOKE ALL ON FUNCTION app.governance_receipt_before_layer(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.governance_receipt(reader uuid,sid uuid,command_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;layer_value text;
BEGIN
 result:=app.governance_receipt_before_layer(reader,sid,command_value);
 IF result IS NULL THEN RETURN NULL;END IF;
 SELECT layer INTO layer_value FROM app.assessment_heads WHERE id=(result->>'logical')::uuid;
 RETURN result||jsonb_build_object('layer',layer_value);
END $$;
REVOKE ALL ON FUNCTION app.governance_receipt(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_receipt(uuid,uuid,uuid) TO capstone_runtime;
