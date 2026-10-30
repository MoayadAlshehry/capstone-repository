-- Phase10 inactive recovery and institution suspension serialize with login.
CREATE OR REPLACE FUNCTION app.admin_command(actor uuid, session_id uuid, command text, data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users; t app.users; uni uuid; target uuid; event uuid:=gen_random_uuid(); old_scope text:=''; new_scope text:=''; reason text; clock timestamptz(3):=app.lifecycle_now();
BEGIN
 SELECT * INTO a FROM app.users WHERE id=actor FOR UPDATE;
 IF a.id IS NULL OR a.account_status<>'active' OR NOT EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=session_id AND user_id=actor AND expires_at>clock) THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 IF a.university_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.universities WHERE id=a.university_id AND status='active') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 reason:=btrim(coalesce(data->>'reason',''));
 IF length(reason)<3 OR length(reason)>400 OR NOT app.audit_values_safe(jsonb_build_object('scope',reason)) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF command='profile.update' THEN
  IF length(btrim(data->>'name')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  UPDATE app.users SET full_name=btrim(data->>'name'),updated_at=clock WHERE id=actor;
  target:=actor;uni:=a.university_id;new_scope:='own_profile';
 ELSIF command IN ('university.create','university.update','administrator.create','administrator.activation') THEN
  IF a.role_code<>'platform_admin' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF command='university.create' THEN
   INSERT INTO app.universities(code,name_en,name_ar) VALUES(data->>'code',btrim(data->>'name_en'),btrim(data->>'name_ar')) RETURNING id INTO target;uni:=target;new_scope:='active';
  ELSE
   uni:=(data->>'university')::uuid;
   PERFORM 1 FROM app.universities WHERE id=uni FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF command='university.update' THEN
    IF data->>'status' NOT IN ('active','suspended') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    SELECT status INTO old_scope FROM app.universities WHERE id=uni;
    UPDATE app.universities SET name_en=btrim(data->>'name_en'),name_ar=btrim(data->>'name_ar'),status=data->>'status',updated_at=clock WHERE id=uni;
    IF data->>'status'='suspended' THEN
     PERFORM pg_advisory_xact_lock(hashtext('auth_identity:'||id::text)) FROM app.users WHERE university_id=uni ORDER BY id;
     DELETE FROM app.auth_sessions WHERE user_id IN (SELECT id FROM app.users WHERE university_id=uni);
     UPDATE app.account_lifecycle SET revoked_at=clock WHERE university_id=uni AND consumed_at IS NULL AND revoked_at IS NULL;
    END IF;
    target:=uni;new_scope:=data->>'status';
   ELSIF command='administrator.create' THEN
    INSERT INTO app.users(full_name,email,role_code,university_id,account_status) VALUES(btrim(data->>'name'),lower(btrim(data->>'email')),'university_admin',uni,'inactive') RETURNING id INTO target;new_scope:='university_admin:inactive';
   ELSE
    target:=(data->>'id')::uuid;
    PERFORM pg_advisory_xact_lock(hashtext('auth_identity:'||target::text));
    SELECT * INTO t FROM app.users WHERE id=target AND university_id=uni FOR UPDATE;
    IF t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF t.role_code<>'university_admin' OR t.account_status<>'inactive' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    UPDATE app.account_lifecycle SET revoked_at=clock WHERE user_id=target AND purpose='activation' AND consumed_at IS NULL AND revoked_at IS NULL;
    INSERT INTO app.account_lifecycle(user_id,university_id,purpose,digest,issued_by,issued_at,expires_at) VALUES(target,uni,'activation',data->>'digest',actor,clock,clock+interval '24 hours');new_scope:='issued';
   END IF;
  END IF;
 ELSE
  IF a.role_code<>'university_admin' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  uni:=a.university_id;
  IF command='department.create' THEN
   INSERT INTO app.departments(university_id,code,name_en,name_ar) VALUES(uni,data->>'code',btrim(data->>'name_en'),btrim(data->>'name_ar')) RETURNING id INTO target;new_scope:=data->>'code';
  ELSIF command='department.update' THEN
   target:=(data->>'id')::uuid;
   UPDATE app.departments SET name_en=btrim(data->>'name_en'),name_ar=btrim(data->>'name_ar'),row_version=row_version+1,updated_at=clock WHERE id=target AND university_id=uni AND row_version=(data->>'version')::int;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_OR_CONFLICT'; END IF;new_scope:='department';
  ELSIF command='account.create' THEN
   IF data->>'role' NOT IN ('student','faculty_supervisor') OR NOT EXISTS(SELECT 1 FROM app.departments WHERE id=(data->>'department')::uuid AND university_id=uni) OR (data->>'role'='student' AND coalesce(data->>'student_id','') !~ '^[A-Za-z0-9_-]{1,64}$') OR (data->>'role'='faculty_supervisor' AND coalesce(data->>'student_id','')<>'') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   INSERT INTO app.users(full_name,email,role_code,university_id,department_id,student_id,account_status) VALUES(btrim(data->>'name'),lower(btrim(data->>'email')),data->>'role',uni,(data->>'department')::uuid,CASE WHEN data->>'role'='student' THEN data->>'student_id' ELSE NULL END,'inactive') RETURNING id INTO target;new_scope:=(data->>'role')||':inactive';
  ELSE
   target:=(data->>'id')::uuid;
   -- Serialize lifecycle/status with real sign-in/password-change.
   PERFORM pg_advisory_xact_lock(hashtext('auth_identity:'||target::text));
   SELECT * INTO t FROM app.users WHERE id=target AND university_id=uni FOR UPDATE;
   IF t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF t.role_code NOT IN ('student','faculty_supervisor') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF command IN ('activation.issue','reset.issue') THEN
    IF (command='activation.issue' AND t.account_status<>'inactive') OR (command='reset.issue' AND t.account_status<>'active') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    UPDATE app.account_lifecycle SET revoked_at=clock WHERE user_id=target AND purpose=CASE command WHEN 'activation.issue' THEN 'activation' ELSE 'reset' END AND consumed_at IS NULL AND revoked_at IS NULL;
    INSERT INTO app.account_lifecycle(user_id,university_id,purpose,digest,issued_by,issued_at,expires_at) VALUES(target,uni,CASE command WHEN 'activation.issue' THEN 'activation' ELSE 'reset' END,data->>'digest',actor,clock,clock+CASE command WHEN 'activation.issue' THEN interval '24 hours' ELSE interval '1 hour' END);
    new_scope:='issued';
   ELSIF command='account.status' THEN
    IF data->>'status' NOT IN ('active','suspended') OR (data->>'status'='active' AND t.account_status<>'suspended') OR (data->>'status'='suspended' AND t.account_status='suspended') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    old_scope:=t.account_status;new_scope:=CASE WHEN data->>'status'='active' AND NOT EXISTS(SELECT 1 FROM app.auth_accounts WHERE user_id=target) THEN 'inactive' ELSE data->>'status' END;
    UPDATE app.users SET account_status=new_scope,updated_at=clock WHERE id=target;
    DELETE FROM app.auth_sessions WHERE user_id=target;
    UPDATE app.account_lifecycle SET revoked_at=clock WHERE user_id=target AND consumed_at IS NULL AND revoked_at IS NULL;
   ELSIF command='account.role' THEN
    IF data->>'role' NOT IN ('student','faculty_supervisor') OR data->>'role'=t.role_code OR NOT EXISTS(SELECT 1 FROM app.departments WHERE id=(data->>'department')::uuid AND university_id=uni) OR (data->>'role'='student' AND coalesce(data->>'student_id','') !~ '^[A-Za-z0-9_-]{1,64}$') OR (data->>'role'='faculty_supervisor' AND coalesce(data->>'student_id','')<>'') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
    IF EXISTS(SELECT 1 FROM app.group_members WHERE user_id=target) OR EXISTS(SELECT 1 FROM app.project_authors WHERE user_id=target) OR EXISTS(SELECT 1 FROM app.projects WHERE supervisor_id=target) THEN RAISE EXCEPTION 'ASSIGNED_ACCOUNT'; END IF;
    old_scope:=t.role_code;new_scope:=data->>'role';
    UPDATE app.users SET role_code=new_scope,department_id=(data->>'department')::uuid,student_id=CASE WHEN new_scope='student' THEN data->>'student_id' ELSE NULL END,updated_at=clock WHERE id=target;
    DELETE FROM app.auth_sessions WHERE user_id=target;
    UPDATE app.account_lifecycle SET revoked_at=clock WHERE user_id=target AND consumed_at IS NULL AND revoked_at IS NULL;
   ELSE RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
 END IF;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES(event,actor,a.role_code,'user',uni,'admin.'||command,CASE WHEN command LIKE 'university.%' THEN 'university' WHEN command LIKE 'department.%' THEN 'department' ELSE 'user' END,target,jsonb_build_object('scope',old_scope),jsonb_build_object('scope',new_scope),reason,gen_random_uuid(),gen_random_uuid());
 INSERT INTO app.notifications(event_id,recipient_id,university_id,type,payload) VALUES(event,actor,a.university_id,'admin.changed','{"route":"/en/account","message_key":"admin.changed"}');
 INSERT INTO app.outbox_events(event_id,kind) VALUES(event,'core.audit.committed');
 RETURN jsonb_build_object('id',target,'scope',new_scope);
END $$;
