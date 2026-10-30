-- Exact-version sharing; no worker or external communication is introduced.
ALTER TABLE app.access_requests ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), ADD COLUMN cancelled_at timestamptz(3), ADD COLUMN cancelled_by uuid REFERENCES app.users(id),
 ADD CONSTRAINT access_justification_bounds CHECK(char_length(btrim(justification)) BETWEEN 20 AND 2000),
 ADD CONSTRAINT access_decision_reason_bounds CHECK(decision_reason IS NULL OR char_length(btrim(decision_reason)) BETWEEN 3 AND 400);
ALTER TABLE app.access_grants ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 ADD CONSTRAINT access_revocation_bounds CHECK(revocation_reason IS NULL OR char_length(btrim(revocation_reason)) BETWEEN 3 AND 400);
CREATE INDEX access_request_project_created ON app.access_requests(project_id,created_at,id);
CREATE INDEX access_grant_grantee_version ON app.access_grants(granted_to,project_id,version_id);
CREATE FUNCTION app.partner_access_now() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT clock_timestamp() $$;
CREATE FUNCTION app.partner_account_eligible(who uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,app AS $$ SELECT EXISTS(SELECT 1 FROM app.users WHERE id=who AND role_code='partner' AND account_status='active' AND partner_status='approved') $$;
CREATE FUNCTION app.partner_archive_eligible(pid uuid,vid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.projects p JOIN app.project_versions v ON v.project_id=p.id AND v.university_id=p.university_id JOIN app.project_submissions s ON s.id=v.approved_submission_id AND s.version_id=v.id AND s.project_id=p.id WHERE p.id=pid AND v.id=vid AND p.assignment_managed AND v.status='archived' AND v.archived_at IS NOT NULL AND EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=s.id AND decision='archived') AND (SELECT count(*) FROM app.internal_assessments WHERE submission_id=s.id AND rubric_code='CORE_V1')=2);
$$;
CREATE FUNCTION app.partner_access_principal(who uuid,sid uuid) RETURNS app.users LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;
BEGIN SELECT * INTO a FROM app.users WHERE id=who;
 IF a.id IS NULL OR a.account_status<>'active' OR NOT EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=sid AND user_id=who AND expires_at>clock_timestamp()) OR (a.university_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.universities WHERE id=a.university_id AND status='active')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;RETURN a;
END $$;
CREATE FUNCTION app.partner_access_event(a app.users,p app.projects,vid uuid,action text,target uuid,correlation uuid,before_value text,after_value text,reason text,recipient uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE ev uuid:=gen_random_uuid();lang text;
BEGIN
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,project_id,version_id,action,object_type,object_id,before_state,after_state,reason,occurred_at,correlation_id,event_key)
 VALUES(ev,a.id,a.role_code,'user',p.university_id,p.id,vid,'partner-access.'||action,CASE WHEN action IN ('grant-created','revoke','protective-revoke') THEN 'access_grant' ELSE 'access_request' END,target,jsonb_build_object('scope',before_value),jsonb_build_object('scope',after_value),reason,app.partner_access_now(),correlation,gen_random_uuid());
 IF recipient IS NOT NULL THEN SELECT locale INTO lang FROM app.users WHERE id=recipient;INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(ev,recipient,p.university_id,p.id,'partner-access.'||action,jsonb_build_object('route','/'||lang||CASE WHEN action='request' THEN '/access/lead' ELSE '/partner/access' END,'message_key','partner-access.'||action));END IF;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');RETURN ev;
END $$;
REVOKE ALL ON FUNCTION app.partner_access_now(),app.partner_account_eligible(uuid),app.partner_archive_eligible(uuid,uuid),app.partner_access_principal(uuid,uuid),app.partner_access_event(app.users,app.projects,uuid,text,uuid,uuid,text,text,text,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.partner_access_command(who uuid,sid uuid,cid uuid,operation text,pid uuid,vid uuid,target uuid,expected integer,body text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;t app.users;p app.projects;r app.access_requests;g app.access_grants;receipt app.command_receipts;partner uuid;lead uuid;digest_value text;ev uuid;created_grant uuid;result jsonb;clock timestamptz(3);next_status text;
BEGIN
 a:=app.partner_access_principal(who,sid);
 IF cid IS NULL OR pid IS NULL OR vid IS NULL OR operation NOT IN ('request','cancel','approve','deny','revoke','protective-revoke') OR expected<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 IF operation='request' THEN partner:=who;
 ELSIF operation IN ('cancel','approve','deny') THEN SELECT requester_id INTO partner FROM app.access_requests WHERE id=target AND project_id=pid AND version_id=vid;
 ELSE SELECT granted_to INTO partner FROM app.access_grants WHERE id=target AND project_id=pid AND version_id=vid;END IF;
 IF partner IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 -- Partner rows serialize eligibility decisions; project rows serialize lead changes.
 -- Academic actor rows are not locked after the project (avoids assignment lock inversion).
 SELECT * INTO t FROM app.users WHERE id=partner FOR UPDATE;
 SELECT * INTO p FROM app.projects WHERE id=pid AND assignment_managed FOR UPDATE;
 a:=app.partner_access_principal(who,sid);
 IF p.id IS NULL OR NOT app.partner_archive_eligible(pid,vid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 SELECT pa.user_id INTO lead FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id AND u.account_status='active' AND u.role_code='student' WHERE pa.project_id=p.id AND pa.is_team_lead;
 IF operation IN ('request','cancel') THEN
  IF a.role_code<>'partner' OR partner<>who THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 ELSIF operation IN ('approve','deny','revoke') THEN
  IF a.role_code<>'student' OR lead IS DISTINCT FROM who OR a.university_id IS DISTINCT FROM p.university_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 ELSE
  IF a.role_code<>'platform_admin' AND NOT(a.role_code='university_admin' AND a.university_id=p.university_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 END IF;
 IF operation='request' AND (body IS NULL OR char_length(btrim(body)) NOT BETWEEN 20 AND 2000 OR body ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F‪-‮⁦-⁩]') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 IF operation IN ('deny','revoke','protective-revoke') AND body IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 IF operation<>'request' AND body IS NOT NULL AND (char_length(btrim(body)) NOT BETWEEN 3 AND 400 OR body ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT app.audit_values_safe(jsonb_build_object('scope',body))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 IF operation='cancel' AND body IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('partner_access_command:'||who::text||':'||cid::text));
 digest_value:=encode(sha256(convert_to(jsonb_build_array(operation,pid,vid,target,expected,body)::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM app.command_receipts WHERE actor_id=who AND command_id=cid;
 IF FOUND THEN IF receipt.action<>'partner-access.'||operation OR receipt.payload_digest<>digest_value THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;RETURN receipt.result;END IF;
 clock:=app.partner_access_now();
 IF operation='request' THEN
  PERFORM app.require_approved_partner(who,sid);
  IF EXISTS(SELECT 1 FROM app.access_requests WHERE requester_id=who AND version_id=vid AND status='pending') OR EXISTS(SELECT 1 FROM app.access_grants WHERE granted_to=who AND project_id=pid AND version_id=vid AND revoked_at IS NULL AND expires_at>clock) OR lead IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
  INSERT INTO app.access_requests(university_id,project_id,version_id,requester_id,justification,created_at) VALUES(p.university_id,pid,vid,who,btrim(body),clock) RETURNING * INTO r;
  ev:=app.partner_access_event(a,p,vid,'request',r.id,cid,'',jsonb_build_object('request',r.id,'state','pending')::text,'Partner requested exact archived edition',lead);
  result:=jsonb_build_object('scope',r.id::text,'row_version',0);
 ELSIF operation IN ('cancel','approve','deny') THEN
  SELECT * INTO r FROM app.access_requests WHERE id=target AND project_id=pid AND version_id=vid FOR UPDATE;
  IF r.status<>'pending' OR r.revision<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
  IF operation='cancel' THEN UPDATE app.access_requests SET status='cancelled',cancelled_by=who,cancelled_at=clock,revision=revision+1 WHERE id=r.id;next_status:='cancelled';
  ELSE
   IF NOT app.partner_account_eligible(partner) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
   next_status:=CASE operation WHEN 'approve' THEN 'approved' ELSE 'denied' END;
   UPDATE app.access_requests SET status=next_status,decided_by=who,decided_at=clock,decision_reason=nullif(btrim(body),''),revision=revision+1 WHERE id=r.id;
   IF operation='approve' THEN
    IF EXISTS(SELECT 1 FROM app.access_grants WHERE granted_to=partner AND project_id=pid AND version_id=vid AND revoked_at IS NULL AND expires_at>clock) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
    INSERT INTO app.access_grants(request_id,university_id,project_id,version_id,granted_to,granted_at,expires_at) VALUES(r.id,p.university_id,pid,vid,partner,clock,clock+interval '90 days') RETURNING id INTO created_grant;
   END IF;
  END IF;
  ev:=app.partner_access_event(a,p,vid,operation,r.id,cid,'pending',jsonb_build_object('request',r.id,'state',next_status,'grant',created_grant,'expiry',CASE WHEN created_grant IS NOT NULL THEN clock+interval '90 days' END)::text,coalesce(nullif(btrim(body),''),'Partner access '||operation),CASE WHEN operation='cancel' THEN NULL ELSE partner END);
  IF created_grant IS NOT NULL THEN PERFORM app.partner_access_event(a,p,vid,'grant-created',created_grant,cid,'',jsonb_build_object('request',r.id,'partner',partner,'expiry',clock+interval '90 days')::text,'Exact edition grant created');END IF;
  result:=jsonb_build_object('scope',coalesce(created_grant,target)::text,'row_version',r.revision+1);
 ELSE
  SELECT * INTO g FROM app.access_grants WHERE id=target AND project_id=pid AND version_id=vid FOR UPDATE;
  IF g.revoked_at IS NOT NULL OR g.expires_at<=clock OR g.revision<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONFLICT';END IF;
  UPDATE app.access_grants SET revoked_at=clock,revoked_by=who,revocation_reason=btrim(body),revision=revision+1 WHERE id=g.id;
  ev:=app.partner_access_event(a,p,vid,operation,g.id,cid,'active',jsonb_build_object('grant',g.id,'state','revoked','partner',partner)::text,btrim(body),partner);
  result:=jsonb_build_object('scope',g.id::text,'row_version',g.revision+1);
 END IF;
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'partner-access.'||operation,digest_value,ev,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.partner_access_command(uuid,uuid,uuid,text,uuid,uuid,uuid,integer,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_access_command(uuid,uuid,uuid,text,uuid,uuid,uuid,integer,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.partner_access_security(who uuid,sid uuid,cid uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;ev uuid:=gen_random_uuid();
BEGIN
 a:=app.partner_access_principal(who,sid);PERFORM pg_advisory_xact_lock(hashtext('partner_access_command:'||who::text||':'||cid::text));
 IF EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=cid) THEN RETURN false;END IF;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES(ev,who,a.role_code,'user','partner-access.request-denied','user',who,'{}','{"scope":"eligibility_or_scope_denied"}','Partner access eligibility or scope denied',cid,gen_random_uuid());
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'partner-access.request-denied',encode(sha256(convert_to('request-denied','UTF8')),'hex'),ev,'{"scope":"denied"}');RETURN true;
END $$;
REVOKE ALL ON FUNCTION app.partner_access_security(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_access_security(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.partner_access_view(who uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;clock timestamptz:=app.partner_access_now();requests jsonb;grants jsonb;
BEGIN
 a:=app.partner_access_principal(who,sid);
 IF a.role_code NOT IN ('partner','student','university_admin','platform_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'project',r.project_id,'version',r.version_id,'versionNumber',v.version_number,'title',s.metadata_snapshot->>'title','partnerName',u.full_name,'organization',u.organization_name,'justification',r.justification,'status',r.status,'revision',r.revision,'createdAt',r.created_at,'decidedAt',r.decided_at,'reason',r.decision_reason,'cancelledAt',r.cancelled_at,'eligible',app.partner_account_eligible(u.id)) ORDER BY r.created_at DESC,r.id),'[]') INTO requests
 FROM app.access_requests r JOIN app.project_versions v ON v.id=r.version_id JOIN app.project_submissions s ON s.id=v.approved_submission_id JOIN app.users u ON u.id=r.requester_id
 WHERE (a.role_code='partner' AND r.requester_id=who) OR (a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=r.project_id AND user_id=who AND is_team_lead));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'request',g.request_id,'project',g.project_id,'version',g.version_id,'versionNumber',v.version_number,'title',s.metadata_snapshot->>'title','partnerName',u.full_name,'organization',u.organization_name,'revision',g.revision,'grantedAt',g.granted_at,'expiresAt',g.expires_at,'revokedAt',g.revoked_at,'reason',g.revocation_reason,'state',CASE WHEN g.revoked_at IS NOT NULL THEN 'revoked' WHEN g.expires_at<=clock THEN 'expired' ELSE 'active' END,'canRead',g.revoked_at IS NULL AND g.expires_at>clock AND app.partner_account_eligible(g.granted_to)) ORDER BY g.granted_at DESC,g.id),'[]') INTO grants
 FROM app.access_grants g JOIN app.project_versions v ON v.id=g.version_id JOIN app.project_submissions s ON s.id=v.approved_submission_id JOIN app.users u ON u.id=g.granted_to
 WHERE (a.role_code='partner' AND g.granted_to=who) OR (a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=g.project_id AND user_id=who AND is_team_lead)) OR a.role_code='platform_admin' OR (a.role_code='university_admin' AND g.university_id=a.university_id);
 RETURN jsonb_build_object('now',clock,'lead',a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE user_id=who AND is_team_lead),'requests',requests,'grants',grants);
END $$;
REVOKE ALL ON FUNCTION app.partner_access_view(uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_access_view(uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.partner_grant_valid(who uuid,sid uuid,gid uuid,pid uuid,vid uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT app.partner_account_eligible(who) AND EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=sid AND user_id=who AND expires_at>clock_timestamp()) AND app.partner_archive_eligible(pid,vid) AND EXISTS(SELECT 1 FROM app.access_grants WHERE id=gid AND granted_to=who AND project_id=pid AND version_id=vid AND revoked_at IS NULL AND app.partner_access_now()<expires_at);
$$;
ALTER FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid) RENAME TO file_delivery_read_pre_grants;
REVOKE ALL ON FUNCTION app.file_delivery_read_pre_grants(text,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.file_delivery_read(kind text,reader uuid,sid uuid,pid uuid,vid uuid,fid uuid,sub uuid,gid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;
BEGIN
 IF kind IS DISTINCT FROM 'partner-grant' THEN RETURN app.file_delivery_read_pre_grants(kind,reader,sid,pid,vid,fid,sub);END IF;
 IF sub IS NOT NULL OR NOT app.partner_grant_valid(reader,sid,gid,pid,vid) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM app.project_versions v JOIN app.submission_files m ON m.submission_id=v.approved_submission_id JOIN app.project_files f ON f.id=m.file_id AND f.project_id=pid AND f.version_id=vid AND f.is_current AND f.processing_status='ready' LEFT JOIN app.storage_objects o ON o.id=m.storage_object_id WHERE v.id=vid AND v.project_id=pid AND (fid IS NULL OR f.id=fid) AND (o.id IS NULL OR (f.storage_object_id,f.size_bytes,f.sha256,f.relative_path,f.detected_mime,f.extension) IS DISTINCT FROM (m.storage_object_id,m.size_at_submit,m.sha256_at_submit,m.relative_path,m.mime_at_submit,m.extension_at_submit) OR (o.size_bytes,o.sha256) IS DISTINCT FROM (m.size_at_submit,m.sha256_at_submit))) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INTEGRITY_FAILED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'project',pid,'version',vid,'path',m.relative_path,'name',regexp_replace(m.relative_path,'^.*/',''),'extension',m.extension_at_submit,'mime',m.mime_at_submit,'size',m.size_at_submit,'sha256',m.sha256_at_submit,'visibility',f.visibility,'status','ready')||CASE WHEN fid IS NOT NULL THEN jsonb_build_object('key',o.storage_key) ELSE '{}'::jsonb END ORDER BY m.relative_path,f.id),'[]') INTO result
 FROM app.project_versions v JOIN app.submission_files m ON m.submission_id=v.approved_submission_id AND m.project_id=pid AND m.version_id=vid AND m.university_id=v.university_id JOIN app.project_files f ON f.id=m.file_id AND f.project_id=pid AND f.version_id=vid AND f.university_id=v.university_id AND f.is_current AND f.processing_status='ready' JOIN app.storage_objects o ON o.id=m.storage_object_id AND o.project_id=pid AND o.university_id=v.university_id
 WHERE v.id=vid AND v.project_id=pid AND (fid IS NULL OR f.id=fid) AND (f.storage_object_id,f.size_bytes,f.sha256,f.relative_path,f.detected_mime,f.extension)=(m.storage_object_id,m.size_at_submit,m.sha256_at_submit,m.relative_path,m.mime_at_submit,m.extension_at_submit) AND (o.size_bytes,o.sha256)=(m.size_at_submit,m.sha256_at_submit);
 IF fid IS NOT NULL AND jsonb_array_length(result)<>1 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;RETURN CASE WHEN fid IS NULL THEN jsonb_build_object('files',result) ELSE result->0 END;
END $$;
CREATE FUNCTION app.file_delivery_read(kind text,reader uuid,sid uuid,pid uuid,vid uuid,fid uuid DEFAULT NULL,sub uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ SELECT app.file_delivery_read(kind,reader,sid,pid,vid,fid,sub,NULL) $$;
REVOKE ALL ON FUNCTION app.partner_grant_valid(uuid,uuid,uuid,uuid,uuid),app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid),app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid),app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
CREATE FUNCTION app.partner_access_frozen_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HISTORICAL_ACCESS';END IF;
 IF TG_TABLE_NAME='access_requests' THEN
  IF OLD.status<>'pending' OR NEW.status NOT IN ('approved','denied','cancelled') OR (NEW.id,NEW.university_id,NEW.project_id,NEW.version_id,NEW.requester_id,NEW.requester_role,NEW.justification,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.university_id,OLD.project_id,OLD.version_id,OLD.requester_id,OLD.requester_role,OLD.justification,OLD.created_at) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HISTORICAL_ACCESS';END IF;
 ELSE
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR (NEW.id,NEW.request_id,NEW.university_id,NEW.project_id,NEW.version_id,NEW.granted_to,NEW.request_status,NEW.granted_at,NEW.expires_at) IS DISTINCT FROM (OLD.id,OLD.request_id,OLD.university_id,OLD.project_id,OLD.version_id,OLD.granted_to,OLD.request_status,OLD.granted_at,OLD.expires_at) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HISTORICAL_ACCESS';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER partner_request_history BEFORE UPDATE OR DELETE ON app.access_requests FOR EACH ROW EXECUTE FUNCTION app.partner_access_frozen_guard();
CREATE TRIGGER partner_grant_history BEFORE UPDATE OR DELETE ON app.access_grants FOR EACH ROW EXECUTE FUNCTION app.partner_access_frozen_guard();
REVOKE ALL ON FUNCTION app.partner_access_frozen_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER TABLE app.access_grants ADD CONSTRAINT grant_revocation_complete CHECK((revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL));
