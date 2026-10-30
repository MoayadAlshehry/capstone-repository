-- Managed shells use the existing core tables. Legacy technical core fixtures are
-- not retroactively converted into the new finite administrative workflow.
ALTER TABLE app.projects ADD COLUMN assignment_managed boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX assignment_one_group ON app.projects(group_id) WHERE assignment_managed;
--> statement-breakpoint
CREATE FUNCTION app.assignment_principal(reader uuid, sid uuid) RETURNS app.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;
BEGIN
 SELECT * INTO a FROM app.users WHERE id=reader;
 IF a.id IS NULL OR a.account_status<>'active' OR a.role_code NOT IN ('university_admin','student','faculty_supervisor') OR NOT EXISTS(SELECT 1 FROM app.auth_sessions WHERE id=sid AND user_id=reader AND expires_at>clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM app.universities WHERE id=a.university_id AND status='active') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION app.assignment_principal(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.assignment_roster_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE p app.projects; pid uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END;
BEGIN
 SELECT * INTO p FROM app.projects WHERE id=pid FOR UPDATE;
 IF p.assignment_managed THEN
  IF EXISTS(SELECT 1 FROM app.project_submissions WHERE project_id=pid) AND (TG_OP IN ('INSERT','DELETE') OR (NEW.user_id,NEW.author_order,NEW.project_id,NEW.university_id) IS DISTINCT FROM (OLD.user_id,OLD.author_order,OLD.project_id,OLD.university_id)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHOR_LOCKED'; END IF;
  IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM app.users WHERE id=NEW.user_id AND university_id=p.university_id AND department_id=p.department_id AND role_code='student') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INVALID_AUTHOR'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER assignment_author_lock BEFORE INSERT OR UPDATE OR DELETE ON app.project_authors FOR EACH ROW EXECUTE FUNCTION app.assignment_roster_guard();
CREATE FUNCTION app.assignment_lead_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE pid uuid:=CASE WHEN TG_TABLE_NAME='projects' THEN NEW.id WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END; n integer; leads integer; mx integer;
BEGIN
 IF EXISTS(SELECT 1 FROM app.projects WHERE id=pid AND assignment_managed) THEN
  SELECT count(*),count(*) FILTER(WHERE is_team_lead),max(author_order) INTO n,leads,mx FROM app.project_authors WHERE project_id=pid;
  IF n<1 OR leads<>1 OR mx<>n THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='ONE_LEAD_CONSECUTIVE_AUTHORS'; END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER assignment_project_lead AFTER INSERT OR UPDATE ON app.projects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.assignment_lead_guard();
CREATE CONSTRAINT TRIGGER assignment_author_lead AFTER INSERT OR UPDATE OR DELETE ON app.project_authors DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.assignment_lead_guard();
CREATE FUNCTION app.assignment_submission_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$ BEGIN PERFORM 1 FROM app.projects WHERE id=NEW.project_id FOR UPDATE; RETURN NEW; END $$;
CREATE TRIGGER assignment_submission_serialization BEFORE INSERT ON app.project_submissions FOR EACH ROW EXECUTE FUNCTION app.assignment_submission_lock();
CREATE FUNCTION app.assignment_group_lock() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$ BEGIN
 IF TG_OP IN ('DELETE','UPDATE') THEN PERFORM 1 FROM app.student_groups WHERE id=OLD.group_id FOR UPDATE; END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM 1 FROM app.student_groups WHERE id=NEW.group_id FOR UPDATE; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER assignment_group_serialization BEFORE INSERT OR UPDATE OR DELETE ON app.group_members FOR EACH ROW EXECUTE FUNCTION app.assignment_group_lock();
REVOKE ALL ON FUNCTION app.assignment_roster_guard(),app.assignment_lead_guard(),app.assignment_submission_lock(),app.assignment_group_lock() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.assignment_command(reader uuid,sid uuid,operation text,data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users; g app.student_groups; p app.projects; pid uuid; vid uuid; uid uuid; faculty uuid; lead uuid; roster uuid[]; n integer; ev uuid:=gen_random_uuid(); before_value jsonb:='{}'; after_value jsonb; reason text;
BEGIN
 a:=app.assignment_principal(reader,sid);
 IF a.role_code<>'university_admin' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 PERFORM 1 FROM app.users WHERE id=reader FOR UPDATE; a:=app.assignment_principal(reader,sid);
 PERFORM 1 FROM app.auth_sessions WHERE id=sid AND expires_at>clock_timestamp() FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 PERFORM 1 FROM app.universities WHERE id=a.university_id AND status='active' FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 IF operation NOT IN ('create','authors','lead','supervisor') OR jsonb_typeof(data)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE k NOT IN ('group','project','expected','authors','lead','supervisor','reason')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT'; END IF;
 reason:=btrim(coalesce(data->>'reason',''));
 IF length(reason) NOT BETWEEN 3 AND 400 OR reason ~ '[[:cntrl:]]' OR reason ~* '(password|secret|token|cookie)[[:space:]]*[:=]' OR reason ~* '[0-9a-f-]{36}[.][0-9a-f-]{36}[.][0-9a-f]{64}' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_REASON'; END IF;
 IF operation='create' THEN
  SELECT * INTO g FROM app.student_groups WHERE id=(data->>'group')::uuid AND university_id=a.university_id FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM app.projects WHERE group_id=g.id AND assignment_managed) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='DUPLICATE_SHELL'; END IF;
  PERFORM 1 FROM app.departments WHERE id=g.department_id AND university_id=a.university_id FOR SHARE;
  pid:=gen_random_uuid(); p.id:=pid;p.university_id:=a.university_id;p.department_id:=g.department_id;p.row_version:=0;
 ELSE
  SELECT * INTO p FROM app.projects WHERE id=(data->>'project')::uuid AND university_id=a.university_id AND assignment_managed FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND'; END IF;
  pid:=p.id;
  IF (data->>'expected')::integer IS DISTINCT FROM p.row_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE'; END IF;
  SELECT jsonb_build_object('scope',jsonb_build_object('authors',jsonb_agg(jsonb_build_object('user',user_id,'order',author_order,'lead',is_team_lead) ORDER BY author_order),'supervisor',p.supervisor_id)::text,'row_version',p.row_version) INTO before_value FROM app.project_authors WHERE project_id=pid;
 END IF;
 IF operation IN ('create','authors') THEN
  IF operation='authors' AND EXISTS(SELECT 1 FROM app.project_submissions WHERE project_id=pid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHOR_LOCKED'; END IF;
  IF jsonb_typeof(data->'authors') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_AUTHORS'; END IF;
  SELECT array_agg(value::uuid ORDER BY ord) INTO roster FROM jsonb_array_elements_text(data->'authors') WITH ORDINALITY x(value,ord);
  n:=coalesce(cardinality(roster),0);lead:=(data->>'lead')::uuid;
  IF n NOT BETWEEN 1 AND 1000 OR (SELECT count(DISTINCT x) FROM unnest(roster) x)<>n OR lead IS NULL OR NOT lead=ANY(roster) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_AUTHORS'; END IF;
  FOR uid IN SELECT unnest(roster) ORDER BY 1 LOOP
   PERFORM 1 FROM app.users WHERE id=uid AND university_id=a.university_id AND department_id=p.department_id AND role_code='student' AND account_status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INELIGIBLE_AUTHOR'; END IF;
  END LOOP;
  IF operation='create' AND (EXISTS(SELECT 1 FROM app.group_members WHERE group_id=g.id AND NOT user_id=ANY(roster)) OR EXISTS(SELECT 1 FROM unnest(roster) x WHERE NOT EXISTS(SELECT 1 FROM app.group_members WHERE group_id=g.id AND user_id=x))) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_CHANGED'; END IF;
 END IF;
 IF operation IN ('create','supervisor') THEN
  faculty:=(data->>'supervisor')::uuid;
  PERFORM 1 FROM app.users WHERE id=faculty AND university_id=a.university_id AND role_code='faculty_supervisor' AND account_status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INELIGIBLE_SUPERVISOR'; END IF;
 END IF;
 IF operation='create' THEN
  INSERT INTO app.projects(id,university_id,department_id,group_id,supervisor_id,created_by,assignment_managed) VALUES(pid,a.university_id,g.department_id,g.id,faculty,reader,true);
  INSERT INTO app.project_versions(university_id,project_id,version_number,status) VALUES(a.university_id,pid,1,'draft') RETURNING id INTO vid;
  UPDATE app.projects SET current_version_id=vid WHERE id=pid;
 ELSIF operation='supervisor' THEN UPDATE app.projects SET supervisor_id=faculty WHERE id=pid;
 ELSIF operation='lead' THEN
  lead:=(data->>'lead')::uuid;
  PERFORM 1 FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id WHERE pa.project_id=pid AND pa.user_id=lead AND u.account_status='active' AND u.role_code='student' AND u.university_id=a.university_id FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LEAD'; END IF;
  UPDATE app.project_authors SET is_team_lead=false WHERE project_id=pid AND is_team_lead;
  UPDATE app.project_authors SET is_team_lead=true WHERE project_id=pid AND user_id=lead;
 END IF;
 IF operation IN ('create','authors') THEN
  IF operation='authors' THEN DELETE FROM app.project_authors WHERE project_id=pid; END IF;
  INSERT INTO app.project_authors(university_id,project_id,user_id,author_order,is_team_lead) SELECT a.university_id,pid,x,ord,x=lead FROM unnest(roster) WITH ORDINALITY t(x,ord);
 END IF;
 IF operation<>'create' THEN UPDATE app.projects SET row_version=row_version+1 WHERE id=pid; END IF;
 SELECT jsonb_build_object('scope',jsonb_build_object('authors',jsonb_agg(jsonb_build_object('user',user_id,'order',author_order,'lead',is_team_lead) ORDER BY author_order),'supervisor',(SELECT supervisor_id FROM app.projects WHERE id=pid))::text,'count',count(*),'row_version',(SELECT row_version FROM app.projects WHERE id=pid)) INTO after_value FROM app.project_authors WHERE project_id=pid;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,before_state,after_state,reason,correlation_id,event_key) VALUES(ev,reader,a.role_code,a.university_id,'assignment.'||operation,'project',pid,pid,before_value,after_value,reason,ev,ev);
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,x,a.university_id,pid,'assignment.changed',jsonb_build_object('route','/projects/'||pid::text,'message_key','assignment.changed') FROM (SELECT user_id x FROM app.project_authors WHERE project_id=pid UNION SELECT supervisor_id FROM app.projects WHERE id=pid UNION SELECT reader) recipients;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 RETURN jsonb_build_object('id',pid,'row_version',(SELECT row_version FROM app.projects WHERE id=pid));
END $$;
REVOKE ALL ON FUNCTION app.assignment_command(uuid,uuid,text,jsonb) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.assignment_command(uuid,uuid,text,jsonb) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.assignment_view(reader uuid,sid uuid,target uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users; result jsonb; projects_value jsonb;
BEGIN
 a:=app.assignment_principal(reader,sid);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'group',g.external_group_id,'department',d.code,'university',un.name_en,'universityAr',un.name_ar,'row_version',p.row_version,'status',v.status,'version',v.id,'locked',EXISTS(SELECT 1 FROM app.project_submissions WHERE project_id=p.id),'authored',EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=p.id AND user_id=reader),'lead',EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=p.id AND user_id=reader AND is_team_lead),'supervised',p.supervisor_id=reader,'supervisor',jsonb_build_object('id',s.id,'name',s.full_name),'authors',(SELECT jsonb_agg(jsonb_build_object('id',pa.user_id,'name',u.full_name,'order',pa.author_order,'lead',pa.is_team_lead) ORDER BY pa.author_order) FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id WHERE pa.project_id=p.id)) ORDER BY p.created_at,p.id),'[]') INTO projects_value
 FROM app.projects p JOIN app.student_groups g ON g.id=p.group_id JOIN app.departments d ON d.id=p.department_id JOIN app.universities un ON un.id=p.university_id JOIN app.users s ON s.id=p.supervisor_id JOIN app.project_versions v ON v.id=p.current_version_id
 WHERE p.assignment_managed AND p.university_id=a.university_id AND (target IS NULL OR p.id=target) AND (a.role_code='university_admin' OR (a.role_code='student' AND EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=p.id AND user_id=reader)) OR (a.role_code='faculty_supervisor' AND p.supervisor_id=reader));
 IF target IS NOT NULL AND jsonb_array_length(projects_value)=0 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND'; END IF;
 result:=jsonb_build_object('projects',projects_value,'groups','[]'::jsonb,'students','[]'::jsonb,'faculty','[]'::jsonb);
 IF a.role_code='university_admin' THEN
  result:=result||jsonb_build_object('groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'code',g.external_group_id,'department',d.code,'used',EXISTS(SELECT 1 FROM app.projects WHERE group_id=g.id AND assignment_managed),'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'status',u.account_status,'department',dd.code) ORDER BY u.full_name,u.id),'[]') FROM app.group_members m JOIN app.users u ON u.id=m.user_id LEFT JOIN app.departments dd ON dd.id=u.department_id WHERE m.group_id=g.id)) ORDER BY g.external_group_id),'[]') FROM app.student_groups g JOIN app.departments d ON d.id=g.department_id WHERE g.university_id=a.university_id),
   'students',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name,'department',d.code) ORDER BY u.full_name,u.id),'[]') FROM app.users u JOIN app.departments d ON d.id=u.department_id WHERE u.university_id=a.university_id AND u.role_code='student' AND u.account_status='active'),
   'faculty',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name) ORDER BY full_name,id),'[]') FROM app.users WHERE university_id=a.university_id AND role_code='faculty_supervisor' AND account_status='active'));
 END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.assignment_view(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.assignment_view(uuid,uuid,uuid) TO capstone_runtime;
