-- Recover only this authenticated actor's already-committed governance receipt.
-- A pending concern acknowledgment does not admit the hidden assessment view,
-- reveal peer scores/forms, or reopen completed evidence access.
CREATE FUNCTION app.governance_receipt(reader uuid,sid uuid,command_value uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;r app.command_receipts;result jsonb;i app.assessment_issues;h app.assessment_heads;c app.evaluation_cases;authority boolean;
BEGIN
 a:=app.partner_access_principal(reader,sid);
 IF command_value IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command_value AND action IN (
   'evaluation.governance.issue','evaluation.governance.authorize','evaluation.governance.correct',
   'evaluation.governance.invalidate','evaluation.governance.explain','evaluation.governance.hold',
   'evaluation.governance.resolve','evaluation.governance.retain','evaluation.governance.refresh'
 );
 IF r.command_id IS NULL THEN RETURN NULL;END IF;
 result:=(r.result->>'scope')::jsonb;
 SELECT * INTO i FROM app.assessment_issues WHERE id=(result->>'issue')::uuid;
 SELECT * INTO h FROM app.assessment_heads WHERE id=i.logical_id;
 SELECT * INTO c FROM app.evaluation_cases WHERE id=h.case_id;
 authority:=CASE WHEN h.layer='external' THEN a.role_code='platform_admin' ELSE a.role_code='university_admin' AND a.university_id=c.university_id END;
 IF i.id IS NULL OR h.id IS NULL OR NOT (authority OR a.role_code='faculty_supervisor' AND a.id=h.evaluator_id) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN jsonb_build_object('command',command_value,'operation',substring(r.action FROM char_length('evaluation.governance.')+1),'result',jsonb_build_object(
   'issue',result->'issue','state',result->'state','revision',result->'revision',
   'assessment',result->'assessment','run',result->'run'
 ));
END $$;
REVOKE ALL ON FUNCTION app.governance_receipt(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_receipt(uuid,uuid,uuid) TO capstone_runtime;
