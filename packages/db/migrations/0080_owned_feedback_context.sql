-- Link an already-authorized final record to the existing recipient-authorized
-- feedback read. Do not copy faculty assessment forms or scores into this DTO.
ALTER FUNCTION app.academic_round_read(uuid,uuid,uuid) RENAME TO academic_round_read_before_feedback_context;
REVOKE ALL ON FUNCTION app.academic_round_read_before_feedback_context(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.academic_round_read(who uuid,sid uuid,sub uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb; case_id uuid;
BEGIN
  result:=app.academic_round_read_before_feedback_context(who,sid,sub);
  SELECT id INTO case_id FROM app.evaluation_cases WHERE submission_id=sub;
  RETURN result || jsonb_build_object('evaluationCase',case_id);
END $$;
REVOKE ALL ON FUNCTION app.academic_round_read(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_round_read(uuid,uuid,uuid) TO capstone_runtime;
