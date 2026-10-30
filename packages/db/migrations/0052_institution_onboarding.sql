-- R03: preserve existing rows/IDs and all FK associations. The two retained
-- institutions had CS only; supply missing canonical options without relabeling.
INSERT INTO app.departments(university_id,code,name_en,name_ar)
SELECT u.id,d.code,d.en,d.ar FROM app.universities u CROSS JOIN (VALUES
 ('CS','Computer Science','علوم الحاسب'),('IS','Information Systems','نظم المعلومات'),('CE','Computer Engineering','هندسة الحاسب')) d(code,en,ar)
ON CONFLICT(university_id,code) DO NOTHING;
REVOKE UPDATE(name_en,name_ar,row_version,updated_at) ON app.departments FROM capstone_runtime;
ALTER FUNCTION app.admin_command(uuid,uuid,text,jsonb) RENAME TO admin_command_pre_r03;
REVOKE ALL ON FUNCTION app.admin_command_pre_r03(uuid,uuid,text,jsonb) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.admin_command(actor uuid,sid uuid,command text,data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF command LIKE 'department.%' OR command IN ('university.create','administrator.create','account.create','account.role') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 RETURN app.admin_command_pre_r03(actor,sid,command,data);
END $$;
REVOKE ALL ON FUNCTION app.admin_command(uuid,uuid,text,jsonb) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.admin_command(uuid,uuid,text,jsonb) TO capstone_runtime;
--> statement-breakpoint
CREATE TABLE app.onboarding_receipts(
 actor_id uuid NOT NULL REFERENCES app.users(id), command_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('university.create','administrator.invite','person.invite','university.status','person.status')),
 payload_hash text NOT NULL CHECK(payload_hash~'^[0-9a-f]{64}$'), university_id uuid NOT NULL REFERENCES app.universities(id),
 target_id uuid NOT NULL, requires_mail boolean NOT NULL DEFAULT false, completed boolean NOT NULL DEFAULT false,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,command_id)
);
REVOKE ALL ON app.onboarding_receipts FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.onboarding_actor(actor uuid,sid uuid) RETURNS app.users LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;
BEGIN
 SELECT * INTO a FROM app.users WHERE id=actor;
 IF a.id IS NULL OR a.account_status<>'active' OR NOT EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=sid AND user_id=actor AND expires_at>app.lifecycle_now()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='UNAUTHENTICATED';END IF;
 IF a.role_code NOT IN ('platform_admin','university_admin') OR (a.university_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.universities WHERE id=a.university_id AND status='active')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 RETURN a;
END $$;
CREATE FUNCTION app.onboarding_commit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.onboarding_receipts;
BEGIN
 SELECT * INTO r FROM app.onboarding_receipts WHERE actor_id=NEW.actor_id AND command_id=NEW.command_id;
 IF NOT r.completed THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_ONBOARDING';END IF;
 IF r.operation='university.create' AND (SELECT count(*) FROM app.departments WHERE university_id=r.university_id AND code IN ('CS','IS','CE'))<>3 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_DEPARTMENTS';END IF;
 IF r.requires_mail AND NOT EXISTS(SELECT 1 FROM app.account_email_outbox WHERE command=r.command_id AND user_id=r.target_id AND purpose='ACCOUNT_SETUP') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_INVITATION';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER onboarding_complete AFTER INSERT ON app.onboarding_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.onboarding_commit_guard();
--> statement-breakpoint
CREATE FUNCTION app.onboarding_prepare(actor uuid,sid uuid,cid uuid,op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users; u app.users; v app.universities; d app.departments; r app.onboarding_receipts;
 ph text:=encode(sha256(convert_to(payload::text,'UTF8')),'hex'); target uuid; uni uuid; needs boolean:=false; reused boolean:=false;
 ev uuid:=gen_random_uuid(); clock timestamptz:=app.lifecycle_now(); result jsonb; why text;
BEGIN
 a:=app.onboarding_actor(actor,sid);
 IF cid IS NULL OR jsonb_typeof(payload)<>'object' OR op NOT IN ('university.create','administrator.invite','person.invite','university.status','person.status') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 IF (op IN ('university.create','administrator.invite','university.status') AND a.role_code<>'platform_admin') OR (op IN ('person.invite','person.status') AND a.role_code<>'university_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('onboarding:'||actor::text||':'||cid::text));
 SELECT * INTO r FROM app.onboarding_receipts WHERE actor_id=actor AND command_id=cid;
 IF r.command_id IS NOT NULL THEN
  IF r.operation<>op OR r.payload_hash<>ph THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='PAYLOAD_CONFLICT';END IF;
  IF a.role_code='university_admin' AND r.university_id<>a.university_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
  RETURN r.result||jsonb_build_object('complete',r.completed,'requiresMail',false);
 END IF;
 IF op='university.create' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('code','name_en','name_ar')) OR payload->>'code' !~ '^[A-Z][A-Z0-9_]{1,31}$' OR char_length(btrim(payload->>'name_en')) NOT BETWEEN 1 AND 120 OR char_length(btrim(payload->>'name_ar')) NOT BETWEEN 1 AND 120 OR (payload->>'name_en'||payload->>'name_ar')~'[[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
  INSERT INTO app.universities(code,name_en,name_ar) VALUES(payload->>'code',btrim(payload->>'name_en'),btrim(payload->>'name_ar')) RETURNING id INTO target;uni:=target;
  INSERT INTO app.departments(university_id,code,name_en,name_ar) VALUES(uni,'CS','Computer Science','علوم الحاسب'),(uni,'IS','Information Systems','نظم المعلومات'),(uni,'CE','Computer Engineering','هندسة الحاسب');
 ELSIF op IN ('administrator.invite','person.invite') THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('university','name','email','role','department','locale')) OR char_length(btrim(payload->>'name')) NOT BETWEEN 1 AND 200 OR char_length(payload->>'email')>254 OR payload->>'email'<>lower(btrim(payload->>'email')) OR payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR payload->>'name'~'[[:cntrl:]]' OR coalesce(payload->>'locale','en') NOT IN ('en','ar') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
  uni:=CASE WHEN op='administrator.invite' THEN (payload->>'university')::uuid ELSE a.university_id END;
  IF op='person.invite' AND (payload ? 'university' OR payload->>'role' NOT IN ('student','faculty_supervisor')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
  IF op='administrator.invite' AND (payload ? 'department' OR payload ? 'role') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
  SELECT * INTO v FROM app.universities WHERE id=uni FOR SHARE;
  IF v.id IS NULL OR v.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
  IF op='person.invite' THEN
   SELECT * INTO d FROM app.departments WHERE id=(payload->>'department')::uuid AND university_id=uni AND code IN ('CS','IS','CE') FOR SHARE;
   IF d.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('onboarding_email:'||(payload->>'email')));
  SELECT * INTO u FROM app.users WHERE email=payload->>'email';
  IF u.id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtext('auth_identity:'||u.id::text));SELECT * INTO u FROM app.users WHERE id=u.id FOR UPDATE;
   IF u.university_id IS DISTINCT FROM uni OR u.role_code<>(CASE WHEN op='administrator.invite' THEN 'university_admin' ELSE payload->>'role' END) OR (op='person.invite' AND u.department_id IS DISTINCT FROM d.id) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDENTITY_CONFLICT';END IF;
   IF u.account_status='suspended' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='INELIGIBLE';END IF;
   target:=u.id;reused:=true;
  ELSE
   INSERT INTO app.users(full_name,email,role_code,university_id,department_id,account_status,locale) VALUES(btrim(payload->>'name'),payload->>'email',CASE WHEN op='administrator.invite' THEN 'university_admin' ELSE payload->>'role' END,uni,d.id,'inactive',coalesce(payload->>'locale','en')) RETURNING id INTO target;needs:=true;
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('id','status','revision','reason')) OR payload->>'status' NOT IN ('active','suspended') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
  target:=(payload->>'id')::uuid;why:=btrim(payload->>'reason');
  IF char_length(why) NOT BETWEEN 3 AND 400 OR NOT app.audit_values_safe(jsonb_build_object('scope',why)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
  IF op='university.status' THEN
   SELECT * INTO v FROM app.universities WHERE id=target FOR UPDATE;
   IF v.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
   IF v.updated_at IS DISTINCT FROM (payload->>'revision')::timestamptz OR v.status=payload->>'status' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
   uni:=v.id;PERFORM app.admin_command_pre_r03(actor,sid,'university.update',jsonb_build_object('university',uni,'name_en',v.name_en,'name_ar',v.name_ar,'status',payload->>'status','reason',why));
  ELSE
   uni:=a.university_id;PERFORM pg_advisory_xact_lock(hashtext('auth_identity:'||target::text));SELECT * INTO u FROM app.users WHERE id=target AND university_id=uni AND role_code IN ('student','faculty_supervisor') FOR UPDATE;
   IF u.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
   IF u.updated_at IS DISTINCT FROM (payload->>'revision')::timestamptz OR u.account_status=payload->>'status' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
   PERFORM app.admin_command_pre_r03(actor,sid,'account.status',jsonb_build_object('id',target,'status',payload->>'status','reason',why));
  END IF;
 END IF;
 result:=jsonb_build_object('id',target,'university',uni,'reused',reused);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES(ev,actor,a.role_code,'user',uni,'admin.'||op,CASE WHEN op LIKE 'university.%' THEN 'university' ELSE 'user' END,target,'{}',jsonb_build_object('scope',CASE WHEN reused THEN 'compatible_identity_reused' ELSE 'persisted' END),'Institution onboarding command',cid,ev);
 INSERT INTO app.notifications(event_id,recipient_id,university_id,type,payload) VALUES(ev,actor,a.university_id,'admin.changed',jsonb_build_object('route',CASE WHEN a.role_code='platform_admin' THEN '/admin/platform/'||uni::text ELSE '/admin/university/people/'||target::text END,'message_key','admin.changed'));
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 INSERT INTO app.onboarding_receipts(actor_id,command_id,operation,payload_hash,university_id,target_id,requires_mail,completed,result) VALUES(actor,cid,op,ph,uni,target,needs,NOT needs,result);
 RETURN result||jsonb_build_object('requiresMail',needs,'complete',NOT needs,'target',CASE WHEN needs THEN (SELECT jsonb_build_object('id',id,'university',university_id,'name',full_name,'email',email,'locale',locale) FROM app.users WHERE id=target) ELSE NULL END);
END $$;
CREATE FUNCTION app.onboarding_finish(actor uuid,sid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;r app.onboarding_receipts;
BEGIN
 a:=app.onboarding_actor(actor,sid);SELECT * INTO r FROM app.onboarding_receipts WHERE actor_id=actor AND command_id=cid FOR UPDATE;
 IF r.command_id IS NULL OR (a.role_code='university_admin' AND r.university_id<>a.university_id) OR (r.requires_mail AND NOT EXISTS(SELECT 1 FROM app.account_email_outbox WHERE command=cid AND user_id=r.target_id AND purpose='ACCOUNT_SETUP')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 UPDATE app.onboarding_receipts SET completed=true WHERE actor_id=actor AND command_id=cid;RETURN r.result;
END $$;
CREATE FUNCTION app.onboarding_receipt(actor uuid,sid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;r app.onboarding_receipts;
BEGIN
 a:=app.onboarding_actor(actor,sid);PERFORM pg_advisory_xact_lock(hashtext('onboarding:'||actor::text||':'||cid::text));SELECT * INTO r FROM app.onboarding_receipts WHERE actor_id=actor AND command_id=cid;
 IF r.command_id IS NULL OR NOT r.completed THEN RETURN NULL;END IF;
 IF a.role_code='university_admin' AND r.university_id<>a.university_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 RETURN r.result;
END $$;
REVOKE ALL ON FUNCTION app.onboarding_actor(uuid,uuid),app.onboarding_prepare(uuid,uuid,uuid,text,jsonb),app.onboarding_finish(uuid,uuid,uuid),app.onboarding_receipt(uuid,uuid,uuid),app.onboarding_commit_guard() FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.onboarding_prepare(uuid,uuid,uuid,text,jsonb),app.onboarding_finish(uuid,uuid,uuid),app.onboarding_receipt(uuid,uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
CREATE FUNCTION app.onboarding_read(actor uuid,sid uuid,kind text,target uuid,q text,filter_status text,filter_role text,page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;result jsonb;total integer;uni uuid;
BEGIN
 a:=app.onboarding_actor(actor,sid);
 IF char_length(q)>200 OR page NOT BETWEEN 1 AND 10000 OR filter_status NOT IN ('','active','inactive','suspended') OR filter_role NOT IN ('','student','faculty_supervisor','invitations') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 IF kind IN ('universities','university') THEN
  IF a.role_code<>'platform_admin' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
  IF kind='university' THEN
   SELECT jsonb_build_object('id',v.id,'code',v.code,'name',v.name_en,'nameAr',v.name_ar,'status',v.status,'revision',v.updated_at,'createdAt',v.created_at,'departments',(SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name_en,'nameAr',name_ar) ORDER BY code) FROM app.departments WHERE university_id=v.id),'administrators',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',full_name,'email',email,'role',role_code,'status',account_status,'revision',updated_at) ORDER BY full_name,id) FROM app.users WHERE university_id=v.id AND role_code='university_admin'),'[]'::jsonb),'history',coalesce((SELECT jsonb_agg(x) FROM (SELECT action,reason,occurred_at AS at FROM app.audit_logs WHERE object_id=v.id AND object_type='university' ORDER BY occurred_at DESC LIMIT 20) x),'[]'::jsonb)) INTO result FROM app.universities v WHERE id=target;
   RETURN result;
  END IF;
  SELECT count(*) INTO total FROM app.universities WHERE (filter_status='' OR status=filter_status) AND (q='' OR strpos(lower(name_en||' '||name_ar||' '||code),lower(q))>0);
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO result FROM (SELECT id,code,name_en AS name,name_ar AS "nameAr",status FROM app.universities WHERE (filter_status='' OR status=filter_status) AND (q='' OR strpos(lower(name_en||' '||name_ar||' '||code),lower(q))>0) ORDER BY code,id LIMIT 20 OFFSET (page-1)*20) x;
 ELSIF kind IN ('people','person','departments') THEN
  IF a.role_code<>'university_admin' OR a.university_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;uni:=a.university_id;
  IF kind='departments' THEN RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name_en,'nameAr',name_ar) ORDER BY code),'[]'::jsonb) FROM app.departments WHERE university_id=uni AND code IN ('CS','IS','CE'));END IF;
  IF kind='person' THEN
   SELECT jsonb_build_object('id',u.id,'name',u.full_name,'email',u.email,'role',u.role_code,'status',u.account_status,'revision',u.updated_at,'department',d.code,'departmentName',d.name_en,'departmentNameAr',d.name_ar,'university',uni,'universityName',(SELECT name_en FROM app.universities WHERE id=uni),'universityNameAr',(SELECT name_ar FROM app.universities WHERE id=uni)) INTO result FROM app.users u LEFT JOIN app.departments d ON d.id=u.department_id WHERE u.id=target AND u.university_id=uni AND u.role_code IN ('student','faculty_supervisor');RETURN result;
  END IF;
  SELECT count(*) INTO total FROM app.users WHERE university_id=uni AND role_code IN ('student','faculty_supervisor') AND (filter_status='' OR account_status=filter_status) AND (filter_role='' OR role_code=filter_role OR (filter_role='invitations' AND account_status='inactive')) AND (q='' OR strpos(lower(full_name||' '||email),lower(q))>0);
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO result FROM (SELECT u.id,u.full_name AS name,u.email,u.role_code AS role,u.account_status AS status,d.code AS department FROM app.users u LEFT JOIN app.departments d ON d.id=u.department_id WHERE u.university_id=uni AND u.role_code IN ('student','faculty_supervisor') AND (filter_status='' OR u.account_status=filter_status) AND (filter_role='' OR u.role_code=filter_role OR (filter_role='invitations' AND u.account_status='inactive')) AND (q='' OR strpos(lower(u.full_name||' '||u.email),lower(q))>0) ORDER BY u.full_name,u.id LIMIT 20 OFFSET (page-1)*20) x;
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
 RETURN jsonb_build_object('rows',result,'total',total,'page',page,'pageSize',20);
END $$;
REVOKE ALL ON FUNCTION app.onboarding_read(uuid,uuid,text,uuid,text,text,text,integer) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.onboarding_read(uuid,uuid,text,uuid,text,text,text,integer) TO capstone_runtime;

--> statement-breakpoint
CREATE FUNCTION app.onboarding_administrator_access(actor uuid,sid uuid,target uuid,receipt uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.users; a app.users; result jsonb; clock timestamptz:=app.lifecycle_now();
BEGIN
 SELECT * INTO a FROM app.users WHERE id=actor;
 IF a.role_code<>'platform_admin' OR NOT app.account_email_operator(actor,sid,target) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 SELECT * INTO u FROM app.users WHERE id=target AND role_code='university_admin';IF u.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 IF receipt IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('account_email_command:'||receipt::text)); END IF;
 result:=jsonb_build_object('id',u.id,'name',u.full_name,'email',u.email,'role',u.role_code,'status',u.account_status,'university',(SELECT name_en FROM app.universities WHERE id=u.university_id),'universityAr',(SELECT name_ar FROM app.universities WHERE id=u.university_id),'invitation',(SELECT jsonb_build_object('state',CASE WHEN l.consumed_at IS NOT NULL THEN 'used' WHEN l.revoked_at IS NOT NULL THEN 'revoked' WHEN l.expires_at<=clock THEN 'expired' ELSE 'valid' END,'expiresAt',l.expires_at) FROM app.account_lifecycle l WHERE l.user_id=u.id AND l.purpose='activation' ORDER BY l.issued_at DESC,l.id DESC LIMIT 1),'serverNow',clock,'resendAt',(SELECT max(created_at)+interval '60 seconds' FROM app.account_email_outbox WHERE user_id=u.id AND purpose IN ('ACCOUNT_SETUP','PASSWORD_RESET')));
 RETURN result||jsonb_build_object('messages',coalesce((SELECT jsonb_agg(x.record) FROM (SELECT jsonb_build_object('id',e.id,'command',e.command,'purpose',e.purpose,'state',e.state,'createdAt',e.created_at,'expiresAt',e.expires_at,'canRetry',e.state IN ('failed','unknown') AND e.ciphertext IS NOT NULL AND e.expires_at>clock AND e.attempts<10 AND e.manual_retries<1 AND u.account_status<>'suspended' AND (e.lifecycle_id IS NULL OR EXISTS(SELECT 1 FROM app.account_lifecycle l WHERE l.id=e.lifecycle_id AND l.consumed_at IS NULL AND l.revoked_at IS NULL AND l.expires_at>clock))) AS record FROM app.account_email_outbox e WHERE e.user_id=u.id ORDER BY e.created_at DESC,e.id DESC LIMIT 20) x),'[]'::jsonb),'receipt',CASE WHEN receipt IS NULL THEN NULL ELSE (SELECT jsonb_build_object('id',e.id,'state',e.state) FROM app.account_email_outbox e WHERE e.command=receipt AND e.user_id=u.id) END);
END $$;
REVOKE ALL ON FUNCTION app.onboarding_administrator_access(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.onboarding_administrator_access(uuid,uuid,uuid,uuid) TO capstone_runtime;
