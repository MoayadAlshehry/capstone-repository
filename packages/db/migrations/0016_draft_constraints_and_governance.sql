ALTER TABLE app.project_versions ADD CONSTRAINT canonical_draft_fields CHECK(app.draft_fields_valid(jsonb_build_object('title',coalesce(title,''),'abstract',coalesce(abstract,''),'keywords',keywords,'academic_year',coalesce(academic_year,''),'domain',coalesce(domain,''))));
ALTER FUNCTION app.draft_save(uuid,uuid,uuid,uuid,integer,jsonb) RENAME TO draft_save_command;
REVOKE ALL ON FUNCTION app.draft_save_command(uuid,uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.draft_save(reader uuid,sid uuid,pid uuid,vid uuid,expected integer,data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 PERFORM app.draft_save_command(reader,sid,pid,vid,expected,data);
 RETURN jsonb_build_object('project',(app.draft_view(reader,sid,pid)->'projects')->0);
END $$;
REVOKE ALL ON FUNCTION app.draft_save(uuid,uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.draft_save(uuid,uuid,uuid,uuid,integer,jsonb) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.draft_governance(reader uuid,sid uuid,pid uuid,reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users; p app.projects; v app.project_versions; ev uuid:=gen_random_uuid(); result jsonb;
BEGIN
 SELECT * INTO a FROM app.users WHERE id=reader FOR SHARE;
 IF a.id IS NULL OR a.role_code<>'platform_admin' OR a.account_status<>'active' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 PERFORM 1 FROM app.auth_sessions WHERE id=sid AND user_id=reader AND expires_at>clock_timestamp() FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN'; END IF;
 reason:=btrim(reason);IF reason IS NULL OR char_length(reason) NOT BETWEEN 3 AND 400 OR reason ~ '[[:cntrl:]]' OR reason ~* '(password|secret|token|cookie)[[:space:]]*[:=]' OR reason ~* '[0-9a-f-]{36}[.][0-9a-f-]{36}[.][0-9a-f]{64}' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_REASON'; END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid AND assignment_managed FOR SHARE;
 IF p.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND'; END IF;SELECT * INTO v FROM app.project_versions WHERE id=p.current_version_id FOR SHARE;
 SELECT jsonb_build_object('id',p.id,'group',g.external_group_id,'department',d.code,'university',un.name_en,'universityAr',un.name_ar,'row_version',p.row_version,'version',v.id,'status',v.status,'locked',EXISTS(SELECT 1 FROM app.project_submissions WHERE project_id=p.id),'authored',false,'lead',false,'supervised',false,'supervisor',jsonb_build_object('id',s.id,'name',s.full_name),'authors',(SELECT jsonb_agg(jsonb_build_object('id',pa.user_id,'name',u.full_name,'order',pa.author_order,'lead',pa.is_team_lead) ORDER BY pa.author_order) FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id WHERE pa.project_id=p.id),'metadata',jsonb_build_object('title',coalesce(v.title,''),'abstract',coalesce(v.abstract,''),'keywords',v.keywords,'academic_year',coalesce(v.academic_year,''),'domain',coalesce(v.domain,'')),'metadataRevision',v.row_version,'updatedAt',v.updated_at,'relations',jsonb_build_object('scope',true,'authors',NOT EXISTS(SELECT 1 FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id WHERE pa.project_id=p.id AND u.account_status<>'active'),'lead',(SELECT count(*)=1 FROM app.project_authors WHERE project_id=p.id AND is_team_lead),'supervisor',s.account_status='active')) INTO result FROM app.student_groups g JOIN app.departments d ON d.id=p.department_id JOIN app.universities un ON un.id=p.university_id JOIN app.users s ON s.id=p.supervisor_id WHERE g.id=p.group_id;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,before_state,after_state,reason,correlation_id,event_key) VALUES(ev,reader,a.role_code,p.university_id,'draft.governance.read','project_version',v.id,p.id,v.id,'{}',jsonb_build_object('scope','explicit_private_metadata_read','row_version',v.row_version),reason,ev,ev);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.draft_governance(uuid,uuid,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.draft_governance(uuid,uuid,uuid,text) TO capstone_runtime;
