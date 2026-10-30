-- Rotating a legitimate invitation invalidates its old challenge. The first code
-- for the new generation must not inherit a previous generation's resend timer.
DO $$ DECLARE d text;BEGIN d:=pg_get_functiondef('app.committee_challenge_issue(uuid,text,text,text,uuid,text,text)'::regprocedure);d:=replace(d,'IF ch.resend_after>t THEN','IF ch.resend_after>t AND ch.generation=i.generation THEN');EXECUTE d;END $$;
