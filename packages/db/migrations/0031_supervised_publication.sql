-- Deliberate publication only, independent of numerical thresholds/disagreement.
ALTER TABLE app.review_records DROP CONSTRAINT review_records_decision_check;
ALTER TABLE app.review_records ADD CONSTRAINT review_records_decision_check CHECK(decision IN ('revision_required','rejected','archived'));
CREATE FUNCTION app.publication_state(reader uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;p app.projects;s app.project_submissions;v app.project_versions;sq integer;cq integer;issues text[]:='{}';r app.review_records;
BEGIN
 a:=app.assignment_principal(reader,sid);p:=app.submission_actor(reader,sid,sub);SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO v FROM app.project_versions WHERE id=s.version_id;SELECT * INTO r FROM app.review_records WHERE submission_id=sub;
 SELECT quarter_points INTO sq FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor' AND rubric_code='CORE_V1';SELECT quarter_points INTO cq FROM app.internal_assessments WHERE submission_id=sub AND layer='committee' AND rubric_code='CORE_V1';
 IF p.supervisor_id IS DISTINCT FROM reader OR (app.assignment_principal(reader,sid)).role_code<>'faculty_supervisor' THEN issues:=array_append(issues,'ASSIGNED_SUPERVISOR');END IF;
 IF v.status<>'pending_review' THEN issues:=array_append(issues,'PENDING_ROUND');END IF;
 IF p.current_version_id IS DISTINCT FROM v.id OR sub IS DISTINCT FROM (SELECT id FROM app.project_submissions WHERE version_id=v.id ORDER BY round_number DESC LIMIT 1) THEN issues:=array_append(issues,'CURRENT_ROUND');END IF;
 IF r.id IS NOT NULL THEN issues:=array_append(issues,'FINAL_OUTCOME');END IF;
 IF sq IS NULL THEN issues:=array_append(issues,'SUPERVISOR_ASSESSMENT');END IF;IF cq IS NULL THEN issues:=array_append(issues,'COMMITTEE_ASSESSMENT');END IF;
 RETURN jsonb_build_object('submission',sub,'issues',issues,'canPublish',cardinality(issues)=0,'published',v.status='archived' AND v.approved_submission_id=sub AND p.published_version_id=v.id,'approvedSubmission',v.approved_submission_id,'archivedAt',v.archived_at,'publishedVersion',p.published_version_id,'internal',CASE WHEN (v.status='archived' AND v.approved_submission_id=sub) OR (p.supervisor_id=reader AND a.role_code='faculty_supervisor') THEN (2*sq+3*cq)::numeric/20 ELSE NULL END,'rubric','CORE_V1','supervisor',CASE WHEN p.supervisor_id=reader AND a.role_code='faculty_supervisor' THEN sq::numeric/4 ELSE NULL END,'committee',CASE WHEN p.supervisor_id=reader AND a.role_code='faculty_supervisor' THEN cq::numeric/4 ELSE NULL END,'disagreement',CASE WHEN p.supervisor_id=reader AND a.role_code='faculty_supervisor' THEN EXISTS(SELECT 1 FROM app.internal_evaluation_issues i JOIN app.evaluation_cases c ON c.id=i.case_id WHERE c.submission_id=sub) ELSE false END);
END $$;
REVOKE ALL ON FUNCTION app.publication_state(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.publication_state(uuid,uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.publication_prepare(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;v app.project_versions;r app.command_receipts;state jsonb;files jsonb;rv app.rubric_versions;
BEGIN
 p:=app.evaluation_actor(reader,sid,sub,false);SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO v FROM app.project_versions WHERE id=s.version_id FOR UPDATE;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'submission.publish' OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result->>'scope');END IF;
 IF v.status='archived' AND v.approved_submission_id=sub AND p.published_version_id=v.id THEN RETURN jsonb_build_object('completed',jsonb_build_object('submission',sub,'version',v.id,'project',p.id,'state','archived','archivedAt',v.archived_at)::text);END IF;
 PERFORM app.evaluation_actor(reader,sid,sub,true,expected,assignment_expected);state:=app.publication_state(reader,sid,sub);
 IF jsonb_array_length(state->'issues')>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PUBLICATION_PREREQUISITES';END IF;
 SELECT * INTO rv FROM app.rubric_versions WHERE code='CORE_V1';
 IF rv.code IS NULL OR rv.kind<>'internal' OR rv.schema_version<>1 OR rv.config_hash<>encode(sha256(convert_to(rv.config::text,'UTF8')),'hex') OR EXISTS(SELECT 1 FROM app.internal_assessments a WHERE a.submission_id=sub AND (a.rubric_code<>'CORE_V1' OR a.rubric_hash<>rv.config_hash OR NOT a.calibration_ack OR (SELECT count(*) FROM app.internal_criterion_scores WHERE assessment_id=a.id)<>7 OR a.quarter_points<>(SELECT sum((ARRAY[10,20,20,20,15,10,5])[(substring(code FROM 2))::int]*level) FROM app.internal_criterion_scores WHERE assessment_id=a.id) OR EXISTS(SELECT 1 FROM app.internal_criterion_scores c WHERE c.assessment_id=a.id AND NOT EXISTS(SELECT 1 FROM app.internal_evidence_locators l WHERE l.assessment_id=a.id AND l.code=c.code)))) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='ASSESSMENT_INTEGRITY';END IF;
 IF (p.published_version_id IS NOT NULL AND p.published_version_id<>v.id) OR v.approved_submission_id IS NOT NULL OR v.archived_at IS NOT NULL OR v.retained_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub) OR EXISTS(SELECT 1 FROM app.submission_files m LEFT JOIN app.project_files f ON f.id=m.file_id WHERE m.submission_id=sub AND (f.id IS NULL OR f.processing_status<>'ready')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PUBLICATION_INTEGRITY';END IF;
 PERFORM app.submission_native_read(reader,sid,p.id,v.id,sub,NULL);
 IF (SELECT count(*) FROM app.submission_files WHERE submission_id=sub)<>(SELECT count(*) FROM app.project_files WHERE version_id=v.id AND is_current) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_MANIFEST';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',m.size_at_submit,'sha256',m.sha256_at_submit) ORDER BY m.file_id) INTO files FROM app.submission_files m JOIN app.storage_objects o ON o.id=m.storage_object_id WHERE m.submission_id=sub;
 RETURN jsonb_build_object('files',files);
END $$;
REVOKE ALL ON FUNCTION app.publication_prepare(uuid,uuid,uuid,integer,integer,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.publication_prepare(uuid,uuid,uuid,integer,integer,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.publication_commit(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prepared jsonb;p app.projects;s app.project_submissions;t timestamptz;ev uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();result jsonb;
BEGIN
 prepared:=app.publication_prepare(reader,sid,sub,expected,assignment_expected,command,payload_hash);IF prepared ? 'completed' THEN RETURN (prepared->>'completed')::jsonb;END IF;
 SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO p FROM app.projects WHERE id=s.project_id;t:=clock_timestamp();
 INSERT INTO app.review_records(id,university_id,project_id,version_id,submission_id,decided_by,decision,comment,decided_at) VALUES(rid,p.university_id,p.id,s.version_id,sub,reader,'archived','Assigned supervisor explicitly approved this frozen round for publication.',t);
 UPDATE app.project_versions SET status='archived',archived_at=t,retained_at=NULL,approved_submission_id=sub,row_version=row_version+1,updated_at=t,updated_by=reader WHERE id=s.version_id;
 UPDATE app.projects SET published_version_id=s.version_id WHERE id=p.id;
 result:=jsonb_build_object('submission',sub,'version',s.version_id,'project',p.id,'state','archived','archivedAt',t);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,before_state,after_state) VALUES(ev,reader,'faculty_supervisor',p.university_id,'submission.publish','review_record',rid,p.id,s.version_id,command,ev,jsonb_build_object('scope','pending_review'),jsonb_build_object('scope',jsonb_build_object('state','archived','approvedSubmission',sub,'publishedVersion',s.version_id,'archivedAt',t)::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,(x->>'id')::uuid,p.university_id,p.id,'review.published',jsonb_build_object('route','/submissions/'||sub::text,'message_key','review.published') FROM jsonb_array_elements(s.authors_snapshot) x;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'submission.publish',payload_hash,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.publication_commit(uuid,uuid,uuid,integer,integer,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.publication_commit(uuid,uuid,uuid,integer,integer,uuid,text) TO capstone_runtime;
CREATE FUNCTION app.publication_projection(pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;v app.project_versions;s app.project_submissions;sq integer;cq integer;
BEGIN
 SELECT * INTO p FROM app.projects WHERE id=pid AND assignment_managed AND published_version_id IS NOT NULL;SELECT * INTO v FROM app.project_versions WHERE id=p.published_version_id AND project_id=p.id AND university_id=p.university_id AND status='archived';SELECT * INTO s FROM app.project_submissions WHERE id=v.approved_submission_id AND version_id=v.id AND project_id=p.id AND university_id=p.university_id;
 IF s.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT quarter_points INTO sq FROM app.internal_assessments WHERE submission_id=s.id AND layer='supervisor';SELECT quarter_points INTO cq FROM app.internal_assessments WHERE submission_id=s.id AND layer='committee';
 IF sq IS NULL OR cq IS NULL OR NOT EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=s.id AND decision='archived') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN jsonb_build_object('project',p.id,'version',v.id,'versionNumber',s.metadata_snapshot->'version'->'number','title',s.metadata_snapshot->'title','abstract',s.metadata_snapshot->'abstract','keywords',s.metadata_snapshot->'keywords','university',(s.metadata_snapshot->'university')-'id','department',(s.metadata_snapshot->'department')-'id','academicYear',s.metadata_snapshot->'academicYear','domain',s.metadata_snapshot->'domain','authors',(SELECT jsonb_agg(jsonb_build_object('name',x->>'name','order',x->'order') ORDER BY (x->>'order')::integer) FROM jsonb_array_elements(s.authors_snapshot) x),'supervisor',jsonb_build_object('name',s.metadata_snapshot->'supervisor'->>'name'),'publishedAt',v.archived_at,'internal',(2*sq+3*cq)::numeric/20,'rubric','CORE_V1','license',s.metadata_snapshot->'license');
END $$;
REVOKE ALL ON FUNCTION app.publication_projection(uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.publication_projection(uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.institutional_archive(reader uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;result jsonb;
BEGIN
 a:=app.assignment_principal(reader,sid);IF a.role_code<>'university_admin' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='UNIVERSITY_ADMIN_ONLY';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('project',p.id,'version',v.id,'submission',s.id,'title',s.metadata_snapshot->'title','state',v.status,'authors',(SELECT jsonb_agg(jsonb_build_object('name',x->>'name','order',x->'order') ORDER BY (x->>'order')::int) FROM jsonb_array_elements(s.authors_snapshot) x),'supervisor',s.metadata_snapshot->'supervisor'->>'name','retainedAt',v.retained_at,'archivedAt',v.archived_at,'decisionAt',r.decided_at,'reason',CASE WHEN r.decision='rejected' THEN r.comment ELSE NULL END) ORDER BY coalesce(v.archived_at,v.retained_at) DESC),'[]') INTO result FROM app.projects p JOIN app.project_versions v ON v.project_id=p.id AND v.university_id=p.university_id JOIN app.project_submissions s ON s.version_id=v.id AND s.id=CASE WHEN v.status='archived' THEN v.approved_submission_id ELSE (SELECT id FROM app.project_submissions WHERE version_id=v.id ORDER BY round_number DESC LIMIT 1) END JOIN app.review_records r ON r.submission_id=s.id WHERE p.assignment_managed AND p.university_id=a.university_id AND v.status IN ('archived','rejected') AND r.decision=v.status;
 RETURN jsonb_build_object('items',result);
END $$;
REVOKE ALL ON FUNCTION app.institutional_archive(uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.institutional_archive(uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.publication_audit(reader uuid,sid uuid,filters jsonb,reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;lim integer:=coalesce((filters->>'limit')::integer,20);off integer:=coalesce((filters->>'offset')::integer,0);pid uuid:=(filters->>'project')::uuid;result jsonb;ev uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO a FROM app.users WHERE id=reader AND account_status='active' FOR SHARE;PERFORM 1 FROM app.auth_sessions WHERE id=sid AND user_id=reader AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND OR a.id IS NULL OR a.role_code NOT IN ('faculty_supervisor','university_admin','platform_admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 IF a.role_code<>'platform_admin' THEN PERFORM app.assignment_principal(reader,sid);END IF;
 IF lim NOT BETWEEN 1 AND 50 OR off NOT BETWEEN 0 AND 10000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(filters) k WHERE k NOT IN ('project','actor','action','from','to','limit','offset')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FILTER';END IF;
 IF a.role_code='faculty_supervisor' AND (pid IS NULL OR NOT EXISTS(SELECT 1 FROM app.projects WHERE id=pid AND university_id=a.university_id AND supervisor_id=reader)) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF a.role_code='faculty_supervisor' THEN PERFORM 1 FROM app.projects WHERE id=pid AND supervisor_id=reader FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;END IF;
 IF a.role_code='platform_admin' AND (pid IS NOT NULL OR char_length(btrim(coalesce(reason,''))) NOT BETWEEN 3 AND 400 OR reason ~ '[[:cntrl:]]' OR reason ~* '(password|token|secret|cookie)[[:space:]]*[:=]') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='REASONED_GOVERNANCE_ONLY';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (SELECT id,actor_id,actor_role,action,object_type,object_id,project_id,version_id,occurred_at FROM app.audit_logs l WHERE (CASE WHEN a.role_code='platform_admin' THEN l.project_id IS NULL AND (l.actor_role='platform_admin' OR l.actor_kind='system') WHEN a.role_code='university_admin' THEN l.university_id=a.university_id ELSE l.project_id=pid END) AND (pid IS NULL OR l.project_id=pid) AND (filters->>'actor' IS NULL OR l.actor_id=(filters->>'actor')::uuid) AND (filters->>'action' IS NULL OR l.action=filters->>'action') AND (filters->>'from' IS NULL OR l.occurred_at>=(filters->>'from')::timestamptz) AND (filters->>'to' IS NULL OR l.occurred_at<=(filters->>'to')::timestamptz) ORDER BY occurred_at DESC,id DESC LIMIT lim OFFSET off) q;
 IF a.role_code='platform_admin' THEN INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,reason,correlation_id,event_key,after_state) VALUES(ev,reader,a.role_code,NULL,'audit.platform.read','audit_query',reader,btrim(reason),ev,ev,jsonb_build_object('scope',jsonb_build_object('limit',lim,'offset',off,'count',jsonb_array_length(result))::text));END IF;
 RETURN jsonb_build_object('items',result,'offset',off,'limit',lim);
END $$;
REVOKE ALL ON FUNCTION app.publication_audit(uuid,uuid,jsonb,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.publication_audit(uuid,uuid,jsonb,text) TO capstone_runtime;
