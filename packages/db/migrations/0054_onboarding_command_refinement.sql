-- Correct concatenation precedence found by real transactional tests. Prior migrations stay byte-identical.
CREATE OR REPLACE FUNCTION app.onboarding_prepare_r03_base(actor uuid,sid uuid,cid uuid,op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
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
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('code','name_en','name_ar')) OR payload->>'code' !~ '^[A-Z][A-Z0-9_]{1,31}$' OR char_length(btrim(payload->>'name_en')) NOT BETWEEN 1 AND 120 OR char_length(btrim(payload->>'name_ar')) NOT BETWEEN 1 AND 120 OR ((payload->>'name_en')||(payload->>'name_ar'))~'[[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
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

--> statement-breakpoint
CREATE FUNCTION app.onboarding_decision_receipt(actor uuid,sid uuid,cid uuid,target uuid,kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users; result jsonb;
BEGIN
 a:=app.onboarding_actor(actor,sid);IF a.role_code<>'platform_admin' OR kind NOT IN ('partners','reviewers') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(CASE kind WHEN 'partners' THEN 'partner-command:' ELSE 'reviewer-command:' END||actor::text||':'||cid::text));
 SELECT r.result INTO result FROM app.command_receipts r JOIN app.audit_logs l ON l.id=r.audit_id WHERE r.actor_id=actor AND r.command_id=cid AND l.object_id=target AND ((kind='partners' AND r.action IN ('partner.approve','partner.reject','partner.suspend','partner.reapprove')) OR (kind='reviewers' AND r.action IN ('reviewer.approve','reviewer.suspend')));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.onboarding_decision_receipt(uuid,uuid,uuid,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.onboarding_decision_receipt(uuid,uuid,uuid,uuid,text) TO capstone_runtime;
