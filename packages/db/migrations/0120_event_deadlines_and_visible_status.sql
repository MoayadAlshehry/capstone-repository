-- First-pair eligibility and capacity changes are committed events. Deadline
-- crossings also need automatic repair even when no user produces another event.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.first_pair_snapshot(boolean)'::regprocedure);
 d:=replace(d,'IF NOT force_value AND NOT EXISTS(SELECT 1 FROM app.evaluation_wake_events WHERE handled_at IS NULL) THEN RETURN NULL;END IF;',
 'IF NOT force_value AND NOT EXISTS(SELECT 1 FROM app.evaluation_wake_events WHERE handled_at IS NULL) AND NOT EXISTS(SELECT 1 FROM app.external_review_assignments WHERE status=''offered'' AND offer_expires_at<=app.governance_now() OR status=''accepted'' AND due_at<=app.governance_now()) THEN RETURN NULL;END IF;');
 EXECUTE d;
END $$;
CREATE TRIGGER wake_assessment_revision AFTER INSERT ON app.assessment_revisions FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_assessment_invalidation AFTER INSERT ON app.assessment_invalidations FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_institutional_explanation AFTER INSERT ON app.evaluation_discrepancy_explanations FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
CREATE TRIGGER wake_guest_roster AFTER INSERT OR UPDATE ON app.committee_invitations FOR EACH STATEMENT EXECUTE FUNCTION app.evaluation_wake();
ALTER FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid) RENAME TO full_final_packet_state_before_review_status;
CREATE FUNCTION app.full_final_packet_state(who uuid,sid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE value jsonb;state jsonb;BEGIN
 value:=app.full_final_packet_state_before_review_status(who,sid,pid,vid);IF value IS NULL THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('policy',r.policy_code,'eligibleAt',s.eligible_at,'checkedAt',s.checked_at,'active',s.offered,'waitingInitialSlots',s.waiting,'completed',(SELECT count(*) FROM app.current_external_assessments WHERE case_id=s.case_id),'reasons',s.reasons) INTO state FROM app.evaluation_pair_status s JOIN app.evaluation_event_runs r ON r.id=s.last_run WHERE s.case_id=(value->>'case')::uuid;
 RETURN value||jsonb_build_object('allocation',state);
END $$;
REVOKE ALL ON FUNCTION app.full_final_packet_state_before_review_status(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.full_final_packet_state(uuid,uuid,uuid,uuid) TO capstone_runtime;
