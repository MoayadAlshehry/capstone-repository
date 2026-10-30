DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text)'::regprocedure);
 d:=replace(d,'FROM app.academic_final_admissions WHERE submission_id=sub AND outcome=''accepted''','FROM app.academic_final_admissions ad WHERE ad.submission_id=sub AND ad.outcome=''accepted''');EXECUTE d;
END $$;
ALTER FUNCTION app.academic_flow_state(uuid,uuid,uuid) RENAME TO academic_flow_state_before_guest_completion;
CREATE FUNCTION app.academic_flow_state(who uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;c app.evaluation_cases;BEGIN
 result:=app.academic_flow_state_before_guest_completion(who,sid,pid);
 SELECT ec.* INTO c FROM app.evaluation_cases ec JOIN app.projects p ON p.current_version_id=ec.version_id AND p.id=ec.project_id JOIN app.project_versions v ON v.id=ec.version_id AND v.status='pending_review' WHERE p.id=pid ORDER BY ec.created_at DESC LIMIT 1;
 IF EXISTS(SELECT 1 FROM app.committee_rounds WHERE case_id=c.id) AND EXISTS(SELECT 1 FROM app.academic_final_admissions WHERE submission_id=c.submission_id AND outcome='accepted') AND EXISTS(SELECT 1 FROM app.current_internal_assessments WHERE case_id=c.id AND layer='supervisor') THEN
  RETURN result||jsonb_build_object('stage',CASE WHEN EXISTS(SELECT 1 FROM app.current_committee_results WHERE case_id=c.id) THEN 'faculty_decision' ELSE 'committee_consensus' END,'committeeWorkflow','COMMITTEE_GUEST_V1');
 END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.academic_flow_state_before_guest_completion(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_flow_state(uuid,uuid,uuid) TO capstone_runtime;
