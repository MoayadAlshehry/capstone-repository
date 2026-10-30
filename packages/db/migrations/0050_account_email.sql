-- WORKSPACE_V2 R02: one existing credential lifecycle, private account-only mail.
ALTER TABLE app.account_lifecycle ALTER COLUMN university_id DROP NOT NULL;
ALTER TABLE app.account_lifecycle ADD COLUMN policy text NOT NULL DEFAULT 'LEGACY_V1' CHECK(policy IN ('LEGACY_V1','ACCOUNT_EMAIL_V2'));
ALTER TABLE app.account_lifecycle ADD COLUMN return_path text;
CREATE TABLE app.account_email_outbox (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app.users(id), university_id uuid REFERENCES app.universities(id),
 lifecycle_id uuid REFERENCES app.account_lifecycle(id), purpose text NOT NULL CHECK(purpose IN ('ACCOUNT_SETUP','PASSWORD_RESET','PASSWORD_RESET_COMPLETED')),
 command uuid NOT NULL UNIQUE, command_hash text NOT NULL CHECK(command_hash~'^[0-9a-f]{64}$'),
 ciphertext text, key_id text NOT NULL CHECK(key_id~'^v[0-9]{1,4}$'),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','captured','provider_accepted','failed','unknown','expired')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10), manual_retries integer NOT NULL DEFAULT 0 CHECK(manual_retries BETWEEN 0 AND 1), next_at timestamptz NOT NULL,
 lease uuid, lease_until timestamptz, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, finished_at timestamptz,
 code text NOT NULL DEFAULT 'QUEUED' CHECK(code~'^[A-Z_]{1,40}$'),
 FOREIGN KEY(university_id,user_id) REFERENCES app.users(university_id,id),
 CHECK((purpose='PASSWORD_RESET_COMPLETED' AND lifecycle_id IS NULL) OR (purpose<>'PASSWORD_RESET_COMPLETED' AND lifecycle_id IS NOT NULL)),
 CHECK(ciphertext IS NULL OR (length(ciphertext) BETWEEN 80 AND 40000 AND ciphertext~'^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$'))
);
CREATE INDEX account_email_due ON app.account_email_outbox(next_at) WHERE state IN ('queued','sending','failed','unknown');
CREATE TABLE app.account_email_limits (key text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL, PRIMARY KEY(key,window_start),CHECK(key~'^[0-9a-f]{64}$'));
REVOKE ALL ON app.account_email_outbox,app.account_email_limits FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.account_email_rate(key_digest text,maximum integer,seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c integer; clock timestamptz:=app.lifecycle_now(); bucket timestamptz;
BEGIN
 IF key_digest!~'^[0-9a-f]{64}$' OR maximum NOT BETWEEN 1 AND 100 OR seconds NOT IN (60,3600) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 bucket:=to_timestamp(floor(extract(epoch FROM clock)/seconds)*seconds);
 INSERT INTO app.account_email_limits VALUES(key_digest,bucket,1) ON CONFLICT(key,window_start) DO UPDATE SET count=app.account_email_limits.count+1 RETURNING count INTO c;
 DELETE FROM app.account_email_limits WHERE window_start<clock-interval '2 hours';
 RETURN c<=maximum;
END $$;
CREATE FUNCTION app.account_email_operator(actor uuid,sid uuid,target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.users a JOIN app.auth_sessions s ON s.user_id=a.id JOIN app.users t ON t.id=target
 LEFT JOIN app.universities v ON v.id=a.university_id LEFT JOIN app.universities tv ON tv.id=t.university_id
 WHERE a.id=actor AND s.id=sid AND s.expires_at>app.lifecycle_now() AND a.account_status='active' AND (a.university_id IS NULL OR v.status='active') AND tv.status='active'
 AND ((a.role_code='platform_admin' AND t.role_code='university_admin') OR (a.role_code='university_admin' AND t.university_id=a.university_id AND t.role_code IN ('student','faculty_supervisor'))))
$$;
CREATE FUNCTION app.account_email_target(address text,purpose text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT jsonb_build_object('id',u.id,'email',u.email,'name',u.full_name,'university',u.university_id,'locale',u.locale)
 FROM app.users u LEFT JOIN app.universities v ON v.id=u.university_id
 WHERE u.email=address AND (u.university_id IS NULL OR v.status='active')
 AND (($2='ACCOUNT_SETUP' AND u.account_status='inactive' AND u.role_code IN ('student','faculty_supervisor','university_admin') AND u.university_id IS NOT NULL) OR ($2='PASSWORD_RESET' AND u.account_status='active'))
$$;
CREATE FUNCTION app.account_email_issue(actor uuid,sid uuid,target uuid,purpose text,digest text,message_id uuid,command_id uuid,payload_hash text,encrypted text,key_version text,destination text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.users; old app.account_email_outbox; credential uuid; event uuid:=gen_random_uuid(); clock timestamptz:=app.lifecycle_now(); token_purpose text;
BEGIN
 IF purpose NOT IN ('ACCOUNT_SETUP','PASSWORD_RESET') OR digest!~'^[0-9a-f]{64}$' OR payload_hash!~'^[0-9a-f]{64}$' OR length(encrypted)>40000 OR destination!~'^/(en|ar)/' OR length(destination)>1200 OR destination~'[[:cntrl:]\\]' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('account_email_command:'||command_id::text));
 SELECT * INTO old FROM app.account_email_outbox WHERE command=command_id;
 IF old.id IS NOT NULL THEN IF old.user_id<>target OR old.purpose<>purpose OR old.command_hash<>payload_hash THEN RAISE EXCEPTION 'CONFLICT'; END IF;IF actor IS NOT NULL AND NOT app.account_email_operator(actor,sid,target) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;RETURN old.id; END IF;
 IF actor IS NOT NULL AND NOT app.account_email_operator(actor,sid,target) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('auth_identity:'||target::text));
 SELECT * INTO u FROM app.users WHERE id=target FOR UPDATE;
 IF u.id IS NULL OR (u.university_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.universities WHERE id=u.university_id AND status='active')) OR (purpose='ACCOUNT_SETUP' AND (u.account_status<>'inactive' OR u.university_id IS NULL OR u.role_code NOT IN ('student','faculty_supervisor','university_admin'))) OR (purpose='PASSWORD_RESET' AND u.account_status<>'active') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF NOT app.account_email_rate(encode(sha256(convert_to('issue:'||target::text||':'||purpose,'UTF8')),'hex'),3,3600) THEN RAISE EXCEPTION 'TRY_LATER'; END IF;
 IF EXISTS(SELECT 1 FROM app.account_email_outbox WHERE user_id=target AND account_email_outbox.purpose=$4 AND created_at>clock-interval '60 seconds') THEN RAISE EXCEPTION 'TRY_LATER'; END IF;
 token_purpose:=CASE purpose WHEN 'ACCOUNT_SETUP' THEN 'activation' ELSE 'reset' END;
 UPDATE app.account_lifecycle SET revoked_at=clock WHERE user_id=target AND account_lifecycle.purpose=token_purpose AND consumed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO app.account_lifecycle(user_id,university_id,purpose,digest,issued_by,issued_at,expires_at,policy,return_path)
 VALUES(target,u.university_id,token_purpose,$5,coalesce(actor,target),clock,clock+CASE purpose WHEN 'ACCOUNT_SETUP' THEN interval '24 hours' ELSE interval '1 hour' END,'ACCOUNT_EMAIL_V2',destination) RETURNING id INTO credential;
 INSERT INTO app.account_email_outbox(id,user_id,university_id,lifecycle_id,purpose,command,command_hash,ciphertext,key_id,next_at,created_at,expires_at)
 VALUES(message_id,target,u.university_id,credential,purpose,command_id,payload_hash,encrypted,key_version,clock,clock,clock+CASE purpose WHEN 'ACCOUNT_SETUP' THEN interval '24 hours' ELSE interval '1 hour' END);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key)
 VALUES(event,actor,CASE WHEN actor IS NOT NULL THEN (SELECT role_code FROM app.users WHERE id=actor) ELSE NULL END,CASE WHEN actor IS NULL THEN 'system' ELSE 'user' END,u.university_id,CASE WHEN actor IS NULL THEN 'system.account_email.queued' ELSE 'auth.account_email.queued' END,'user',target,'{}',jsonb_build_object('scope',purpose),'Account-only email queued',event,event);
 INSERT INTO app.outbox_events(event_id,kind) VALUES(event,'core.audit.committed');
 RETURN message_id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.lifecycle_context(who uuid,tenant uuid,purpose text,digest text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT jsonb_build_object('name',u.full_name,'purpose',l.purpose) FROM app.account_lifecycle l JOIN app.users u ON u.id=l.user_id LEFT JOIN app.universities v ON v.id=l.university_id
 WHERE l.user_id=who AND l.university_id IS NOT DISTINCT FROM tenant AND u.university_id IS NOT DISTINCT FROM tenant AND l.purpose=$3 AND l.digest=$4 AND l.consumed_at IS NULL AND l.revoked_at IS NULL AND l.expires_at>app.lifecycle_now() AND (tenant IS NULL OR v.status='active') AND ((l.purpose='activation' AND u.account_status='inactive' AND tenant IS NOT NULL) OR (l.purpose='reset' AND u.account_status='active'))
$$;
CREATE OR REPLACE FUNCTION app.lifecycle_consume(who uuid,tenant uuid,purpose text,digest text,credential text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.users; l app.account_lifecycle; event uuid:=gen_random_uuid(); clock timestamptz;
BEGIN
 IF purpose NOT IN ('activation','reset') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('auth_identity:'||who::text));SELECT * INTO u FROM app.users WHERE id=who AND university_id IS NOT DISTINCT FROM tenant FOR UPDATE;clock:=app.lifecycle_now();
 SELECT * INTO l FROM app.account_lifecycle WHERE user_id=who AND university_id IS NOT DISTINCT FROM tenant AND account_lifecycle.purpose=$3 AND account_lifecycle.digest=$4 FOR UPDATE;
 IF u.id IS NULL OR l.id IS NULL OR l.consumed_at IS NOT NULL OR l.revoked_at IS NOT NULL OR l.expires_at<=clock OR (tenant IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.universities WHERE id=tenant AND status='active')) OR (purpose='activation' AND (u.account_status<>'inactive' OR tenant IS NULL OR u.role_code NOT IN ('student','faculty_supervisor','university_admin'))) OR (purpose='reset' AND u.account_status<>'active') OR length(credential)<50 OR length(credential)>512 THEN RETURN false; END IF;
 INSERT INTO app.auth_accounts(user_id,account_id,provider_id,password) VALUES(who,who::text,'credential',credential) ON CONFLICT(user_id,provider_id) DO UPDATE SET password=excluded.password,updated_at=clock;
 UPDATE app.users SET account_status='active',auth_email_verified=true,updated_at=clock WHERE id=who;
 UPDATE app.account_lifecycle SET consumed_at=clock WHERE id=l.id;DELETE FROM app.auth_sessions WHERE user_id=who;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES(event,who,u.role_code,'user',tenant,'auth.'||purpose||'.complete','user',who,'{}','{"scope":"managed_account"}','Managed account credential completion',event,event);
 INSERT INTO app.notifications(event_id,recipient_id,university_id,type,payload) VALUES(event,who,tenant,'auth.lifecycle.completed','{"route":"/account","message_key":"auth.lifecycle.completed"}');INSERT INTO app.outbox_events(event_id,kind) VALUES(event,'core.audit.committed');RETURN true;
END $$;
CREATE FUNCTION app.account_email_inspect(digest text,purpose text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT jsonb_build_object('status',CASE WHEN l.consumed_at IS NOT NULL THEN 'used' WHEN l.revoked_at IS NOT NULL THEN 'revoked' WHEN l.expires_at<=app.lifecycle_now() THEN 'expired' WHEN u.account_status='suspended' OR (u.university_id IS NOT NULL AND v.status<>'active') THEN 'unavailable' WHEN (l.purpose='activation' AND u.account_status<>'inactive') OR (l.purpose='reset' AND u.account_status<>'active') THEN 'unavailable' ELSE 'valid' END,'id',u.id,'university',u.university_id,'name',u.full_name,'email',u.email,'locale',u.locale,'returnTo',l.return_path,'expiresAt',l.expires_at)
 FROM app.account_lifecycle l JOIN app.users u ON u.id=l.user_id LEFT JOIN app.universities v ON v.id=u.university_id
 WHERE l.digest=$1 AND l.purpose=CASE $2 WHEN 'ACCOUNT_SETUP' THEN 'activation' WHEN 'PASSWORD_RESET' THEN 'reset' ELSE 'INVALID' END
$$;
CREATE FUNCTION app.account_email_complete(digest text,purpose text,credential text,message_id uuid,encrypted text,key_version text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE l app.account_lifecycle; u app.users; clock timestamptz;
BEGIN
 SELECT * INTO l FROM app.account_lifecycle WHERE account_lifecycle.digest=$1 AND account_lifecycle.purpose=CASE $2 WHEN 'ACCOUNT_SETUP' THEN 'activation' WHEN 'PASSWORD_RESET' THEN 'reset' ELSE 'INVALID' END;
 IF l.id IS NULL THEN RETURN false; END IF;
 IF NOT app.lifecycle_consume(l.user_id,l.university_id,l.purpose,$1,credential) THEN RETURN false; END IF;
 IF purpose='PASSWORD_RESET' THEN
  SELECT * INTO u FROM app.users WHERE id=l.user_id;clock:=app.lifecycle_now();
  INSERT INTO app.account_email_outbox(id,user_id,university_id,purpose,command,command_hash,ciphertext,key_id,next_at,created_at,expires_at)
  VALUES(message_id,u.id,u.university_id,'PASSWORD_RESET_COMPLETED',message_id,encode(sha256(convert_to('completed:'||l.id::text,'UTF8')),'hex'),encrypted,key_version,clock,clock,clock+interval '24 hours');
 END IF;RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION app.account_email_claim() RETURNS SETOF app.account_email_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE item app.account_email_outbox; clock timestamptz:=app.lifecycle_now();
BEGIN
 UPDATE app.account_email_outbox e SET state='expired',code='EXPIRED',ciphertext=NULL,lease=NULL,lease_until=NULL WHERE e.state NOT IN ('captured','provider_accepted','expired') AND (e.expires_at<=clock OR NOT EXISTS(SELECT 1 FROM app.users u LEFT JOIN app.universities v ON v.id=u.university_id WHERE u.id=e.user_id AND u.account_status<>'suspended' AND (u.university_id IS NULL OR v.status='active')) OR (e.lifecycle_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.account_lifecycle l WHERE l.id=e.lifecycle_id AND l.revoked_at IS NULL AND l.consumed_at IS NULL AND l.expires_at>clock)));
 SELECT * INTO item FROM app.account_email_outbox WHERE ciphertext IS NOT NULL AND attempts<5+manual_retries*5 AND expires_at>clock AND ((state IN ('queued','unknown','failed') AND next_at<=clock AND code<>'PROVIDER_REJECTED') OR (state='sending' AND lease_until<=clock)) ORDER BY next_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF item.id IS NULL THEN RETURN; END IF;
 UPDATE app.account_email_outbox SET state='sending',attempts=attempts+1,lease=gen_random_uuid(),lease_until=clock+interval '30 seconds' WHERE id=item.id RETURNING * INTO item;
 RETURN NEXT item;
END $$;
CREATE FUNCTION app.account_email_finish(message_id uuid,claim uuid,result text,result_code text,retry_seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE clock timestamptz:=app.lifecycle_now();
BEGIN
 IF result NOT IN ('captured','provider_accepted','failed','unknown') OR result_code!~'^[A-Z_]{1,40}$' OR retry_seconds NOT BETWEEN 30 AND 3600 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 UPDATE app.account_email_outbox SET state=result,code=result_code,lease=NULL,lease_until=NULL,finished_at=CASE WHEN result IN ('captured','provider_accepted') THEN clock ELSE NULL END,ciphertext=CASE WHEN result IN ('captured','provider_accepted') THEN NULL ELSE ciphertext END,next_at=clock+make_interval(secs=>retry_seconds)
 WHERE id=message_id AND lease=claim AND state='sending' AND lease_until>clock;RETURN FOUND;
END $$;
CREATE FUNCTION app.account_email_current(message_id uuid,claim uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.account_email_outbox e JOIN app.users u ON u.id=e.user_id LEFT JOIN app.universities v ON v.id=u.university_id WHERE e.id=message_id AND e.lease=claim AND e.state='sending' AND e.lease_until>app.lifecycle_now() AND e.expires_at>app.lifecycle_now() AND u.account_status<>'suspended' AND (u.university_id IS NULL OR v.status='active') AND (e.lifecycle_id IS NULL OR EXISTS(SELECT 1 FROM app.account_lifecycle l WHERE l.id=e.lifecycle_id AND l.revoked_at IS NULL AND l.consumed_at IS NULL AND l.expires_at>app.lifecycle_now())))
$$;
CREATE FUNCTION app.account_email_retry(actor uuid,sid uuid,message_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE e app.account_email_outbox; clock timestamptz:=app.lifecycle_now(); event uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO e FROM app.account_email_outbox WHERE id=message_id FOR UPDATE;
 IF e.id IS NULL OR NOT app.account_email_operator(actor,sid,e.user_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF e.state NOT IN ('failed','unknown') OR e.ciphertext IS NULL OR e.expires_at<=clock OR e.attempts>=10 OR e.manual_retries>=1 OR (e.lifecycle_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.account_lifecycle WHERE id=e.lifecycle_id AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at>clock)) THEN RETURN false; END IF;
 UPDATE app.account_email_outbox SET state='queued',code='QUEUED',next_at=clock,manual_retries=manual_retries+1 WHERE id=e.id;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES(event,actor,(SELECT role_code FROM app.users WHERE id=actor),'user',e.university_id,'auth.account_email.retry','user',e.user_id,'{}','{"scope":"account_email"}','Account-only email retry',event,event);
 INSERT INTO app.outbox_events(event_id,kind) VALUES(event,'core.audit.committed');RETURN true;
END $$;
CREATE FUNCTION app.account_email_delivery(actor uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.users u JOIN app.auth_sessions s ON s.user_id=u.id LEFT JOIN app.universities v ON v.id=u.university_id WHERE u.id=actor AND s.id=sid AND s.expires_at>app.lifecycle_now() AND u.account_status='active' AND u.role_code IN ('platform_admin','university_admin') AND (u.university_id IS NULL OR v.status='active')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x.record),'[]'::jsonb) FROM (SELECT jsonb_build_object('id',e.id,'user',u.id,'name',u.full_name,'email',u.email,'purpose',e.purpose,'state',e.state,'attempts',e.attempts,'createdAt',e.created_at,'expiresAt',e.expires_at,'code',e.code) AS record FROM app.account_email_outbox e JOIN app.users u ON u.id=e.user_id WHERE app.account_email_operator(actor,sid,u.id) ORDER BY e.created_at DESC LIMIT 100) x);
END
$$;
REVOKE ALL ON FUNCTION app.account_email_current(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.account_email_current(uuid,uuid) TO capstone_jobs;
REVOKE ALL ON FUNCTION app.account_email_rate(text,integer,integer),app.account_email_operator(uuid,uuid,uuid),app.account_email_target(text,text),app.account_email_issue(uuid,uuid,uuid,text,text,uuid,uuid,text,text,text,text),app.account_email_inspect(text,text),app.account_email_complete(text,text,text,uuid,text,text),app.account_email_claim(),app.account_email_finish(uuid,uuid,text,text,integer),app.account_email_retry(uuid,uuid,uuid),app.account_email_delivery(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.account_email_rate(text,integer,integer),app.account_email_target(text,text),app.account_email_issue(uuid,uuid,uuid,text,text,uuid,uuid,text,text,text,text),app.account_email_inspect(text,text),app.account_email_complete(text,text,text,uuid,text,text),app.account_email_retry(uuid,uuid,uuid),app.account_email_delivery(uuid,uuid),app.account_email_operator(uuid,uuid,uuid) TO capstone_runtime;
GRANT EXECUTE ON FUNCTION app.account_email_claim(),app.account_email_finish(uuid,uuid,text,text,integer) TO capstone_jobs;
