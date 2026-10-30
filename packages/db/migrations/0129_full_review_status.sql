-- Extend the existing authorized, score-free packet status through the complete
-- independent-review lifecycle. No assignment, assessment, grant or policy write.
ALTER FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid)
 RENAME TO full_final_packet_state_before_progression_status;
CREATE FUNCTION app.full_final_packet_state(who uuid,sid uuid,pid uuid,vid uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE value jsonb; allocation jsonb; progress record; current_case uuid;
BEGIN
 value:=app.full_final_packet_state_before_progression_status(who,sid,pid,vid);
 IF value IS NULL THEN RETURN NULL; END IF;
 allocation:=value->'allocation';
 IF allocation IS NULL OR allocation='null'::jsonb THEN RETURN value; END IF;
 current_case:=(value->>'case')::uuid;
 SELECT state,quality_paused,reasons INTO progress
 FROM app.evaluation_progression WHERE case_id=current_case;
 allocation:=allocation||jsonb_build_object(
  'progressionState',progress.state,
  'qualityPaused',coalesce(progress.quality_paused,false),
  'progressionReasons',coalesce(progress.reasons,'[]'::jsonb),
  'active',(SELECT count(*) FROM app.external_review_assignments a
   WHERE a.case_id=current_case AND (
    (a.status='offered' AND a.offer_expires_at>app.governance_now()) OR
    (a.status='accepted' AND a.due_at>app.governance_now())
   ))
 );
 RETURN value||jsonb_build_object('allocation',allocation);
END $$;
REVOKE ALL ON FUNCTION app.full_final_packet_state_before_progression_status(uuid,uuid,uuid,uuid)
 FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid)
 FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid) TO capstone_runtime;
