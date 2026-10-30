-- R04: external identifiers remain genuine and optional only for internal groups.
ALTER TABLE app.student_groups ALTER COLUMN external_group_id DROP NOT NULL;
ALTER TABLE app.student_groups ADD COLUMN internal_only boolean NOT NULL DEFAULT false;
ALTER TABLE app.student_groups ADD CONSTRAINT internal_group_identifier CHECK ((internal_only AND external_group_id IS NULL) OR (NOT internal_only AND external_group_id IS NOT NULL));
ALTER TABLE app.projects ADD COLUMN guided_onboarding boolean NOT NULL DEFAULT false;
CREATE TABLE app.project_onboarding_receipts (
 actor_id uuid NOT NULL REFERENCES app.users(id), command_id uuid NOT NULL, operation text NOT NULL CHECK(operation IN ('create','team')),
 university_id uuid NOT NULL REFERENCES app.universities(id), project_id uuid NOT NULL REFERENCES app.projects(id),
 payload_hash text NOT NULL CHECK(payload_hash~'^[0-9a-f]{64}$'), targets jsonb NOT NULL CHECK(jsonb_typeof(targets)='array'),
 completed boolean NOT NULL DEFAULT false, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,command_id)
);
REVOKE ALL ON app.project_onboarding_receipts FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.project_task_actor(actor uuid,sid uuid) RETURNS app.users LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;
BEGIN
 a:=app.assignment_principal(actor,sid);
 IF a.role_code<>'university_admin' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 RETURN a;
END $$;
CREATE FUNCTION app.project_person_resolution(actor uuid,sid uuid,dept uuid,person jsonb,role text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;u app.users;d app.departments;
BEGIN
 a:=app.project_task_actor(actor,sid);
 SELECT * INTO d FROM app.departments WHERE id=dept AND university_id=a.university_id AND code IN ('CS','IS','CE');
 IF d.id IS NULL OR role NOT IN ('student','faculty_supervisor') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF jsonb_typeof(person) IS DISTINCT FROM 'object' OR NOT person ?& ARRAY['name','email'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(person) k WHERE k NOT IN ('name','email','existingId')) OR jsonb_typeof(person->'name') IS DISTINCT FROM 'string' OR char_length(btrim(person->>'name')) NOT BETWEEN 1 AND 200 OR person->>'name'~'[[:cntrl:]‪-‮⁦-⁩]' OR jsonb_typeof(person->'email') IS DISTINCT FROM 'string' OR char_length(person->>'email')>254 OR person->>'email'<>lower(btrim(person->>'email')) OR person->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_PERSON';END IF;
 SELECT * INTO u FROM app.users WHERE email=person->>'email';
 IF u.id IS NOT NULL AND (u.university_id IS DISTINCT FROM a.university_id OR u.role_code<>role OR u.department_id IS DISTINCT FROM dept OR u.account_status='suspended') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDENTITY_CONFLICT';END IF;
 IF person ? 'existingId' AND (jsonb_typeof(person->'existingId') IS DISTINCT FROM 'string' OR u.id IS DISTINCT FROM (person->>'existingId')::uuid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDENTITY_CHANGED';END IF;
 RETURN jsonb_build_object('id',u.id,'name',coalesce(u.full_name,btrim(person->>'name')),'email',person->>'email','role',role,'department',d.code,'status',coalesce(u.account_status,'inactive'),'identity',CASE WHEN u.id IS NULL THEN 'new-invitation' WHEN u.account_status='active' THEN 'existing-active' ELSE 'existing-invitation' END,'nameMatches',u.id IS NULL OR u.full_name=btrim(person->>'name'));
END $$;
CREATE FUNCTION app.project_faculty_search(actor uuid,sid uuid,dept uuid,q text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;
BEGIN
 a:=app.project_task_actor(actor,sid);
 IF q IS NULL OR char_length(q)>200 OR NOT EXISTS(SELECT 1 FROM app.departments WHERE id=dept AND university_id=a.university_id AND code IN ('CS','IS','CE')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT u.id,u.full_name AS name,u.email,u.account_status AS status,d.code AS department FROM app.users u JOIN app.departments d ON d.id=u.department_id WHERE u.university_id=a.university_id AND u.department_id=dept AND u.role_code='faculty_supervisor' AND (q='' OR strpos(lower(u.full_name||' '||u.email),lower(q))>0) ORDER BY u.full_name,u.id LIMIT 20) x);
END $$;
REVOKE ALL ON FUNCTION app.project_task_actor(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.project_person_resolution(uuid,uuid,uuid,jsonb,text),app.project_faculty_search(uuid,uuid,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.project_person_resolution(uuid,uuid,uuid,jsonb,text),app.project_faculty_search(uuid,uuid,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.project_task_prepare(actor uuid,sid uuid,cid uuid,op text,data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;p app.projects;r app.project_onboarding_receipts;u app.users;item jsonb;resolved jsonb;roster uuid[]:='{}';lead uuid;faculty uuid;dept uuid;pid uuid;vid uuid;gid uuid;locked boolean:=false;targets jsonb:='[]';mailid uuid;needs boolean;address text;uid uuid;ev uuid:=gen_random_uuid();before_value jsonb:='{}';ph text:=encode(sha256(convert_to(data::text,'UTF8')),'hex');result jsonb;current_roster uuid[];
BEGIN
 a:=app.project_task_actor(actor,sid);
 IF cid IS NULL OR op IS NULL OR op NOT IN ('create','team') OR jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT data ?& ARRAY['supervisor','students','locale'] OR jsonb_typeof(data->'locale') IS DISTINCT FROM 'string' OR data->>'locale' NOT IN ('en','ar') OR jsonb_typeof(data->'students') IS DISTINCT FROM 'array' OR jsonb_array_length(data->'students') NOT BETWEEN 1 AND 1000 OR (SELECT count(*) FROM jsonb_array_elements(data->'students') x WHERE x->'lead'='true'::jsonb)<>1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TEAM';END IF;
 IF op='create' THEN
  IF NOT data ?& ARRAY['title','department','year'] OR (SELECT count(*) FROM jsonb_object_keys(data))<>6 OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN ('title','department','year','supervisor','students','locale')) OR jsonb_typeof(data->'title') IS DISTINCT FROM 'string' OR char_length(btrim(data->>'title')) NOT BETWEEN 1 AND 200 OR data->>'title'~'[[:cntrl:]‪-‮⁦-⁩]' OR jsonb_typeof(data->'department') IS DISTINCT FROM 'string' OR jsonb_typeof(data->'year') IS DISTINCT FROM 'string' OR data->>'year'!~'^[0-9]{4}–[0-9]{4}$' OR right(data->>'year',4)::integer<>left(data->>'year',4)::integer+1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ESSENTIALS';END IF;
  dept:=(data->>'department')::uuid;
 ELSE
  IF NOT data ?& ARRAY['project','revision','reason'] OR (SELECT count(*) FROM jsonb_object_keys(data))<>6 OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN ('project','revision','reason','supervisor','students','locale')) OR jsonb_typeof(data->'revision') IS DISTINCT FROM 'number' OR data->>'revision'!~'^[0-9]+$' OR jsonb_typeof(data->'reason') IS DISTINCT FROM 'string' OR char_length(btrim(data->>'reason')) NOT BETWEEN 3 AND 400 OR data->>'reason'~'[[:cntrl:]]' OR data->>'reason'~*'(password|secret|token|cookie)[[:space:]]*[:=]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CORRECTION';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('project_onboarding:'||actor::text||':'||cid::text));
 SELECT * INTO r FROM app.project_onboarding_receipts WHERE actor_id=actor AND command_id=cid;
 IF r.command_id IS NOT NULL THEN
  IF r.operation<>op OR r.payload_hash IS DISTINCT FROM ph OR r.university_id IS DISTINCT FROM a.university_id THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='PAYLOAD_CONFLICT';END IF;
  RETURN r.result||jsonb_build_object('targets','[]'::jsonb);
 END IF;
 PERFORM 1 FROM app.universities WHERE id=a.university_id AND status='active' FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF op='team' THEN
  SELECT * INTO p FROM app.projects WHERE id=(data->>'project')::uuid AND university_id=a.university_id AND assignment_managed FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
  IF p.row_version IS DISTINCT FROM (data->>'revision')::integer THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE';END IF;
  pid:=p.id;dept:=p.department_id;locked:=EXISTS(SELECT 1 FROM app.project_submissions WHERE project_id=pid);
  IF EXISTS(SELECT 1 FROM app.project_versions WHERE id=p.current_version_id AND status IN ('archived','rejected')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FINAL_RECORD';END IF;
  SELECT array_agg(user_id ORDER BY author_order) INTO current_roster FROM app.project_authors WHERE project_id=pid;
  before_value:=jsonb_build_object('scope',jsonb_build_object('authors',current_roster,'supervisor',p.supervisor_id)::text,'row_version',p.row_version);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.departments WHERE id=dept AND university_id=a.university_id AND code IN ('CS','IS','CE')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF jsonb_typeof(data->'supervisor') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(data->'supervisor') k WHERE k NOT IN ('name','email','existingId')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(data->'students') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR NOT x ?& ARRAY['name','email','lead'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN ('name','email','lead','existingId')) OR jsonb_typeof(x->'lead') IS DISTINCT FROM 'boolean' OR x->>'email'=data->'supervisor'->>'email') OR (SELECT count(DISTINCT x->>'email') FROM jsonb_array_elements(data->'students') x)<>jsonb_array_length(data->'students') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DUPLICATE_PERSON';END IF;
 -- Use the same email/identity locks as R03, in stable order, before provisioning.
 FOR address IN SELECT email FROM (SELECT data->'supervisor'->>'email' AS email UNION SELECT x->>'email' FROM jsonb_array_elements(data->'students') x) z ORDER BY email LOOP PERFORM pg_advisory_xact_lock(hashtext('onboarding_email:'||address));END LOOP;
 FOR uid IN SELECT id FROM app.users WHERE email=data->'supervisor'->>'email' OR email IN (SELECT x->>'email' FROM jsonb_array_elements(data->'students') x) ORDER BY id LOOP PERFORM pg_advisory_xact_lock(hashtext('auth_identity:'||uid::text));PERFORM 1 FROM app.users WHERE id=uid FOR UPDATE;END LOOP;
 PERFORM 1 FROM app.users WHERE id=actor FOR SHARE;PERFORM 1 FROM app.auth_sessions WHERE id=sid AND user_id=actor FOR SHARE;a:=app.project_task_actor(actor,sid);
 FOR item IN SELECT (data->'supervisor')||jsonb_build_object('_role','faculty_supervisor','_lead',false) UNION ALL SELECT (x-'lead')||jsonb_build_object('_role','student','_lead',x->'lead') FROM jsonb_array_elements(data->'students') WITH ORDINALITY t(x,n) ORDER BY 1 LOOP
  -- Author ordering is assembled separately below; identity resolution ordering is irrelevant.
  IF locked AND item->>'_role'='student' THEN
   SELECT * INTO u FROM app.users WHERE email=item->>'email' AND university_id=a.university_id AND department_id=dept AND role_code='student';
   IF u.id IS NULL OR NOT u.id=ANY(current_roster) OR u.full_name IS DISTINCT FROM btrim(item->>'name') OR (item ? 'existingId' AND u.id IS DISTINCT FROM (item->>'existingId')::uuid) OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN ('name','email','existingId','_role','_lead')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHOR_LOCKED';END IF;
   resolved:=jsonb_build_object('id',u.id,'nameMatches',true);
  ELSE
   resolved:=app.project_person_resolution(actor,sid,dept,item-ARRAY['_role','_lead'],item->>'_role');
   IF resolved->>'nameMatches'<>'true' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='VERIFY_EXISTING_NAME';END IF;
   IF locked AND (resolved->>'id' IS NULL OR resolved->>'status'<>'active') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INELIGIBLE_SUPERVISOR';END IF;
   IF resolved->>'id' IS NULL THEN
    INSERT INTO app.users(full_name,email,role_code,university_id,department_id,locale) VALUES(btrim(item->>'name'),item->>'email',item->>'_role',a.university_id,dept,data->>'locale') RETURNING * INTO u;
   ELSE SELECT * INTO u FROM app.users WHERE id=(resolved->>'id')::uuid;END IF;
  END IF;
  IF item->>'_role'='faculty_supervisor' THEN faculty:=u.id;END IF;
  IF item->>'_lead'='true' THEN lead:=u.id;IF locked AND u.account_status<>'active' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INELIGIBLE_LEAD';END IF;END IF;
  needs:=NOT locked AND u.account_status='inactive' AND NOT EXISTS(SELECT 1 FROM app.account_email_outbox e JOIN app.account_lifecycle l ON l.id=e.lifecycle_id WHERE e.user_id=u.id AND e.purpose='ACCOUNT_SETUP' AND l.revoked_at IS NULL AND l.consumed_at IS NULL AND l.expires_at>app.lifecycle_now());
  mailid:=CASE WHEN needs THEN gen_random_uuid() ELSE NULL END;
  targets:=targets||jsonb_build_array(jsonb_build_object('id',u.id,'university',u.university_id,'name',u.full_name,'email',u.email,'locale',u.locale,'requiresMail',needs,'command',mailid,'role',u.role_code));
 END LOOP;
 SELECT array_agg(member.id ORDER BY n) INTO roster FROM jsonb_array_elements(data->'students') WITH ORDINALITY t(x,n) JOIN app.users member ON member.email=x->>'email' AND member.university_id=a.university_id AND member.role_code='student' AND member.department_id=dept;
 IF cardinality(roster) IS DISTINCT FROM jsonb_array_length(data->'students') OR faculty IS NULL OR lead IS NULL OR NOT lead=ANY(roster) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INVALID_TEAM';END IF;
 IF op='create' THEN
  INSERT INTO app.student_groups(university_id,department_id,external_group_id,internal_only) VALUES(a.university_id,dept,NULL,true) RETURNING id INTO gid;
  INSERT INTO app.group_members(university_id,group_id,user_id) SELECT a.university_id,gid,x FROM unnest(roster) x;
  INSERT INTO app.projects(university_id,department_id,group_id,supervisor_id,created_by,assignment_managed,guided_onboarding) VALUES(a.university_id,dept,gid,faculty,actor,true,true) RETURNING id INTO pid;
  INSERT INTO app.project_versions(university_id,project_id,version_number,title,academic_year,status) VALUES(a.university_id,pid,1,btrim(data->>'title'),data->>'year','draft') RETURNING id INTO vid;
  UPDATE app.projects SET current_version_id=vid WHERE id=pid;
 ELSIF locked THEN
  IF roster IS DISTINCT FROM current_roster THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHOR_LOCKED';END IF;
  IF faculty IS DISTINCT FROM p.supervisor_id THEN PERFORM app.assignment_command(actor,sid,'supervisor',jsonb_build_object('project',pid,'expected',(SELECT row_version FROM app.projects WHERE id=pid),'supervisor',faculty,'reason',data->>'reason'));END IF;
  IF NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=lead AND is_team_lead) THEN PERFORM app.assignment_command(actor,sid,'lead',jsonb_build_object('project',pid,'expected',(SELECT row_version FROM app.projects WHERE id=pid),'lead',lead,'reason',data->>'reason'));END IF;
 ELSE
  DELETE FROM app.project_authors WHERE project_id=pid;
  UPDATE app.projects SET supervisor_id=faculty,row_version=row_version+1 WHERE id=pid;
  -- Internal storage membership follows the copied roster only before submission.
  IF EXISTS(SELECT 1 FROM app.student_groups WHERE id=p.group_id AND internal_only) THEN DELETE FROM app.group_members WHERE group_id=p.group_id;INSERT INTO app.group_members(university_id,group_id,user_id) SELECT a.university_id,p.group_id,x FROM unnest(roster) x;END IF;
 END IF;
 IF NOT locked THEN INSERT INTO app.project_authors(university_id,project_id,user_id,author_order,is_team_lead) SELECT a.university_id,pid,x,n,x=lead FROM unnest(roster) WITH ORDINALITY t(x,n);END IF;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,before_state,after_state,reason,correlation_id,event_key) VALUES(ev,actor,a.role_code,a.university_id,'project.onboarding.'||op,'project',pid,pid,before_value,jsonb_build_object('scope',jsonb_build_object('authors',roster,'lead',lead,'supervisor',faculty)::text,'count',cardinality(roster),'row_version',(SELECT row_version FROM app.projects WHERE id=pid)),CASE WHEN op='create' THEN 'Guided private project creation and individual account onboarding' ELSE btrim(data->>'reason') END,cid,ev);
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,recipient.id,a.university_id,pid,'assignment.changed',jsonb_build_object('route',CASE recipient.role_code WHEN 'student' THEN '/projects/' WHEN 'faculty_supervisor' THEN '/supervision/projects/' ELSE '/admin/university/projects/' END||pid::text,'message_key','assignment.changed') FROM app.users recipient WHERE recipient.id=ANY(roster) OR recipient.id=faculty OR recipient.id=actor;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 result:=jsonb_build_object('id',pid,'university',a.university_id,'operation',op,'revision',(SELECT row_version FROM app.projects WHERE id=pid));
 INSERT INTO app.project_onboarding_receipts(actor_id,command_id,operation,university_id,project_id,payload_hash,targets,result) VALUES(actor,cid,op,a.university_id,pid,ph,targets,result);
 RETURN result||jsonb_build_object('targets',targets);
END $$;
--> statement-breakpoint
CREATE FUNCTION app.project_task_commit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.project_onboarding_receipts;t jsonb;
BEGIN
 SELECT * INTO r FROM app.project_onboarding_receipts WHERE actor_id=NEW.actor_id AND command_id=NEW.command_id;
 IF NOT r.completed THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_PROJECT_ONBOARDING';END IF;
 FOR t IN SELECT x FROM jsonb_array_elements(r.targets) x WHERE x->>'requiresMail'='true' LOOP
  IF NOT EXISTS(SELECT 1 FROM app.account_email_outbox WHERE command=(t->>'command')::uuid AND user_id=(t->>'id')::uuid AND university_id=r.university_id AND purpose='ACCOUNT_SETUP') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_ACCOUNT_INVITATION';END IF;
 END LOOP;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER project_task_complete AFTER INSERT ON app.project_onboarding_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.project_task_commit_guard();
CREATE FUNCTION app.project_task_finish(actor uuid,sid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;r app.project_onboarding_receipts;t jsonb;
BEGIN
 a:=app.project_task_actor(actor,sid);SELECT * INTO r FROM app.project_onboarding_receipts WHERE actor_id=actor AND command_id=cid AND university_id=a.university_id FOR UPDATE;
 IF r.command_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 FOR t IN SELECT x FROM jsonb_array_elements(r.targets) x WHERE x->>'requiresMail'='true' LOOP
  IF NOT EXISTS(SELECT 1 FROM app.account_email_outbox WHERE command=(t->>'command')::uuid AND user_id=(t->>'id')::uuid AND university_id=r.university_id AND purpose='ACCOUNT_SETUP') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_ACCOUNT_INVITATION';END IF;
 END LOOP;UPDATE app.project_onboarding_receipts SET completed=true WHERE actor_id=actor AND command_id=cid;RETURN r.result;
END $$;
CREATE FUNCTION app.project_task_receipt(actor uuid,sid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;r app.project_onboarding_receipts;
BEGIN
 a:=app.project_task_actor(actor,sid);PERFORM pg_advisory_xact_lock(hashtext('project_onboarding:'||actor::text||':'||cid::text));SELECT * INTO r FROM app.project_onboarding_receipts WHERE actor_id=actor AND command_id=cid AND university_id=a.university_id AND completed;RETURN r.result;
END $$;
REVOKE ALL ON FUNCTION app.project_task_prepare(uuid,uuid,uuid,text,jsonb),app.project_task_finish(uuid,uuid,uuid),app.project_task_receipt(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.project_task_prepare(uuid,uuid,uuid,text,jsonb),app.project_task_finish(uuid,uuid,uuid),app.project_task_receipt(uuid,uuid,uuid) TO capstone_runtime;
REVOKE ALL ON FUNCTION app.project_task_commit_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
