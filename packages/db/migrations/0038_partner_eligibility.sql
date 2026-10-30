-- Platform partners remain independent of academic tenants and file grants.
ALTER TABLE app.users
 ADD COLUMN partner_revision integer NOT NULL DEFAULT 0 CHECK(partner_revision>=0),
 ADD COLUMN partner_reason text CHECK(length(partner_reason) BETWEEN 3 AND 400),
 ADD COLUMN partner_decided_by uuid REFERENCES app.users(id),
 ADD COLUMN partner_decided_at timestamptz(3),
 ADD CONSTRAINT partner_decision_pair CHECK((partner_decided_by IS NULL)=(partner_decided_at IS NULL)),
 ADD CONSTRAINT partner_decision_scope CHECK(role_code='partner' OR (partner_reason IS NULL AND partner_decided_by IS NULL AND partner_decided_at IS NULL AND partner_revision=0));
CREATE TABLE app.partner_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES app.users(id),
 actor_id uuid NOT NULL REFERENCES app.users(id), revision integer NOT NULL CHECK(revision>=0),
 old_status text CHECK(old_status IN ('pending','approved','rejected','suspended')),
 new_status text NOT NULL CHECK(new_status IN ('pending','approved','rejected','suspended')),
 reason text CHECK(length(reason) BETWEEN 3 AND 400), occurred_at timestamptz(3) NOT NULL,
 audit_id uuid NOT NULL UNIQUE REFERENCES app.audit_logs(id), UNIQUE(partner_id,revision),
 CHECK((old_status IS NULL AND new_status='pending' AND revision=0) OR
 (old_status='pending' AND new_status IN ('approved','rejected')) OR
 (old_status='rejected' AND new_status='pending') OR
 (old_status='approved' AND new_status='suspended') OR
 (old_status='suspended' AND new_status='approved')),
 CHECK(new_status NOT IN ('rejected','suspended') OR reason IS NOT NULL)
);
CREATE TRIGGER immutable_partner_history BEFORE UPDATE OR DELETE ON app.partner_history FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE INDEX partner_status_created ON app.users(partner_status,created_at,id) WHERE role_code='partner';
REVOKE ALL ON app.partner_history FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.partner_register(name text,email text,organization text,credential text,locale text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE target uuid:=gen_random_uuid();event uuid:=gen_random_uuid();clock timestamptz(3):=clock_timestamp();
BEGIN
 IF char_length(btrim(name)) NOT BETWEEN 1 AND 200 OR name ~ '[[:cntrl:]‪-‮⁦-⁩]' OR
 char_length(btrim(organization)) NOT BETWEEN 1 AND 200 OR organization ~ '[[:cntrl:]‪-‮⁦-⁩]' OR
 email IS DISTINCT FROM lower(btrim(email)) OR char_length(email)>254 OR email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
 locale NOT IN ('en','ar') OR credential !~ '^[0-9a-f]{32}:[0-9a-f]{128}$' THEN
 RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 -- Email uniqueness serializes concurrent registrations; conflicts reveal no identity.
 INSERT INTO app.users(id,full_name,email,organization_name,role_code,partner_status,account_status,locale,created_at,updated_at)
 VALUES(target,btrim(name),email,btrim(organization),'partner','pending','active',locale,clock,clock)
 ON CONFLICT ON CONSTRAINT users_email_key DO NOTHING;
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO app.auth_accounts(user_id,account_id,provider_id,password) VALUES(target,target::text,'credential',credential);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key)
 VALUES(event,target,'partner','user','partner.register','user',target,'{}','{"scope":"pending"}','Partner self-registration',gen_random_uuid(),gen_random_uuid());
 INSERT INTO app.partner_history(partner_id,actor_id,revision,new_status,occurred_at,audit_id) VALUES(target,target,0,'pending',clock,event);
 INSERT INTO app.outbox_events(event_id,kind) VALUES(event,'core.audit.committed');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION app.partner_register(text,text,text,text,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_register(text,text,text,text,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.partner_view(actor uuid,session_id uuid,status_filter text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users; result jsonb;
BEGIN
 SELECT * INTO a FROM app.users WHERE id=actor;
 IF a.id IS NULL OR a.account_status<>'active' OR NOT EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=session_id AND user_id=actor AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION USING ERRCODE='28000',MESSAGE='UNAUTHENTICATED';END IF;
 IF a.role_code NOT IN ('partner','platform_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF status_filter IS NOT NULL AND status_filter NOT IN ('pending','approved','rejected','suspended') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'email',u.email,'organization',u.organization_name,'accountStatus',u.account_status,'status',u.partner_status,'revision',u.partner_revision,'reason',u.partner_reason,'createdAt',u.created_at,'updatedAt',u.updated_at,'decidedAt',u.partner_decided_at,
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revision',h.revision,'from',h.old_status,'to',h.new_status,'reason',h.reason,'at',h.occurred_at) ORDER BY h.revision) FROM app.partner_history h WHERE h.partner_id=u.id),'[]')) ORDER BY u.created_at,u.id),'[]') INTO result
 FROM app.users u WHERE u.role_code='partner' AND (a.role_code='platform_admin' OR u.id=actor) AND (status_filter IS NULL OR u.partner_status=status_filter);
 RETURN result;
END $$;
CREATE FUNCTION app.require_approved_partner(actor uuid,session_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- Shared row lock orders an eligibility check against a concurrent suspension.
 PERFORM 1 FROM app.users WHERE id=actor AND role_code='partner' AND account_status='active' AND partner_status='approved' FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=session_id AND user_id=actor AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION app.partner_view(uuid,uuid,text),app.require_approved_partner(uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_view(uuid,uuid,text),app.require_approved_partner(uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.partner_command(actor uuid,session_id uuid,command_id uuid,target uuid,command text,expected_revision integer,reason text,organization text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;t app.users;r app.command_receipts;event uuid:=gen_random_uuid();clock timestamptz(3);next_status text;payload text;result jsonb;
BEGIN
 -- Stable global ordering prevents actor/target and cross-command deadlocks.
 PERFORM 1 FROM app.users WHERE id IN (actor,target) ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM app.users WHERE id=actor;
 clock:=clock_timestamp();
 IF a.id IS NULL OR a.account_status<>'active' OR NOT EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=session_id AND user_id=actor AND expires_at>clock) THEN RAISE EXCEPTION USING ERRCODE='28000',MESSAGE='UNAUTHENTICATED';END IF;
 IF command='resubmit' THEN
  IF a.role_code<>'partner' OR actor<>target THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
  IF char_length(btrim(organization)) NOT BETWEEN 1 AND 200 OR organization ~ '[[:cntrl:]‪-‮⁦-⁩]' OR reason IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 ELSIF command IN ('approve','reject','suspend','reapprove') THEN
  IF a.role_code<>'platform_admin' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
  IF organization IS NOT NULL OR (command IN ('reject','suspend') AND reason IS NULL) OR
  (reason IS NOT NULL AND (char_length(btrim(reason)) NOT BETWEEN 3 AND 400 OR reason ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT app.audit_values_safe(jsonb_build_object('scope',reason)))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 payload:=encode(sha256(convert_to(jsonb_build_array(target,command,expected_revision,reason,organization)::text,'UTF8')),'hex');
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=actor AND command_receipts.command_id=$3;
 IF FOUND THEN
  IF r.action<>'partner.'||command OR r.payload_digest<>payload THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
  RETURN r.result;
 END IF;
 SELECT * INTO t FROM app.users WHERE id=target AND role_code='partner' AND account_status='active';
 IF t.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF t.partner_revision<>expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
 next_status:=CASE
 WHEN command='approve' AND t.partner_status='pending' THEN 'approved'
 WHEN command='reject' AND t.partner_status='pending' THEN 'rejected'
 WHEN command='suspend' AND t.partner_status='approved' THEN 'suspended'
 WHEN command='reapprove' AND t.partner_status='suspended' THEN 'approved'
 WHEN command='resubmit' AND t.partner_status='rejected' THEN 'pending' END;
 IF next_status IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
 UPDATE app.users SET partner_status=next_status,partner_revision=partner_revision+1,
 partner_reason=CASE WHEN next_status IN ('rejected','suspended') THEN btrim(reason) ELSE NULL END,
 partner_decided_by=CASE WHEN command='resubmit' THEN NULL ELSE actor END,
 partner_decided_at=CASE WHEN command='resubmit' THEN NULL ELSE clock END,
 organization_name=CASE WHEN command='resubmit' THEN btrim(organization) ELSE organization_name END,updated_at=clock WHERE id=target;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,action,object_type,object_id,before_state,after_state,reason,occurred_at,correlation_id,event_key)
 VALUES(event,actor,a.role_code,'user','partner.'||command,'user',target,jsonb_build_object('scope',t.partner_status),jsonb_build_object('scope',next_status),coalesce(btrim(reason),'Partner '||command),clock,command_id,gen_random_uuid());
 INSERT INTO app.partner_history(partner_id,actor_id,revision,old_status,new_status,reason,occurred_at,audit_id) VALUES(target,actor,t.partner_revision+1,t.partner_status,next_status,nullif(btrim(reason),''),clock,event);
 IF command<>'resubmit' THEN
  INSERT INTO app.notifications(event_id,recipient_id,type,payload) VALUES(event,target,'partner.'||command,jsonb_build_object('route','/'||t.locale||'/partner','message_key','partner.'||command));
 END IF;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(event,'core.audit.committed');
 result:=jsonb_build_object('scope',next_status,'row_version',t.partner_revision+1);
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(actor,command_id,'partner.'||command,payload,event,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.partner_command(uuid,uuid,uuid,uuid,text,integer,text,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_command(uuid,uuid,uuid,uuid,text,integer,text,text) TO capstone_runtime;
