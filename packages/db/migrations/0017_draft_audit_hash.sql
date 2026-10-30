CREATE OR REPLACE FUNCTION app.draft_save_command(reader uuid,sid uuid,pid uuid,vid uuid,expected integer,data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
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
  IF old_data->k IS DISTINCT FROM new_data->k THEN fields:=array_append(fields,k);before_hash:=before_hash||jsonb_build_object(k,encode(sha256(convert_to((old_data->k)::text,'UTF8')),'hex'));after_hash:=after_hash||jsonb_build_object(k,encode(sha256(convert_to((new_data->k)::text,'UTF8')),'hex')); END IF;
 END LOOP;
 UPDATE app.project_versions SET title=nullif(data->>'title',''),abstract=nullif(data->>'abstract',''),keywords=data->'keywords',academic_year=nullif(data->>'academic_year',''),domain=nullif(data->>'domain',''),row_version=row_version+1,updated_at=clock_timestamp(),updated_by=reader WHERE id=vid;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,before_state,after_state,reason,correlation_id,event_key) VALUES(ev,reader,a.role_code,a.university_id,'draft.metadata.save','project_version',vid,pid,vid,jsonb_build_object('scope',jsonb_build_object('fields',fields,'hashes',before_hash)::text,'row_version',v.row_version,'count',cardinality(fields)),jsonb_build_object('scope',jsonb_build_object('fields',fields,'hashes',after_hash)::text,'row_version',v.row_version+1,'count',cardinality(fields)),'Private draft metadata save',ev,ev);
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,user_id,a.university_id,pid,'draft.saved',jsonb_build_object('route','/projects/'||pid::text,'message_key','draft.saved') FROM app.project_authors WHERE project_id=pid;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 RETURN jsonb_build_object('revision',v.row_version+1);
END $$;
REVOKE ALL ON FUNCTION app.draft_save_command(uuid,uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,capstone_runtime,capstone_jobs;
