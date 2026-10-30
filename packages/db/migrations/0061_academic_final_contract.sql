-- Owner R06: versioned FINAL tasks; legacy snapshots/rubric/assessment rules remain.
CREATE TABLE app.academic_finals(
 submission_id uuid PRIMARY KEY,university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,
 purpose text NOT NULL DEFAULT 'FINAL' CHECK(purpose='FINAL'),contract text NOT NULL DEFAULT 'ACADEMIC_FINAL_V1' CHECK(contract='ACADEMIC_FINAL_V1'),
 number integer NOT NULL CHECK(number>0),manifest_digest text NOT NULL CHECK(manifest_digest~'^[a-f0-9]{64}$'),
 UNIQUE(version_id,number),UNIQUE(university_id,project_id,version_id,submission_id),
 FOREIGN KEY(university_id,project_id,version_id,submission_id,purpose) REFERENCES app.project_submissions(university_id,project_id,version_id,id,purpose)
);
CREATE TABLE app.academic_assessment_drafts(
 university_id uuid NOT NULL,project_id uuid NOT NULL,version_id uuid NOT NULL,submission_id uuid NOT NULL,
 layer text NOT NULL CHECK(layer IN ('supervisor','committee')),actor_id uuid NOT NULL,payload jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(submission_id,layer,actor_id),
 FOREIGN KEY(university_id,project_id,version_id,submission_id) REFERENCES app.academic_finals(university_id,project_id,version_id,submission_id),
 FOREIGN KEY(university_id,actor_id) REFERENCES app.users(university_id,id)
);
CREATE TABLE app.academic_assessment_provenance(
 assessment_id uuid PRIMARY KEY REFERENCES app.internal_assessments(id),actor_name text NOT NULL,
 contract text NOT NULL CHECK(contract='ACADEMIC_FINAL_V1'),recorded_at timestamptz NOT NULL
);
CREATE TABLE app.academic_decision_scope(
 submission_id uuid PRIMARY KEY REFERENCES app.academic_finals(submission_id),actor_name text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('publish','revision','retain')),reason text NOT NULL DEFAULT '',public_manifest_digest text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_academic_final BEFORE UPDATE OR DELETE ON app.academic_finals FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_academic_provenance BEFORE UPDATE OR DELETE ON app.academic_assessment_provenance FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_academic_decision BEFORE UPDATE OR DELETE ON app.academic_decision_scope FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.academic_finals,app.academic_assessment_drafts,app.academic_assessment_provenance,app.academic_decision_scope FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.academic_final_prepare(who uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;prep jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));
 p:=app.edition_lead(who,sid,pid,vid);
 prep:=app.submission_prepare(who,sid,pid,vid,expected,assignment_expected,command,digest);
 IF prep ? 'completed' THEN
  IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=((prep->>'completed')::jsonb->>'id')::uuid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='CONTRACT_CONFLICT';END IF;
  RETURN prep;
 END IF;
 IF manifest IS NULL OR manifest<>app.semester_manifest(pid,vid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_MANIFEST';END IF;
 RETURN prep;
END $$;
CREATE FUNCTION app.academic_final_commit(who uuid,sid uuid,pid uuid,vid uuid,expected integer,assignment_expected integer,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prep jsonb;result jsonb;p app.projects;number integer;
BEGIN
 prep:=app.academic_final_prepare(who,sid,pid,vid,expected,assignment_expected,manifest,command,digest);
 IF prep ? 'completed' THEN RETURN (prep->>'completed')::jsonb;END IF;
 IF prep ? 'issues' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='FINAL_NOT_READY';END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid;
 SELECT count(*)+1 INTO number FROM app.project_submissions WHERE version_id=vid AND purpose='FINAL';
 result:=app.submission_commit(who,sid,pid,vid,expected,assignment_expected,command,digest);
 INSERT INTO app.academic_finals(submission_id,university_id,project_id,version_id,number,manifest_digest) VALUES((result->>'id')::uuid,p.university_id,pid,vid,number,manifest);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.academic_final_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text),app.academic_final_commit(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_final_prepare(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text),app.academic_final_commit(uuid,uuid,uuid,uuid,integer,integer,text,uuid,text) TO capstone_runtime;
--> statement-breakpoint
-- Retain strict legacy insertion constraints through version-aware triggers.
ALTER TABLE app.internal_assessments DROP CONSTRAINT internal_assessments_overall_comment_check;
ALTER TABLE app.internal_assessments ADD CONSTRAINT internal_assessments_overall_comment_check CHECK(char_length(app.evaluation_trim(overall_comment))<=2000);
ALTER TABLE app.internal_assessments DROP CONSTRAINT internal_assessments_calibration_ack_check;
ALTER TABLE app.internal_criterion_scores DROP CONSTRAINT internal_criterion_scores_check;
ALTER TABLE app.internal_criterion_scores ADD CONSTRAINT internal_criterion_scores_comment_check CHECK(char_length(app.evaluation_trim(comment))<=1000);
CREATE FUNCTION app.academic_legacy_assessment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE sub uuid;BEGIN
 IF TG_TABLE_NAME='internal_assessments' THEN
  IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=NEW.submission_id) AND (char_length(app.evaluation_trim(NEW.overall_comment))<50 OR NOT NEW.calibration_ack) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_ASSESSMENT_CONSTRAINT';END IF;
 ELSE
  SELECT submission_id INTO sub FROM app.internal_assessments WHERE id=NEW.assessment_id;
  IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) AND NEW.level IN (0,4) AND char_length(app.evaluation_trim(NEW.comment))<20 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_CRITERION_CONSTRAINT';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER academic_legacy_assessment_guard BEFORE INSERT ON app.internal_assessments FOR EACH ROW EXECUTE FUNCTION app.academic_legacy_assessment_guard();
CREATE TRIGGER academic_legacy_criterion_guard BEFORE INSERT ON app.internal_criterion_scores FOR EACH ROW EXECUTE FUNCTION app.academic_legacy_assessment_guard();
REVOKE ALL ON FUNCTION app.academic_legacy_assessment_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.academic_evaluation_prepare(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,payload jsonb,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;r app.command_receipts;layer_value text:=payload->>'layer';c jsonb;l jsonb;n text;seen text[]:='{}';normalized text[]:='{}';lv numeric;ref text;files jsonb;record app.internal_assessments;
BEGIN
 p:=app.evaluation_actor(reader,sid,sub,false);
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'evaluation.'||layer_value OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result->>'scope');END IF;
 p:=app.evaluation_actor(reader,sid,sub,true,expected,assignment_expected);
 IF layer_value NOT IN ('supervisor','committee') OR layer_value IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('layer','criteria','overall','calibration','members','assessedOn','attestation')) OR jsonb_typeof(payload->'calibration') IS DISTINCT FROM 'boolean' OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(payload->>'overall')) NOT BETWEEN 0 AND 2000 OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ASSESSMENT';END IF;
 SELECT * INTO record FROM app.internal_assessments WHERE submission_id=sub AND layer=layer_value;
 IF record.id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ALREADY_FINALIZED';END IF;
 IF layer_value='committee' AND NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='SUPERVISOR_REQUIRED';END IF;
 IF layer_value='committee' THEN
  IF jsonb_typeof(payload->'members') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'members')<2 OR payload->'attestation' IS DISTINCT FROM 'true'::jsonb OR coalesce(payload->>'assessedOn','') !~ '^\d{4}-\d{2}-\d{2}$' OR (payload->>'assessedOn')::date>(clock_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_COMMITTEE';END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(payload->'members') LOOP
   IF jsonb_typeof(c)<>'string' OR char_length(app.evaluation_trim(c#>>'{}'))<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_MEMBERS';END IF;
   n:=lower(regexp_replace(app.evaluation_trim(normalize(c#>>'{}',NFKC)),'[[:space:]]+',' ','g'));
   IF n=ANY(normalized) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DUPLICATE_MEMBERS';END IF;normalized:=array_append(normalized,n);
  END LOOP;
 ELSE IF payload->'members' IS DISTINCT FROM '[]'::jsonb OR payload->'assessedOn' IS DISTINCT FROM 'null'::jsonb OR payload->'attestation' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_PROVENANCE';END IF;END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(payload->'criteria') LOOP
  IF jsonb_typeof(c)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('code','level','comment','locators')) OR coalesce(c->>'code','') !~ '^C[1-7]$' OR c->>'code'=ANY(seen) OR jsonb_typeof(c->'level') IS DISTINCT FROM 'number' OR jsonb_typeof(c->'comment') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'locators') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CRITERION';END IF;
  seen:=array_append(seen,c->>'code');lv:=(c->>'level')::numeric;
  IF lv<0 OR lv>4 OR lv<>trunc(lv) OR char_length(app.evaluation_trim(c->>'comment'))>1000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LEVEL_COMMENT';END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(c->'locators') LOOP
   ref:=app.evaluation_trim(l->>'reference');
   IF jsonb_typeof(l)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(l) k WHERE k NOT IN ('file','kind','reference')) OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(ref) NOT BETWEEN 1 AND 200 OR ((l->>'kind') IN ('page','lines') AND ref !~ '^[1-9]\d*(-[1-9]\d*)?$') OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub AND file_id=(l->>'file')::uuid) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
   PERFORM app.submission_native_read(reader,sid,p.id,p.current_version_id,sub,(l->>'file')::uuid);
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM app.rubric_versions WHERE code='CORE_V1' AND kind='internal' AND schema_version=1 AND config_hash=encode(sha256(convert_to(config::text,'UTF8')),'hex')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='RUBRIC_INTEGRITY';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256) ORDER BY o.id) INTO files FROM app.submission_files f JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=f.project_id AND o.university_id=f.university_id WHERE f.submission_id=sub;
 RETURN jsonb_build_object('files',files);
END $$;
ALTER FUNCTION app.evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text) RENAME TO evaluation_prepare_legacy;
CREATE FUNCTION app.evaluation_prepare(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,payload jsonb,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) THEN RETURN app.academic_evaluation_prepare(reader,sid,sub,expected,assignment_expected,payload,command,payload_hash);END IF;
 RETURN app.evaluation_prepare_legacy(reader,sid,sub,expected,assignment_expected,payload,command,payload_hash);
END $$;
REVOKE ALL ON FUNCTION app.academic_evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text),app.evaluation_prepare_legacy(uuid,uuid,uuid,integer,integer,jsonb,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text) TO capstone_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.evaluation_commit(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,payload jsonb,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prepared jsonb;p app.projects;s app.project_submissions;cid uuid;aid uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();quarter integer:=0;c jsonb;l jsonb;ord integer;r app.rubric_versions;result jsonb;sup app.internal_assessments;
BEGIN
 prepared:=app.evaluation_prepare(reader,sid,sub,expected,assignment_expected,payload,command,payload_hash);IF prepared ? 'completed' THEN RETURN (prepared->>'completed')::jsonb;END IF;
 SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO p FROM app.projects WHERE id=s.project_id;SELECT * INTO r FROM app.rubric_versions WHERE code='CORE_V1';
 INSERT INTO app.evaluation_cases(university_id,project_id,version_id,submission_id,rubric_code) VALUES(p.university_id,p.id,s.version_id,sub,'CORE_V1') ON CONFLICT(submission_id) DO NOTHING;
 SELECT id INTO cid FROM app.evaluation_cases WHERE submission_id=sub;
 FOR c IN SELECT value FROM jsonb_array_elements(payload->'criteria') LOOP quarter:=quarter+(ARRAY[10,20,20,20,15,10,5])[(substring(c->>'code' FROM 2))::integer]*(c->>'level')::integer;END LOOP;
 INSERT INTO app.internal_assessments(id,university_id,project_id,version_id,submission_id,case_id,layer,rubric_code,rubric_hash,recorded_by,recorded_at,finalized_at,quarter_points,overall_comment,calibration_ack,member_names,assessed_on,attestation) VALUES(aid,p.university_id,p.id,s.version_id,sub,cid,payload->>'layer',r.code,r.config_hash,reader,t,t,quarter,app.evaluation_trim(payload->>'overall'),(payload->>'calibration')::boolean,coalesce((SELECT jsonb_agg(app.evaluation_trim(value#>>'{}') ORDER BY ordinal) FROM jsonb_array_elements(payload->'members') WITH ORDINALITY m(value,ordinal)),'[]'),(payload->>'assessedOn')::date,(payload->>'attestation')::boolean);
 FOR c IN SELECT value FROM jsonb_array_elements(payload->'criteria') LOOP
  INSERT INTO app.internal_criterion_scores VALUES(aid,c->>'code',(c->>'level')::integer,app.evaluation_trim(c->>'comment'));ord:=0;
  FOR l IN SELECT value FROM jsonb_array_elements(c->'locators') LOOP ord:=ord+1;INSERT INTO app.internal_evidence_locators VALUES(p.university_id,p.id,s.version_id,sub,aid,c->>'code',ord,(l->>'file')::uuid,l->>'kind',app.evaluation_trim(l->>'reference'));END LOOP;
 END LOOP;
 IF payload->>'layer'='committee' THEN
  SELECT * INTO sup FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor';
  IF abs(sup.quarter_points-quarter)>=60 OR EXISTS(SELECT 1 FROM app.internal_criterion_scores a JOIN app.internal_criterion_scores b ON a.code=b.code WHERE a.assessment_id=sup.id AND b.assessment_id=aid AND abs(a.level-b.level)>=2) THEN INSERT INTO app.internal_evaluation_issues(case_id,supervisor_id,committee_id,kind,created_at) VALUES(cid,sup.id,aid,'internal_disagreement',t);END IF;
 END IF;
 result:=jsonb_build_object('id',aid,'submission',sub,'layer',payload->>'layer','total',quarter::numeric/4,'rubric','CORE_V1');
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,after_state) VALUES(ev,reader,'faculty_supervisor',p.university_id,'evaluation.'||(payload->>'layer'),'internal_assessment',aid,p.id,s.version_id,command,ev,jsonb_build_object('scope',jsonb_build_object('submission',sub,'assessment',aid,'layer',payload->>'layer','rubric',r.code,'rubricHash',r.config_hash,'total',quarter::numeric/4,'utc',t)::text));
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'evaluation.'||(payload->>'layer'),payload_hash,ev,jsonb_build_object('scope',result::text));IF EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) THEN
 INSERT INTO app.academic_assessment_provenance SELECT aid,full_name,'ACADEMIC_FINAL_V1',t FROM app.users WHERE id=reader;
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) SELECT ev,(x->>'id')::uuid,p.university_id,p.id,'evaluation.finalized',jsonb_build_object('route','/submissions/'||sub::text,'message_key','evaluation.finalized') FROM jsonb_array_elements(s.authors_snapshot) x;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 END IF;RETURN result;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.publication_prepare(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;v app.project_versions;r app.command_receipts;state jsonb;files jsonb;rv app.rubric_versions;
BEGIN
 p:=app.evaluation_actor(reader,sid,sub,false);SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO v FROM app.project_versions WHERE id=s.version_id FOR UPDATE;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'submission.publish' OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result->>'scope');END IF;
 IF v.status='archived' AND v.approved_submission_id=sub AND p.published_version_id=v.id THEN RETURN jsonb_build_object('completed',jsonb_build_object('submission',sub,'version',v.id,'project',p.id,'state','archived','archivedAt',v.archived_at)::text);END IF;
 PERFORM app.evaluation_actor(reader,sid,sub,true,expected,assignment_expected);state:=app.publication_state(reader,sid,sub);
 IF jsonb_array_length(state->'issues')>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='PUBLICATION_PREREQUISITES';END IF;
 SELECT * INTO rv FROM app.rubric_versions WHERE code='CORE_V1';
 IF rv.code IS NULL OR rv.kind<>'internal' OR rv.schema_version<>1 OR rv.config_hash<>encode(sha256(convert_to(rv.config::text,'UTF8')),'hex') OR EXISTS(SELECT 1 FROM app.internal_assessments a WHERE a.submission_id=sub AND (a.rubric_code<>'CORE_V1' OR a.rubric_hash<>rv.config_hash OR (NOT a.calibration_ack AND NOT EXISTS(SELECT 1 FROM app.academic_finals af WHERE af.submission_id=sub)) OR (SELECT count(*) FROM app.internal_criterion_scores WHERE assessment_id=a.id)<>7 OR a.quarter_points<>(SELECT sum((ARRAY[10,20,20,20,15,10,5])[(substring(code FROM 2))::int]*level) FROM app.internal_criterion_scores WHERE assessment_id=a.id) OR (NOT EXISTS(SELECT 1 FROM app.academic_finals af WHERE af.submission_id=sub) AND EXISTS(SELECT 1 FROM app.internal_criterion_scores c WHERE c.assessment_id=a.id AND NOT EXISTS(SELECT 1 FROM app.internal_evidence_locators l WHERE l.assessment_id=a.id AND l.code=c.code))))) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='ASSESSMENT_INTEGRITY';END IF;
 IF (p.published_version_id IS NOT NULL AND p.published_version_id<>v.id AND NOT EXISTS(SELECT 1 FROM app.project_versions old WHERE old.id=p.published_version_id AND old.project_id=p.id AND old.university_id=p.university_id AND old.status='archived' AND old.version_number<v.version_number)) OR v.approved_submission_id IS NOT NULL OR v.archived_at IS NOT NULL OR v.retained_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub) OR EXISTS(SELECT 1 FROM app.submission_files m LEFT JOIN app.project_files f ON f.id=m.file_id WHERE m.submission_id=sub AND (f.id IS NULL OR f.processing_status<>'ready')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PUBLICATION_INTEGRITY';END IF;
 PERFORM app.submission_native_read(reader,sid,p.id,v.id,sub,NULL);
 IF (SELECT count(*) FROM app.submission_files WHERE submission_id=sub)<>(SELECT count(*) FROM app.project_files WHERE version_id=v.id AND is_current) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INCOMPLETE_MANIFEST';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',m.size_at_submit,'sha256',m.sha256_at_submit) ORDER BY m.file_id) INTO files FROM app.submission_files m JOIN app.storage_objects o ON o.id=m.storage_object_id WHERE m.submission_id=sub;
 RETURN jsonb_build_object('files',files);
END $$;
--> statement-breakpoint
