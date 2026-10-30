-- Phase26 recipient-scoped state and safe operational query surface.
ALTER TABLE app.notifications DROP CONSTRAINT notifications_payload_check;
ALTER TABLE app.notifications ADD CONSTRAINT notifications_payload_safe CHECK(jsonb_typeof(payload)='object' AND payload - ARRAY['route','message_key','args','link']='{}'::jsonb);
REVOKE ALL ON app.notifications FROM capstone_runtime,capstone_jobs;
CREATE INDEX notification_recipient_order ON app.notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX notification_recipient_unread ON app.notifications(recipient_id) WHERE read_at IS NULL;
CREATE FUNCTION app.governance_now() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$ SELECT clock_timestamp() $$;
REVOKE ALL ON FUNCTION app.governance_now() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.notice_link(n app.notifications) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE route text:=regexp_replace(coalesce(n.payload->>'route',''),'^/(en|ar)(/|$)','/');obj uuid;g uuid;
BEGIN
 IF n.type IN ('partner-access.approve','partner-access.revoke','partner-access.protective-revoke') THEN
 SELECT l.object_id INTO obj FROM app.audit_logs l WHERE l.id=n.event_id;
 SELECT id INTO g FROM app.access_grants WHERE granted_to=n.recipient_id AND project_id=n.project_id AND (request_id=obj OR id=obj) ORDER BY granted_at DESC LIMIT 1;
 IF g IS NOT NULL THEN RETURN jsonb_build_object('kind','grant','id',g);END IF;
 END IF;
 IF route ~ '^/submissions/[0-9a-f-]{36}$' THEN RETURN jsonb_build_object('kind','submission','id',split_part(route,'/',3));END IF;
 IF route ~ '^/projects/[0-9a-f-]{36}$' THEN RETURN jsonb_build_object('kind','project','id',split_part(route,'/',3));END IF;
 IF route='/access/lead' THEN RETURN jsonb_build_object('kind','lead','project',n.project_id);END IF;
 IF route='/partner/access' THEN RETURN '{"kind":"partner-access"}'::jsonb;END IF;
 IF route='/partner' THEN RETURN '{"kind":"partner"}'::jsonb;END IF;
 IF route='/account' THEN RETURN '{"kind":"account"}'::jsonb;END IF;
 IF route='/admin/university' THEN RETURN '{"kind":"university-admin"}'::jsonb;END IF;
 RETURN '{"kind":"unavailable"}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION app.notice_link(app.notifications) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.notice_query(reader uuid,sid uuid,unread boolean,cutoff timestamptz DEFAULT NULL,last_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;count_value bigint;
BEGIN
 PERFORM app.partner_access_principal(reader,sid);
 SELECT count(*) INTO count_value FROM app.notifications WHERE recipient_id=reader AND read_at IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (SELECT n.id,n.type,n.created_at,n.read_at,jsonb_strip_nulls(jsonb_build_object('deadline',(SELECT deadline FROM app.reminder_targets t WHERE t.event_id=n.event_id))) args,app.notice_link(n) link FROM app.notifications n WHERE n.recipient_id=reader AND (NOT unread OR n.read_at IS NULL) AND (cutoff IS NULL OR (n.created_at,n.id)<(cutoff,last_id)) ORDER BY n.created_at DESC,n.id DESC LIMIT 21) q;
 RETURN jsonb_build_object('items',result,'unread',count_value);
END $$;
CREATE FUNCTION app.notice_read(reader uuid,sid uuid,target uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.partner_access_principal(reader,sid);
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.notifications WHERE id=target AND recipient_id=reader) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 UPDATE app.notifications SET read_at=app.governance_now() WHERE recipient_id=reader AND read_at IS NULL AND (target IS NULL OR id=target);
END $$;
CREATE FUNCTION app.notice_target(reader uuid,sid uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE n app.notifications;l jsonb;a app.users;
BEGIN
 a:=app.partner_access_principal(reader,sid);SELECT * INTO n FROM app.notifications WHERE id=target AND recipient_id=reader;IF n.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;l:=app.notice_link(n);
 CASE l->>'kind'
 WHEN 'grant' THEN IF NOT EXISTS(SELECT 1 FROM app.access_grants g WHERE g.id=(l->>'id')::uuid AND app.partner_grant_valid(reader,sid,g.id,g.project_id,g.version_id)) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 WHEN 'submission' THEN PERFORM app.submission_read(reader,sid,(l->>'id')::uuid);
 WHEN 'project' THEN IF NOT EXISTS(SELECT 1 FROM app.projects p WHERE p.id=(l->>'id')::uuid AND p.university_id=a.university_id AND (p.supervisor_id=reader OR EXISTS(SELECT 1 FROM app.project_authors x WHERE x.project_id=p.id AND x.user_id=reader))) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 WHEN 'lead' THEN IF NOT EXISTS(SELECT 1 FROM app.project_authors x WHERE x.project_id=n.project_id AND x.user_id=reader AND x.is_team_lead) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 WHEN 'partner-access' THEN IF a.role_code<>'partner' THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 WHEN 'partner' THEN IF a.role_code<>'partner' THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 WHEN 'university-admin' THEN IF a.role_code<>'university_admin' THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 WHEN 'account' THEN NULL;
 ELSE RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END CASE;
 RETURN l;
END $$;
REVOKE ALL ON FUNCTION app.notice_query(uuid,uuid,boolean,timestamptz,uuid),app.notice_read(uuid,uuid,uuid),app.notice_target(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.notice_query(uuid,uuid,boolean,timestamptz,uuid),app.notice_read(uuid,uuid,uuid),app.notice_target(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE INDEX audit_scope_order ON app.audit_logs(university_id,occurred_at DESC,id DESC);
CREATE INDEX audit_project_order ON app.audit_logs(project_id,occurred_at DESC,id DESC);
CREATE FUNCTION app.governance_audit(reader uuid,sid uuid,filters jsonb,oversight uuid DEFAULT NULL,reason_value text DEFAULT NULL,command uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;result jsonb;ev uuid:=gen_random_uuid();
BEGIN
 a:=app.partner_access_principal(reader,sid);IF a.role_code NOT IN ('faculty_supervisor','university_admin','platform_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(filters) k WHERE k NOT IN ('actor','action','project','from','to','before','beforeId')) OR char_length(coalesce(filters->>'action',''))>100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FILTER';END IF;
 IF oversight IS NOT NULL THEN
 IF a.role_code<>'platform_admin' OR command IS NULL OR char_length(btrim(coalesce(reason_value,''))) NOT BETWEEN 3 AND 400 OR reason_value ~ '[[:cntrl:]]' OR reason_value ~* '(password|token|secret|cookie)[[:space:]]*[:=]' OR NOT EXISTS(SELECT 1 FROM app.universities WHERE id=oversight AND status='active') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(reader::text||command::text,26));
 IF EXISTS(SELECT 1 FROM app.audit_logs WHERE actor_id=reader AND event_key=command AND action='audit.oversight.read' AND (object_id<>oversight OR reason IS DISTINCT FROM btrim(reason_value) OR (after_state->>'scope')::jsonb->>'queryDigest' IS DISTINCT FROM sha256(convert_to(filters::text,'UTF8'))::text)) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.audit_logs WHERE actor_id=reader AND event_key=command AND action='audit.oversight.read') THEN
 INSERT INTO app.audit_logs(id,actor_id,actor_role,action,object_type,object_id,reason,correlation_id,event_key,after_state) VALUES(ev,reader,a.role_code,'audit.oversight.read','university',oversight,btrim(reason_value),command,command,jsonb_build_object('scope',jsonb_build_object('university',oversight,'queryDigest',sha256(convert_to(filters::text,'UTF8'))::text)::text));END IF;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (
 SELECT l.id,l.actor_id,l.actor_role,l.action,l.object_type,l.object_id,l.project_id,l.version_id,l.university_id,l.occurred_at,l.correlation_id,coalesce(u.full_name,'System') actor,
 CASE WHEN l.before_state->>'status' IN ('active','inactive','suspended','pending','approved','denied','archived','rejected','restricted','public') THEN l.before_state->>'status' ELSE NULL END before_status,
 CASE WHEN l.after_state->>'status' IN ('active','inactive','suspended','pending','approved','denied','archived','rejected','restricted','public') THEN l.after_state->>'status' ELSE NULL END after_status
 FROM app.audit_logs l LEFT JOIN app.users u ON u.id=l.actor_id
 WHERE (CASE WHEN a.role_code='platform_admin' THEN CASE WHEN oversight IS NULL THEN l.university_id IS NULL AND (l.actor_role='platform_admin' OR l.actor_kind='system') ELSE l.university_id=oversight END WHEN a.role_code='university_admin' THEN l.university_id=a.university_id ELSE l.university_id=a.university_id AND EXISTS(SELECT 1 FROM app.projects p WHERE p.id=l.project_id AND p.supervisor_id=reader AND p.university_id=a.university_id) END)
 AND (filters->>'actor' IS NULL OR l.actor_id=(filters->>'actor')::uuid) AND (filters->>'action' IS NULL OR l.action=filters->>'action') AND (filters->>'project' IS NULL OR l.project_id=(filters->>'project')::uuid)
 AND (filters->>'from' IS NULL OR l.occurred_at>=(filters->>'from')::timestamptz) AND (filters->>'to' IS NULL OR l.occurred_at<=(filters->>'to')::timestamptz)
 AND (filters->>'before' IS NULL OR (l.occurred_at,l.id)<((filters->>'before')::timestamptz,(filters->>'beforeId')::uuid))
 ORDER BY l.occurred_at DESC,l.id DESC LIMIT 21) q;
 RETURN jsonb_build_object('items',result,'scope',CASE WHEN oversight IS NOT NULL THEN 'logged-oversight' WHEN a.role_code='platform_admin' THEN 'platform-governance' WHEN a.role_code='university_admin' THEN 'university' ELSE 'current-supervision' END);
END $$;
REVOKE ALL ON FUNCTION app.governance_audit(uuid,uuid,jsonb,uuid,text,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_audit(uuid,uuid,jsonb,uuid,text,uuid) TO capstone_runtime;
--> statement-breakpoint
-- The jobs role owns only the private queue namespace and finite support functions.
GRANT CREATE ON SCHEMA jobs TO capstone_jobs;
GRANT USAGE ON SCHEMA app TO capstone_jobs;
CREATE TABLE app.reminder_targets(id uuid PRIMARY KEY,recipient_id uuid NOT NULL REFERENCES app.users(id),kind text NOT NULL CHECK(kind IN ('review-offer','review-task')),deadline timestamptz NOT NULL,event_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),resolved_at timestamptz,created_at timestamptz NOT NULL DEFAULT app.governance_now(),UNIQUE(id,recipient_id,kind));
REVOKE ALL ON app.reminder_targets FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.reminder_register(target uuid,recipient uuid,kind_value text,deadline_value timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF deadline_value<=app.governance_now() OR deadline_value>app.governance_now()+interval '366 days' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DEADLINE';END IF;
 INSERT INTO app.reminder_targets(id,recipient_id,kind,deadline) VALUES(target,recipient,kind_value,deadline_value) ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM app.reminder_targets WHERE id=target AND recipient_id=recipient AND kind=kind_value AND deadline=deadline_value) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TARGET_CONFLICT';END IF;
END $$;
CREATE FUNCTION app.reminder_resolve(target uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN UPDATE app.reminder_targets SET resolved_at=coalesce(resolved_at,app.governance_now()) WHERE id=target;END $$;
CREATE FUNCTION app.reminder_deliver(target uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.reminder_targets;ev uuid;
BEGIN
 SELECT * INTO t FROM app.reminder_targets WHERE id=target FOR UPDATE;ev:=t.event_id;
 IF t.id IS NULL OR t.resolved_at IS NOT NULL OR app.governance_now()<t.deadline-interval '24 hours' OR app.governance_now()>=t.deadline OR NOT EXISTS(SELECT 1 FROM app.users WHERE id=t.recipient_id AND account_status='active') THEN RETURN 'suppressed';END IF;
 INSERT INTO app.audit_logs(id,actor_kind,action,object_type,object_id,correlation_id,event_key,after_state,occurred_at) VALUES(ev,'system','system.reminder.due','reminder_target',t.id,ev,ev,'{}',app.governance_now()) ON CONFLICT(id) DO NOTHING;
 INSERT INTO app.notifications(event_id,recipient_id,type,payload,created_at) VALUES(ev,t.recipient_id,'reminder.'||t.kind,jsonb_build_object('message_key','reminder.'||t.kind,'args',jsonb_build_object('deadline',t.deadline),'link',jsonb_build_object('kind','reminder-target','id',t.id)),app.governance_now()) ON CONFLICT(event_id,recipient_id,type) DO NOTHING;
 RETURN 'delivered';
END $$;
REVOKE ALL ON FUNCTION app.reminder_register(uuid,uuid,text,timestamptz),app.reminder_resolve(uuid),app.reminder_deliver(uuid) FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.reminder_register(uuid,uuid,text,timestamptz),app.reminder_resolve(uuid),app.reminder_deliver(uuid) TO capstone_jobs;
--> statement-breakpoint
-- Shared cleanup selection, reused by both authenticated cleanup and the worker.
CREATE FUNCTION app.cleanup_staging_keys(pid uuid) RETURNS TABLE(key uuid,kind text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM 1 FROM app.projects WHERE id=pid FOR UPDATE;
 UPDATE app.file_reservations SET status='expired' WHERE project_id=pid AND status='active' AND expires_at<=app.governance_now();
 UPDATE app.upload_sessions u SET status='expired' WHERE u.project_id=pid AND u.status='active' AND (u.activity_at+interval '24 hours'<=app.governance_now() OR EXISTS(SELECT 1 FROM app.file_reservations r WHERE r.id=u.reservation_id AND r.status IN ('expired','cancelled','failed')));
 RETURN QUERY SELECT r.staging_key,'object'::text FROM app.file_reservations r WHERE r.project_id=pid AND r.status IN ('expired','cancelled','failed') AND NOT EXISTS(SELECT 1 FROM app.storage_objects o WHERE o.storage_key=r.staging_key) AND NOT EXISTS(SELECT 1 FROM app.project_files f WHERE f.storage_object_id=r.staging_key) FOR UPDATE;
 RETURN QUERY SELECT u.transfer_key,'transfer'::text FROM app.upload_sessions u WHERE u.project_id=pid AND u.status IN ('expired','cancelled','failed','completed') AND NOT EXISTS(SELECT 1 FROM app.storage_objects o WHERE o.storage_key=u.transfer_key) AND NOT EXISTS(SELECT 1 FROM app.project_files f WHERE f.storage_object_id=u.transfer_key) FOR UPDATE;
END $$;
CREATE OR REPLACE FUNCTION app.file_cleanup(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN PERFORM app.file_actor(reader,sid,pid,vid,false);RETURN QUERY SELECT k.key FROM app.cleanup_staging_keys(pid) k WHERE k.kind='object';END $$;
CREATE OR REPLACE FUNCTION app.upload_cleanup(reader uuid,sid uuid,pid uuid,vid uuid) RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN PERFORM app.upload_view(reader,sid,pid,vid);RETURN QUERY SELECT k.key FROM app.cleanup_staging_keys(pid) k WHERE k.kind='transfer';END $$;
CREATE FUNCTION app.worker_cleanup() RETURNS TABLE(key uuid,kind text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p uuid;
BEGIN
 FOR p IN SELECT id FROM app.projects WHERE EXISTS(SELECT 1 FROM app.file_reservations r WHERE r.project_id=projects.id AND (r.status IN ('expired','cancelled','failed') OR r.status='active' AND r.expires_at<=app.governance_now())) OR EXISTS(SELECT 1 FROM app.upload_sessions u WHERE u.project_id=projects.id AND (u.status IN ('expired','cancelled','failed','completed') OR u.status='active' AND u.activity_at+interval '24 hours'<=app.governance_now())) ORDER BY id LIMIT 20 LOOP
 RETURN QUERY SELECT * FROM app.cleanup_staging_keys(p);
 END LOOP;
END $$;
CREATE FUNCTION app.worker_event_check() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE count_value bigint;BEGIN WITH selected AS (SELECT event_id FROM app.outbox_events WHERE processed_at IS NULL AND kind IN ('core.audit.committed','immediate_notice') ORDER BY created_at,event_id LIMIT 100 FOR UPDATE SKIP LOCKED), updated AS (UPDATE app.outbox_events o SET processed_at=app.governance_now() FROM selected s WHERE o.event_id=s.event_id AND EXISTS(SELECT 1 FROM app.audit_logs a WHERE a.id=o.event_id) RETURNING o.event_id) SELECT count(*) INTO count_value FROM updated;RETURN count_value;END $$;
REVOKE ALL ON FUNCTION app.cleanup_staging_keys(uuid),app.worker_cleanup(),app.worker_event_check() FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.worker_cleanup(),app.worker_event_check() TO capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.core_immediate_notice(event uuid,actor uuid,uni uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_logs WHERE id=event AND actor_id=actor AND university_id=uni AND action='department.rename') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 INSERT INTO app.notifications(event_id,recipient_id,university_id,type,payload) VALUES(event,actor,uni,'core.department.changed','{"route":"/account","message_key":"core.department.changed"}') ON CONFLICT(event_id,recipient_id,type) DO NOTHING;
END $$;
CREATE FUNCTION app.notice_count(reader uuid,sid uuid) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN PERFORM app.partner_access_principal(reader,sid);RETURN (SELECT count(*) FROM app.notifications WHERE recipient_id=reader AND read_at IS NULL);END $$;
REVOKE ALL ON FUNCTION app.core_immediate_notice(uuid,uuid,uuid),app.notice_count(uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.core_immediate_notice(uuid,uuid,uuid),app.notice_count(uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.credential_immediate_notice(event uuid,actor uuid,uni uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_logs WHERE id=event AND actor_id=actor AND university_id IS NOT DISTINCT FROM uni AND action='auth.password.change') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 INSERT INTO app.notifications(event_id,recipient_id,university_id,type,payload) VALUES(event,actor,uni,'auth.password.changed','{"route":"/account","message_key":"auth.password.changed"}') ON CONFLICT(event_id,recipient_id,type) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION app.credential_immediate_notice(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.credential_immediate_notice(uuid,uuid,uuid) TO capstone_runtime;
