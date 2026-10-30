ALTER TABLE app.committee_challenges ADD COLUMN delivery_message_id uuid REFERENCES app.committee_mail_outbox(id);
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_challenge_issue(uuid,text,text,text,uuid,text,text)'::regprocedure);
 d:=replace(d,'INSERT INTO app.committee_challenges VALUES','INSERT INTO app.committee_challenges(invite_id,code_hash,generation,issued_at,expires_at,consumed_at,attempts,resend_after) VALUES');
 d:=replace(d,'PERFORM app.committee_event(i.case_id,i.id,NULL,''verification_sent'')','UPDATE app.committee_challenges SET delivery_message_id=$5 WHERE invite_id=iid;PERFORM app.committee_event(i.case_id,i.id,NULL,''verification_sent'')');EXECUTE d;
 d:=pg_get_functiondef('app.committee_mail_claim()'::regprocedure);
 d:=replace(d,$text$IF NOT EXISTS(SELECT 1 FROM app.committee_invitations i WHERE i.id=m.invite_id$text$, $text$IF (m.purpose='COMMITTEE_OTP' AND NOT EXISTS(SELECT 1 FROM app.committee_challenges ch WHERE ch.invite_id=m.invite_id AND ch.delivery_message_id=m.id AND ch.consumed_at IS NULL)) OR NOT EXISTS(SELECT 1 FROM app.committee_invitations i WHERE i.id=m.invite_id$text$);EXECUTE d;
END $$;
-- Institution explanations refer to the current exact heads. A later amendment
-- changes the head and therefore requires a new explanation when still discrepant.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.governance_refresh(uuid,uuid,uuid)'::regprocedure);
 d:=replace(d,'explained:=EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id);','explained:=EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id) OR EXISTS(SELECT 1 FROM app.committee_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id);');EXECUTE d;
END $$;
-- Keep idempotent per-command public management replies bound to their actual operation.
ALTER TABLE app.committee_mail_outbox ADD COLUMN request_digest text;
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_manage(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid)'::regprocedure);
 d:=replace(d,'DECLARE r app.committee_rounds;', 'DECLARE request_hash text;previous_hash text;r app.committee_rounds;');
 d:=replace(d,'r:=app.committee_round_for(who,sid,sub,true);','r:=app.committee_round_for(who,sid,sub,true);request_hash:=app.packet_hash(jsonb_build_array(sub,expected,operation,CASE WHEN operation=''invite'' THEN NULL ELSE iid END,address,name_value,locale_value,reason_value));SELECT request_digest INTO previous_hash FROM app.committee_mail_outbox WHERE dedupe=command;IF FOUND AND previous_hash IS DISTINCT FROM request_hash THEN RAISE EXCEPTION USING ERRCODE=''40001'',MESSAGE=''IDEMPOTENCY_CONFLICT'';END IF;');
 d:=replace(d,'PERFORM app.committee_event(r.case_id,i.id,who,operation,reason_value);','UPDATE app.committee_mail_outbox SET request_digest=request_hash WHERE dedupe=command;PERFORM app.committee_event(r.case_id,i.id,who,operation,reason_value);');EXECUTE d;
END $$;
