-- A network timeout or a worker lost after SMTP/provider acceptance is not a
-- known failure. Retain UNKNOWN for reconciliation or an explicit new invitation/code.
-- Never automatically send the same ambiguous intent twice.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_mail_claim()'::regprocedure);
 d:=replace(d,'SELECT * INTO m FROM app.committee_mail_outbox WHERE ((state IN (''queued'',''failed'',''unknown'') AND next_at<=t) OR (state=''sending'' AND lease_until<t))',
 'UPDATE app.committee_mail_outbox SET state=''unknown'',code=''LEASE_OUTCOME_UNKNOWN'',lease=NULL,lease_until=NULL WHERE state=''sending'' AND lease_until<t;SELECT * INTO m FROM app.committee_mail_outbox WHERE (state IN (''queued'',''failed'') AND next_at<=t)');
 EXECUTE d;
END $$;
