CREATE TABLE app.account_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), university_id uuid NOT NULL REFERENCES app.universities(id),
 actor_id uuid NOT NULL REFERENCES app.users(id), command_id uuid NOT NULL, source_hash text NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),plan_hash text NOT NULL CHECK(plan_hash ~ '^[0-9a-f]{64}$'),
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 1000),student_count integer NOT NULL,faculty_count integer NOT NULL,groups_created integer NOT NULL,groups_reused integer NOT NULL,
 status text NOT NULL DEFAULT 'committed' CHECK(status='committed'),created_at timestamptz(3) NOT NULL DEFAULT now(), UNIQUE(actor_id,command_id),CHECK(student_count+faculty_count=row_count)
);
REVOKE ALL ON app.account_imports FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.csv_principal(reader uuid, session_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;
BEGIN
 SELECT * INTO a FROM app.users WHERE id=reader;
 IF a.id IS NULL OR a.role_code<>'university_admin' OR a.account_status<>'active' OR NOT EXISTS(SELECT 1 FROM app.auth_sessions s WHERE s.id=session_id AND s.user_id=reader AND s.expires_at>clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM app.universities v WHERE v.id=a.university_id AND v.status='active') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN a.university_id;
END $$;
REVOKE ALL ON FUNCTION app.csv_principal(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.csv_context(reader uuid, session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE uni uuid:=app.csv_principal(reader,session_id);
BEGIN
 RETURN jsonb_build_object('university',uni,
 'departments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'code',d.code,'version',d.row_version) ORDER BY d.code) FROM app.departments d WHERE d.university_id=uni),'[]'),
 'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'code',g.external_group_id,'department',g.department_id) ORDER BY g.external_group_id) FROM app.student_groups g WHERE g.university_id=uni),'[]'),
 'emails',coalesce((SELECT jsonb_agg(encode(sha256(convert_to(u.email,'UTF8')),'hex')) FROM app.users u),'[]'),
 'studentIds',coalesce((SELECT jsonb_agg(u.student_id) FROM app.users u WHERE u.university_id=uni AND u.student_id IS NOT NULL),'[]'));
END $$;
CREATE FUNCTION app.csv_history(reader uuid, session_id uuid, command_id uuid DEFAULT NULL) RETURNS TABLE(receipt jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE uni uuid:=app.csv_principal(reader,session_id);
BEGIN
 RETURN QUERY SELECT jsonb_build_object('id',i.id,'sourceHash',i.source_hash,'planHash',i.plan_hash,'rows',i.row_count,'students',i.student_count,'faculty',i.faculty_count,'groupsCreated',i.groups_created,'groupsReused',i.groups_reused,'createdAt',i.created_at)
 FROM app.account_imports i WHERE i.university_id=uni AND ($3 IS NULL OR (i.command_id=$3 AND i.actor_id=reader)) ORDER BY i.created_at DESC,i.id DESC LIMIT 50;
END $$;
REVOKE ALL ON FUNCTION app.csv_context(uuid,uuid),app.csv_history(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.csv_context(uuid,uuid),app.csv_history(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.csv_commit(reader uuid, session_id uuid, command uuid, source_hash text, plan_hash text, rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE uni uuid; r jsonb; d app.departments; g app.student_groups; existing app.account_imports; import_id uuid:=gen_random_uuid(); event uuid:=gen_random_uuid(); user_id uuid; group_id uuid; students integer:=0; faculty integer:=0; new_groups integer:=0; old_groups integer:=0; group_codes text[]:='{}'; current_code text;
BEGIN
 uni:=app.csv_principal(reader,session_id);
 PERFORM pg_advisory_xact_lock(hashtext('csv_tenant:'||uni::text));
 PERFORM 1 FROM app.users WHERE id=reader FOR UPDATE;
 uni:=app.csv_principal(reader,session_id);
 PERFORM 1 FROM app.auth_sessions s WHERE s.id=session_id AND s.user_id=reader AND s.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.universities WHERE id=uni AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM app.account_imports i WHERE i.actor_id=reader AND i.command_id=command;
 IF existing.id IS NOT NULL THEN
  IF existing.source_hash<>$4 OR existing.plan_hash<>$5 THEN RAISE EXCEPTION 'CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN (SELECT receipt FROM app.csv_history(reader,session_id,command));
 END IF;
 IF jsonb_typeof(rows)<>'array' OR jsonb_array_length(rows) NOT BETWEEN 1 AND 1000 OR source_hash !~ '^[0-9a-f]{64}$' OR plan_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) q GROUP BY q->>'email' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) q WHERE q->>'role'='student' GROUP BY q->>'student_id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) q WHERE q->>'role'='student' GROUP BY q->>'group_id' HAVING count(DISTINCT q->>'department_id')>1) THEN RAISE EXCEPTION 'INVALID'; END IF;
 -- Complete validation pass precedes all writes; locks protect department/group facts.
 FOR r IN SELECT value FROM jsonb_array_elements(rows) LOOP
  IF r->>'role' NOT IN ('student','faculty_supervisor') OR length(btrim(r->>'full_name')) NOT BETWEEN 1 AND 200 OR r->>'email'<>lower(btrim(r->>'email')) OR r->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('row','full_name','email','role','department','student_id','group_id','department_id','department_version','existing_group_id')) OR (r->>'full_name') ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'INVALID'; END IF;
  SELECT * INTO d FROM app.departments WHERE id=(r->>'department_id')::uuid AND university_id=uni AND code=r->>'department' FOR SHARE;
  IF d.id IS NULL OR d.row_version<>(r->>'department_version')::integer OR EXISTS(SELECT 1 FROM app.users u WHERE u.email=r->>'email') OR (r->>'role'='student' AND EXISTS(SELECT 1 FROM app.users u WHERE u.university_id=uni AND u.student_id=r->>'student_id')) THEN RAISE EXCEPTION 'STALE' USING ERRCODE='40001'; END IF;
  IF r->>'role'='student' THEN
   IF r->>'student_id' !~ '^[A-Za-z0-9_-]{1,64}$' OR r->>'group_id' !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$' THEN RAISE EXCEPTION 'INVALID'; END IF;
   SELECT * INTO g FROM app.student_groups WHERE university_id=uni AND external_group_id=r->>'group_id' FOR SHARE;
   IF (g.id IS NULL AND r->>'existing_group_id' IS NOT NULL) OR (g.id IS NOT NULL AND (g.department_id<>d.id OR r->>'existing_group_id' IS NULL OR g.id<>(r->>'existing_group_id')::uuid)) THEN RAISE EXCEPTION 'STALE' USING ERRCODE='40001'; END IF;
  ELSIF coalesce(r->>'student_id','')<>'' OR coalesce(r->>'group_id','')<>'' THEN RAISE EXCEPTION 'INVALID'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(rows) LOOP
  IF r->>'role'='student' THEN
   current_code:=r->>'group_id';
   SELECT id INTO group_id FROM app.student_groups WHERE university_id=uni AND external_group_id=current_code;
   IF NOT current_code=ANY(group_codes) THEN
    IF group_id IS NULL THEN INSERT INTO app.student_groups(university_id,department_id,external_group_id) VALUES(uni,(r->>'department_id')::uuid,current_code) RETURNING id INTO group_id;new_groups:=new_groups+1;
    ELSE old_groups:=old_groups+1; END IF;
    group_codes:=array_append(group_codes,current_code);
   END IF;
   students:=students+1;
  ELSE faculty:=faculty+1; END IF;
  INSERT INTO app.users(full_name,email,role_code,university_id,department_id,student_id,account_status) VALUES(r->>'full_name',r->>'email',r->>'role',uni,(r->>'department_id')::uuid,CASE WHEN r->>'role'='student' THEN r->>'student_id' ELSE NULL END,'inactive') RETURNING id INTO user_id;
  IF r->>'role'='student' THEN INSERT INTO app.group_members(university_id,group_id,user_id) VALUES(uni,group_id,user_id); END IF;
 END LOOP;
 INSERT INTO app.account_imports(id,university_id,actor_id,command_id,source_hash,plan_hash,row_count,student_count,faculty_count,groups_created,groups_reused) VALUES(import_id,uni,reader,command,$4,$5,jsonb_array_length(rows),students,faculty,new_groups,old_groups);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES(event,reader,'university_admin','user',uni,'admin.csv.import','account_import',import_id,'{}',jsonb_build_object('scope','academic_accounts','count',jsonb_array_length(rows)),'Confirmed institutional account import',gen_random_uuid(),gen_random_uuid());
 INSERT INTO app.notifications(event_id,recipient_id,university_id,type,payload) VALUES(event,reader,uni,'admin.csv.imported','{"route":"/en/admin/university","message_key":"admin.csv.imported"}');
 INSERT INTO app.outbox_events(event_id,kind) VALUES(event,'core.audit.committed');
 RETURN (SELECT receipt FROM app.csv_history(reader,session_id,command));
END $$;
REVOKE ALL ON FUNCTION app.csv_commit(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.csv_commit(uuid,uuid,uuid,text,text,jsonb) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.csv_groups(reader uuid, session_id uuid) RETURNS TABLE(code text,department text,members integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE uni uuid:=app.csv_principal(reader,session_id);
BEGIN
 RETURN QUERY SELECT g.external_group_id,d.code,count(m.user_id)::integer FROM app.student_groups g JOIN app.departments d ON d.id=g.department_id AND d.university_id=g.university_id LEFT JOIN app.group_members m ON m.group_id=g.id AND m.university_id=g.university_id WHERE g.university_id=uni GROUP BY g.id,d.code ORDER BY g.external_group_id;
END $$;
REVOKE ALL ON FUNCTION app.csv_groups(uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.csv_groups(uuid,uuid) TO capstone_runtime;
