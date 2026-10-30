-- Guests remain invitation identities. Existing audit actor invariants require the
-- system envelope for their verified commands; committee_events retains exact invite provenance.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_event(uuid,uuid,uuid,text,text,jsonb)'::regprocedure);
 d:=replace(d,'''committee.''||action_value','CASE WHEN who IS NULL THEN ''system.committee.'' ELSE ''committee.'' END||action_value');
 EXECUTE d;
END $$;
