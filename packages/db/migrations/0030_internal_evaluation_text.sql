ALTER TABLE app.internal_evidence_locators DROP CONSTRAINT internal_evidence_locators_ordinal_check;
ALTER TABLE app.internal_evidence_locators ADD CONSTRAINT internal_evidence_locators_ordinal_check CHECK(ordinal>=1);
--> statement-breakpoint
-- Forward validation refinement; never rewrite applied 0029.
CREATE FUNCTION app.evaluation_trim(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,app AS $$ SELECT regexp_replace(value,'^[	-
    -     　﻿]+|[	-
    -     　﻿]+$','','g') $$;
REVOKE ALL ON FUNCTION app.evaluation_trim(text) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.evaluation_prepare(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,payload jsonb,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;r app.command_receipts;layer_value text:=payload->>'layer';c jsonb;l jsonb;n text;seen text[]:='{}';normalized text[]:='{}';lv numeric;ref text;files jsonb;record app.internal_assessments;
BEGIN
 p:=app.evaluation_actor(reader,sid,sub,false);
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'evaluation.'||layer_value OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result->>'scope');END IF;
 p:=app.evaluation_actor(reader,sid,sub,true,expected,assignment_expected);
 IF layer_value NOT IN ('supervisor','committee') OR layer_value IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('layer','criteria','overall','calibration','members','assessedOn','attestation')) OR payload->'calibration' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(payload->>'overall')) NOT BETWEEN 50 AND 2000 OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ASSESSMENT';END IF;
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
  IF jsonb_typeof(c)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('code','level','comment','locators')) OR coalesce(c->>'code','') !~ '^C[1-7]$' OR c->>'code'=ANY(seen) OR jsonb_typeof(c->'level') IS DISTINCT FROM 'number' OR jsonb_typeof(c->'comment') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'locators') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'locators')<1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CRITERION';END IF;
  seen:=array_append(seen,c->>'code');lv:=(c->>'level')::numeric;
  IF lv<0 OR lv>4 OR lv<>trunc(lv) OR char_length(app.evaluation_trim(c->>'comment'))>1000 OR (lv IN (0,4) AND char_length(app.evaluation_trim(c->>'comment'))<20) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LEVEL_COMMENT';END IF;
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.evaluation_commit(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,payload jsonb,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prepared jsonb;p app.projects;s app.project_submissions;cid uuid;aid uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();quarter integer:=0;c jsonb;l jsonb;ord integer;r app.rubric_versions;result jsonb;sup app.internal_assessments;
BEGIN
 prepared:=app.evaluation_prepare(reader,sid,sub,expected,assignment_expected,payload,command,payload_hash);IF prepared ? 'completed' THEN RETURN (prepared->>'completed')::jsonb;END IF;
 SELECT * INTO s FROM app.project_submissions WHERE id=sub;SELECT * INTO p FROM app.projects WHERE id=s.project_id;SELECT * INTO r FROM app.rubric_versions WHERE code='CORE_V1';
 INSERT INTO app.evaluation_cases(university_id,project_id,version_id,submission_id,rubric_code) VALUES(p.university_id,p.id,s.version_id,sub,'CORE_V1') ON CONFLICT(submission_id) DO NOTHING;
 SELECT id INTO cid FROM app.evaluation_cases WHERE submission_id=sub;
 FOR c IN SELECT value FROM jsonb_array_elements(payload->'criteria') LOOP quarter:=quarter+(ARRAY[10,20,20,20,15,10,5])[(substring(c->>'code' FROM 2))::integer]*(c->>'level')::integer;END LOOP;
 INSERT INTO app.internal_assessments(id,university_id,project_id,version_id,submission_id,case_id,layer,rubric_code,rubric_hash,recorded_by,recorded_at,finalized_at,quarter_points,overall_comment,calibration_ack,member_names,assessed_on,attestation) VALUES(aid,p.university_id,p.id,s.version_id,sub,cid,payload->>'layer',r.code,r.config_hash,reader,t,t,quarter,app.evaluation_trim(payload->>'overall'),true,coalesce((SELECT jsonb_agg(app.evaluation_trim(value#>>'{}') ORDER BY ordinal) FROM jsonb_array_elements(payload->'members') WITH ORDINALITY m(value,ordinal)),'[]'),(payload->>'assessedOn')::date,(payload->>'attestation')::boolean);
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
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(reader,command,'evaluation.'||(payload->>'layer'),payload_hash,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;
--> statement-breakpoint
