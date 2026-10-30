-- IMPR_3: durable management operation receipts and truthful current capabilities.
-- Preserve the installed roster/assessment policy and all immutable member evidence.
CREATE TABLE app.committee_management_receipts (
 command uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES app.users(id),
 submission_id uuid NOT NULL REFERENCES app.project_submissions(id),
 case_id uuid NOT NULL REFERENCES app.committee_rounds(case_id),
 operation text NOT NULL CHECK(operation IN ('invite','resend','revoke')),
 invitation_id uuid NOT NULL REFERENCES app.committee_invitations(id),
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 committed_at timestamptz NOT NULL DEFAULT app.governance_now()
);
REVOKE ALL ON app.committee_management_receipts FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
ALTER FUNCTION app.committee_status(uuid,uuid,uuid) RENAME TO committee_status_before_impr3;
REVOKE ALL ON FUNCTION app.committee_status_before_impr3(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.committee_status(who uuid,sid uuid,sub uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb; mutable_value boolean:=true; t timestamptz:=app.governance_now(); active_count integer;done_count integer;
BEGIN
 result:=app.committee_status_before_impr3(who,sid,sub);
 -- Ask the existing authoritative policy, rather than infer a new UI policy.
 BEGIN PERFORM app.committee_round_for(who,sid,sub,true);
 EXCEPTION WHEN SQLSTATE '40001' THEN mutable_value:=false; END;
 SELECT count(*) FILTER(WHERE revoked_at IS NULL),count(*) FILTER(WHERE revoked_at IS NULL AND submitted_at IS NOT NULL)
 INTO active_count,done_count FROM app.committee_invitations WHERE case_id=(result->>'case')::uuid;
 result:=result||jsonb_build_object('canManage',mutable_value,'serverNow',t,'minimumReasonLength',10,
 'requiredCount',greatest(2,active_count),'completedCount',done_count,'replacementSlots',greatest(0,2-active_count));
 RETURN jsonb_set(result,'{members}',(
 SELECT coalesce(jsonb_agg(m.value||jsonb_build_object(
 'state',CASE WHEN i.revoked_at IS NOT NULL THEN 'revoked' WHEN i.submitted_at IS NOT NULL THEN 'completed' WHEN i.expires_at<=t THEN 'expired' WHEN i.verified_at IS NOT NULL THEN 'verified' ELSE 'invited' END,
 'canRevoke',mutable_value AND i.revoked_at IS NULL AND i.submitted_at IS NULL,
 'canResend',mutable_value AND i.revoked_at IS NULL AND i.submitted_at IS NULL AND i.last_sent_at<=t-interval '60 seconds',
 'resendAvailableAt',i.last_sent_at+interval '60 seconds') ORDER BY m.ord),'[]')
 FROM jsonb_array_elements(result->'members') WITH ORDINALITY m(value,ord)
 JOIN app.committee_invitations i ON i.id=(m.value->>'id')::uuid));
END $$;
REVOKE ALL ON FUNCTION app.committee_status(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.committee_status(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
-- A new invitation generation requires new verification. Earlier verified events remain immutable.
DO $$ DECLARE d text;needle text:='SET active_supervisor_id=who,generation=generation+1,token_hash=';BEGIN
 d:=pg_get_functiondef('app.committee_manage(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid)'::regprocedure);
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'IMPR3_EXPECTED_MANAGEMENT_GENERATION_NOT_FOUND';END IF;
 d:=replace(d,needle,'SET active_supervisor_id=who,generation=generation+1,verified_at=CASE WHEN operation=''resend'' THEN NULL ELSE verified_at END,token_hash=');
 EXECUTE d;
END $$;
ALTER FUNCTION app.committee_manage(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid) RENAME TO committee_manage_before_impr3;
REVOKE ALL ON FUNCTION app.committee_manage_before_impr3(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.committee_manage(who uuid,sid uuid,sub uuid,expected integer,operation text,iid uuid,address text,name_value text,locale_value text,reason_value text,token_digest text,message_id uuid,encrypted text,key_version text,command uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.committee_rounds; prior app.committee_management_receipts; fingerprint text; result jsonb;
BEGIN
 -- The current assigned actor/tenant and exact round are always authorized, including replay.
 -- This existing round lock also serializes revoke against guest finalization.
 r:=app.committee_round_for(who,sid,sub,false);
 fingerprint:=app.packet_hash(jsonb_build_array(who,sub,expected,operation,CASE WHEN operation='invite' THEN NULL ELSE iid END,address,name_value,locale_value,reason_value));
 SELECT * INTO prior FROM app.committee_management_receipts WHERE committee_management_receipts.command=committee_manage.command;
 IF FOUND THEN
  IF prior.actor_id<>who OR prior.submission_id<>sub OR prior.request_digest<>fingerprint THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';
  END IF;
  RETURN app.committee_status(who,sid,sub);
 END IF;
 result:=app.committee_manage_before_impr3(who,sid,sub,expected,operation,iid,address,name_value,locale_value,reason_value,token_digest,message_id,encrypted,key_version,command);
 INSERT INTO app.committee_management_receipts(command,actor_id,submission_id,case_id,operation,invitation_id,request_digest)
 VALUES(committee_manage.command,who,sub,r.case_id,committee_manage.operation,coalesce((SELECT invite_id FROM app.committee_mail_outbox WHERE dedupe=committee_manage.command LIMIT 1),iid),fingerprint);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.committee_manage(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.committee_manage(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.committee_management_receipt(who uuid,sid uuid,sub uuid,request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior app.committee_management_receipts;
BEGIN
 PERFORM app.committee_round_for(who,sid,sub,false);
 SELECT * INTO prior FROM app.committee_management_receipts WHERE command=request_id AND actor_id=who AND submission_id=sub;
 IF NOT FOUND THEN RETURN jsonb_build_object('receipt',NULL,'status',app.committee_status(who,sid,sub));END IF;
 RETURN jsonb_build_object('receipt',jsonb_build_object('command',prior.command,'submission',prior.submission_id,
 'operation',prior.operation,'invitation',prior.invitation_id,'committedAt',prior.committed_at),
 'status',app.committee_status(who,sid,sub));
END $$;
REVOKE ALL ON FUNCTION app.committee_management_receipt(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.committee_management_receipt(uuid,uuid,uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
-- Guest affordances reflect the same sealed-roster predicate enforced by write.
ALTER FUNCTION app.committee_guest_read(uuid,text) RENAME TO committee_guest_read_before_impr3;
REVOKE ALL ON FUNCTION app.committee_guest_read_before_impr3(uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.committee_guest_read(iid uuid,session_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb; r app.committee_rounds; active_count integer;
BEGIN
 result:=app.committee_guest_read_before_impr3(iid,session_digest);
 SELECT * INTO r FROM app.committee_rounds WHERE submission_id=(result->>'submission')::uuid;
 SELECT count(*) INTO active_count FROM app.committee_invitations WHERE case_id=r.case_id AND revoked_at IS NULL;
 RETURN result||jsonb_build_object('canFinalize',
   CASE WHEN result->'amendment'->>'id' IS NOT NULL THEN true
   ELSE r.sealed_at IS NOT NULL AND r.completed_at IS NULL AND active_count>=2 AND result->'receipt'='null'::jsonb END,
   'rosterSealed',r.sealed_at IS NOT NULL,'requiredCount',greatest(2,active_count),'readAt',app.governance_now());
END $$;
REVOKE ALL ON FUNCTION app.committee_guest_read(uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.committee_guest_read(uuid,text) TO capstone_runtime;
