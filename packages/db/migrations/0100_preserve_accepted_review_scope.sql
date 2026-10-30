-- Keep an already accepted, unexpired historical evidence grant readable.
-- It cannot create a new offer or admit an unaccepted, unconsented scope.
CREATE OR REPLACE FUNCTION app.external_candidate(reviewer uuid,packet uuid,new_offer boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.academic_review_packets WHERE id=packet AND manifest->>'schema'='FULL_FINAL_ARTIFACTS_V2') AND NOT EXISTS(SELECT 1 FROM app.full_final_packet_consents WHERE packet_id=packet) AND (new_offer OR NOT EXISTS(SELECT 1 FROM app.external_review_assignments t WHERE t.reviewer_id=reviewer AND t.packet_id=packet AND t.status='accepted' AND app.governance_now()<t.due_at)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAD_CONSENT_REQUIRED';END IF;
 RETURN app.external_candidate_before_lead_consent(reviewer,packet,new_offer);
END $$;
