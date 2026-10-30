-- Email verification may reopen the member's own immutable receipt. It still
-- cannot reopen evidence or create another assessment without an authorized amendment.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_challenge_issue(uuid,text,text,text,uuid,text,text)'::regprocedure);
 d:=replace(d,'OR (i.submitted_at IS NOT NULL AND (app.committee_open_amendment(iid)).id IS NULL) OR','OR');EXECUTE d;
 d:=pg_get_functiondef('app.committee_guest_read(uuid,text)'::regprocedure);
 d:=replace(d,'''deadline'',i.expires_at','''sessionExpiresAt'',(SELECT expires_at FROM app.committee_guest_sessions WHERE session_hash=session_digest AND invite_id=iid),''deadline'',i.expires_at');EXECUTE d;
END $$;
CREATE FUNCTION app.committee_session_end(iid uuid,session_digest text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 UPDATE app.committee_guest_sessions SET revoked_at=app.governance_now() WHERE invite_id=iid AND session_hash=session_digest AND revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION app.committee_session_end(uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.committee_session_end(uuid,text) TO capstone_runtime;
