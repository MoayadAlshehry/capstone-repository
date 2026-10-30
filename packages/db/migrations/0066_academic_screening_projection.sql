-- Returned/unaccepted records expose no current scoring forms. Immutable historical finalized results remain readable to already authorized faculty.
CREATE OR REPLACE FUNCTION app.academic_round_read(who uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;ad app.academic_final_admissions;screened boolean;flow jsonb;BEGIN
 result:=app.academic_round_read_r06(who,sid,sub);SELECT * INTO ad FROM app.academic_final_admissions WHERE submission_id=sub;
 screened:=ad.outcome='accepted';flow:=app.academic_flow_state(who,sid,(result->>'project')::uuid);
 RETURN result||jsonb_build_object('flow',flow,'screening',CASE WHEN ad.submission_id IS NULL THEN NULL ELSE jsonb_build_object('outcome',ad.outcome,'reason',ad.reason,'actor',ad.actor_name,'recordedAt',ad.recorded_at) END,'canScreen',(result->>'canDecide')::boolean AND (flow->>'canScreen')::boolean,'canAssess',coalesce(screened,false) AND (result->>'canAssess')::boolean,'assessment',CASE WHEN NOT coalesce(screened,false) AND NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub) THEN NULL ELSE result->'assessment' END);
END $$;
