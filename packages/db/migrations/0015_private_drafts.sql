ALTER TABLE app.project_versions ADD COLUMN row_version integer NOT NULL DEFAULT 0 CHECK(row_version>=0), ADD COLUMN updated_at timestamptz(3) NOT NULL DEFAULT now(), ADD COLUMN updated_by uuid;
ALTER TABLE app.project_versions ADD FOREIGN KEY(university_id,updated_by) REFERENCES app.users(university_id,id);
ALTER TABLE app.project_versions ADD CONSTRAINT draft_title_bound CHECK(title IS NULL OR char_length(title)<=200), ADD CONSTRAINT draft_abstract_bound CHECK(abstract IS NULL OR char_length(abstract)<=5000), ADD CONSTRAINT draft_keywords_bound CHECK(jsonb_array_length(keywords)<=10), ADD CONSTRAINT draft_domain_code CHECK(domain IS NULL OR domain IN ('software','data','hardware'));
CREATE UNIQUE INDEX one_current_workspace ON app.project_versions(project_id) WHERE status IN ('draft','revision_required','pending_review');
--> statement-breakpoint
CREATE FUNCTION app.draft_fields_valid(data jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app AS $$
DECLARE k text; v text; seen text[]:='{}'; y text;
BEGIN
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(data))<>5 OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) x WHERE x NOT IN ('title','abstract','keywords','academic_year','domain')) THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['title','abstract','academic_year','domain'] LOOP
  IF jsonb_typeof(data->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  v:=data->>k;
  IF v ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' OR (k<>'abstract' AND v ~ '[\r\n\t]') OR v ~ '[‪-‮⁦-⁩]' THEN RETURN false; END IF;
 END LOOP;
 IF char_length(data->>'title')>200 OR char_length(data->>'abstract')>5000 OR jsonb_typeof(data->'keywords') IS DISTINCT FROM 'array' OR jsonb_array_length(data->'keywords')>10 THEN RETURN false; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements_text(data->'keywords') LOOP
  IF char_length(v) NOT BETWEEN 2 AND 50 OR v<>btrim(v) OR v ~ '[[:cntrl:]‪-‮⁦-⁩]' OR lower(v)=ANY(seen) THEN RETURN false; END IF;seen:=array_append(seen,lower(v));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(data->'keywords') x WHERE jsonb_typeof(x)<>'string') THEN RETURN false; END IF;
 y:=data->>'academic_year';
 IF y<>'' AND (y !~ '^[0-9]{4}–[0-9]{4}$' OR right(y,4)::integer<>left(y,4)::integer+1) THEN RETURN false; END IF;
 IF data->>'domain' NOT IN ('','software','data','hardware') THEN RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION app.draft_fields_valid(jsonb) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.draft_view(reader uuid,sid uuid,target uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb; item jsonb; v app.project_versions; p app.projects; output jsonb:='[]'; relations jsonb;
BEGIN
 result:=app.assignment_view(reader,sid,target);
 FOR item IN SELECT value FROM jsonb_array_elements(result->'projects') LOOP
  SELECT * INTO p FROM app.projects WHERE id=(item->>'id')::uuid;SELECT * INTO v FROM app.project_versions WHERE id=p.current_version_id;
  relations:=jsonb_build_object('scope',EXISTS(SELECT 1 FROM app.departments d JOIN app.universities u ON u.id=d.university_id WHERE d.id=p.department_id AND d.university_id=p.university_id AND u.status='active'),
  'authors',EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=p.id) AND NOT EXISTS(SELECT 1 FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id WHERE pa.project_id=p.id AND (u.role_code<>'student' OR u.university_id<>p.university_id OR u.department_id IS DISTINCT FROM p.department_id OR u.account_status<>'active')),
  'lead',(SELECT count(*)=1 FROM app.project_authors WHERE project_id=p.id AND is_team_lead),
  'supervisor',EXISTS(SELECT 1 FROM app.users WHERE id=p.supervisor_id AND role_code='faculty_supervisor' AND university_id=p.university_id AND account_status='active'));
  output:=output||jsonb_build_array(item||jsonb_build_object('metadata',jsonb_build_object('title',coalesce(v.title,''),'abstract',coalesce(v.abstract,''),'keywords',v.keywords,'academic_year',coalesce(v.academic_year,''),'domain',coalesce(v.domain,'')),'metadataRevision',v.row_version,'updatedAt',v.updated_at,'relations',relations));
 END LOOP;RETURN result||jsonb_build_object('projects',output);
END $$;
REVOKE ALL ON FUNCTION app.draft_view(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.draft_view(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.draft_save(reader uuid,sid uuid,pid uuid,vid uuid,expected integer,data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users; p app.projects; v app.project_versions; ev uuid:=gen_random_uuid(); fields text[]:='{}'; k text; old_data jsonb; new_data jsonb; before_hash jsonb:='{}'; after_hash jsonb:='{}';
BEGIN
 a:=app.assignment_principal(reader,sid);IF a.role_code<>'student' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 PERFORM 1 FROM app.universities WHERE id=a.university_id AND status='active' FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid AND university_id=a.university_id AND assignment_managed FOR UPDATE;
 IF p.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND'; END IF;
 PERFORM 1 FROM app.users WHERE id=reader FOR SHARE;PERFORM 1 FROM app.auth_sessions WHERE id=sid AND user_id=reader AND expires_at>clock_timestamp() FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;a:=app.assignment_principal(reader,sid);
 IF a.role_code<>'student' OR NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reader) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 SELECT * INTO v FROM app.project_versions WHERE id=vid AND project_id=pid AND university_id=a.university_id FOR UPDATE;
 IF v.id IS NULL OR p.current_version_id<>vid THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND'; END IF;
 IF v.status NOT IN ('draft','revision_required') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LOCKED'; END IF;
 IF expected IS DISTINCT FROM v.row_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE'; END IF;
 IF NOT app.draft_fields_valid(data) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_METADATA'; END IF;
 old_data:=jsonb_build_object('title',coalesce(v.title,''),'abstract',coalesce(v.abstract,''),'keywords',v.keywords,'academic_year',coalesce(v.academic_year,''),'domain',coalesce(v.domain,''));new_data:=data;
 FOREACH k IN ARRAY ARRAY['title','abstract','keywords','academic_year','domain'] LOOP
  IF old_data->k IS DISTINCT FROM new_data->k THEN fields:=array_append(fields,k);before_hash:=before_hash||jsonb_build_object(k,encode(public.digest((old_data->k)::text,'sha256'),'hex'));after_hash:=after_hash||jsonb_build_object(k,encode(public.digest((new_data->k)::text,'sha256'),'hex')); END IF;
 END LOOP;
 UPDATE app.project_versions SET title=nullif(data->>'title',''),abstract=nullif(data->>'abstract',''),keywords=data->'keywords',academic_year=nullif(data->>'academic_year',''),domain=nullif(data->>'domain',''),row_version=row_version+1,updated_at=clock_timestamp(),updated_by=reader WHERE id=vid;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,before_state,after_state,reason,correlation_id,event_key) VALUES(ev,reader,a.role_code,a.university_id,'draft.metadata.save','project_version',vid,pid,vid,jsonb_build_object('scope',jsonb_build_object('fields',fields,'hashes',before_hash)::text,'row_version',v.row_version,'count',cardinality(fields)),jsonb_build_object('scope',jsonb_build_object('fields',fields,'hashes',after_hash)::text,'row_version',v.row_version+1,'count',cardinality(fields)),'Private draft metadata save',ev,ev);
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,user_id,a.university_id,pid,'draft.saved',jsonb_build_object('route','/projects/'||pid::text,'message_key','draft.saved') FROM app.project_authors WHERE project_id=pid;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 RETURN jsonb_build_object('revision',v.row_version+1);
END $$;
REVOKE ALL ON FUNCTION app.draft_save(uuid,uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.draft_save(uuid,uuid,uuid,uuid,integer,jsonb) TO capstone_runtime;
