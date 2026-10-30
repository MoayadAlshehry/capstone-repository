CREATE OR REPLACE FUNCTION app.committee_session_end(iid uuid,session_digest text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE target uuid;cid uuid;BEGIN
 UPDATE app.committee_guest_sessions SET revoked_at=app.governance_now() WHERE invite_id=iid AND session_hash=session_digest AND revoked_at IS NULL RETURNING invite_id INTO target;
 IF target IS NOT NULL THEN SELECT case_id INTO cid FROM app.committee_invitations WHERE id=target;PERFORM app.committee_event(cid,target,NULL,'session_ended');END IF;
END $$;
CREATE INDEX committee_result_case_lookup ON app.committee_results(case_id,finalized_at DESC);
CREATE INDEX committee_member_case_lookup ON app.committee_member_assessments(case_id,invite_id);
CREATE INDEX committee_session_invite_lookup ON app.committee_guest_sessions(invite_id,generation);
CREATE INDEX committee_mail_invite_lookup ON app.committee_mail_outbox(invite_id,created_at DESC);
CREATE INDEX committee_mail_due_lookup ON app.committee_mail_outbox(next_at,created_at) WHERE state IN ('queued','sending','failed','unknown');
CREATE INDEX committee_mail_expiry_lookup ON app.committee_mail_outbox(expires_at) WHERE state NOT IN ('provider_accepted','mailpit_accepted','expired');
