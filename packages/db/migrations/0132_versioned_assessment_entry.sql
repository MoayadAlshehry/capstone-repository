-- IMPR_2 explicit owner input-contract amendment. Rubric math and all authority remain unchanged.
-- Old finalized fields are never updated. Added metadata identifies their historical entry contract.
ALTER TABLE app.internal_assessments ADD COLUMN entry_contract text NOT NULL DEFAULT 'REFERENCED_ENTRY_V1' CHECK(entry_contract IN('REFERENCED_ENTRY_V1','SCORES_ONLY_V3'));
ALTER TABLE app.external_assessments ADD COLUMN entry_contract text NOT NULL DEFAULT 'REFERENCED_ENTRY_V1' CHECK(entry_contract IN('REFERENCED_ENTRY_V1','SCORES_ONLY_V3'));
ALTER TABLE app.committee_member_assessments ADD COLUMN entry_contract text NOT NULL DEFAULT 'REFERENCED_ENTRY_V1' CHECK(entry_contract IN('REFERENCED_ENTRY_V1','SCORES_ONLY_V3'));
ALTER TABLE app.internal_assessments ALTER COLUMN entry_contract SET DEFAULT 'SCORES_ONLY_V3';
ALTER TABLE app.external_assessments ALTER COLUMN entry_contract SET DEFAULT 'SCORES_ONLY_V3';
ALTER TABLE app.committee_member_assessments ALTER COLUMN entry_contract SET DEFAULT 'SCORES_ONLY_V3';
ALTER TABLE app.external_assessments DROP CONSTRAINT external_assessments_calibration_ack_check;
ALTER TABLE app.external_assessments ADD CONSTRAINT external_assessments_calibration_ack_check CHECK(entry_contract='SCORES_ONLY_V3' OR calibration_ack);
CREATE FUNCTION app.assessment_entry_contract() RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $$ SELECT 'SCORES_ONLY_V3'::text $$;
REVOKE ALL ON FUNCTION app.assessment_entry_contract() FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.assessment_entry_contract() TO capstone_runtime;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.academic_draft_save_r06(who uuid, sid uuid, sub uuid, expected integer, assignment_expected integer, draft_expected integer, payload jsonb, command uuid, digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE p app.projects;s app.project_submissions;row app.academic_assessment_drafts;r app.command_receipts;layer_value text:=payload->>'layer';c jsonb;l jsonb;seen text[]:='{}';ev uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();result jsonb;BEGIN
 IF payload ? 'inputContract' AND payload->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNSUPPORTED_ENTRY_CONTRACT';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));p:=app.evaluation_actor(who,sid,sub,false);
 IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NEW_FINAL_REQUIRED';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'academic.draft.'||layer_value OR r.payload_digest<>digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN (r.result->>'scope')::jsonb;END IF;
 PERFORM app.evaluation_actor(who,sid,sub,true,expected,assignment_expected);
 IF layer_value NOT IN ('supervisor','committee') OR layer_value IS NULL OR draft_expected IS NULL OR draft_expected<0 OR EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer=layer_value) OR layer_value='committee' AND NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ASSESSMENT_LOCKED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('layer','criteria','overall','calibration','members','assessedOn','attestation','inputContract')) OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(payload->>'overall'))>2000 OR jsonb_typeof(payload->'calibration') IS DISTINCT FROM 'boolean' OR jsonb_typeof(payload->'attestation') IS DISTINCT FROM 'boolean' OR jsonb_typeof(payload->'members') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DRAFT';END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(payload->'criteria') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('code','level','comment','locators')) OR coalesce(c->>'code','') !~ '^C[1-7]$' OR c->>'code'=ANY(seen) OR (c->'level' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(c->'level') IS DISTINCT FROM 'number' OR (c->>'level')::numeric NOT BETWEEN 0 AND 4 OR (c->>'level')::numeric<>trunc((c->>'level')::numeric))) OR jsonb_typeof(c->'comment') IS DISTINCT FROM 'string' OR char_length(c->>'comment')>1000 OR jsonb_typeof(c->'locators') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DRAFT_CRITERION';END IF;
  seen:=array_append(seen,c->>'code');
  FOR l IN SELECT value FROM jsonb_array_elements(c->'locators') LOOP
   IF jsonb_typeof(l) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(l) k WHERE k NOT IN ('file','kind','reference')) OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(l->>'reference') NOT BETWEEN 1 AND 200 OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub AND file_id=(l->>'file')::uuid) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
   PERFORM app.submission_native_read(who,sid,p.id,p.current_version_id,sub,(l->>'file')::uuid);
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'members') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR char_length(x#>>'{}')>131072) OR (payload->'assessedOn' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(payload->'assessedOn') IS DISTINCT FROM 'string' OR coalesce(payload->>'assessedOn','') !~ '^\d{4}-\d{2}-\d{2}$')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DRAFT_PROVENANCE';END IF;
 SELECT * INTO row FROM app.academic_assessment_drafts WHERE submission_id=sub AND layer=layer_value AND actor_id=who FOR UPDATE;
 IF coalesce(row.revision,0)<>draft_expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='DRAFT_CONFLICT';END IF;
 SELECT * INTO s FROM app.project_submissions WHERE id=sub;
 INSERT INTO app.academic_assessment_drafts(university_id,project_id,version_id,submission_id,layer,actor_id,payload,revision,saved_at) VALUES(p.university_id,p.id,s.version_id,sub,layer_value,who,payload,draft_expected+1,t) ON CONFLICT(submission_id,layer,actor_id) DO UPDATE SET payload=EXCLUDED.payload,revision=EXCLUDED.revision,saved_at=EXCLUDED.saved_at;
 result:=jsonb_build_object('submission',sub,'layer',layer_value,'revision',draft_expected+1,'savedAt',t);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,after_state) VALUES(ev,who,'faculty_supervisor',p.university_id,'academic.draft.'||layer_value,'project_submission',sub,p.id,s.version_id,command,ev,jsonb_build_object('scope',result::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(ev,who,p.university_id,p.id,'evaluation.draft.saved',jsonb_build_object('route','/submissions/'||sub::text,'message_key','evaluation.draft.saved'));
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,command,'academic.draft.'||layer_value,digest,ev,jsonb_build_object('scope',result::text));RETURN result;
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.academic_evaluation_prepare_r06(reader uuid, sid uuid, sub uuid, expected integer, assignment_expected integer, payload jsonb, command uuid, payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE p app.projects;r app.command_receipts;layer_value text:=payload->>'layer';c jsonb;l jsonb;n text;seen text[]:='{}';normalized text[]:='{}';lv numeric;ref text;files jsonb;record app.internal_assessments;
BEGIN
 IF payload ? 'inputContract' AND payload->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNSUPPORTED_ENTRY_CONTRACT';END IF;
 p:=app.evaluation_actor(reader,sid,sub,false);
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'evaluation.'||layer_value OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result->>'scope');END IF;
 p:=app.evaluation_actor(reader,sid,sub,true,expected,assignment_expected);
 IF layer_value NOT IN ('supervisor','committee') OR layer_value IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('layer','criteria','overall','calibration','members','assessedOn','attestation','inputContract')) OR jsonb_typeof(payload->'calibration') IS DISTINCT FROM 'boolean' OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(payload->>'overall')) NOT BETWEEN 0 AND 2000 OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ASSESSMENT';END IF;
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
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.evaluation_prepare_legacy(reader uuid, sid uuid, sub uuid, expected integer, assignment_expected integer, payload jsonb, command uuid, payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE p app.projects;r app.command_receipts;layer_value text:=payload->>'layer';c jsonb;l jsonb;n text;seen text[]:='{}';normalized text[]:='{}';lv numeric;ref text;files jsonb;record app.internal_assessments;
BEGIN
 IF payload ? 'inputContract' AND payload->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNSUPPORTED_ENTRY_CONTRACT';END IF;
 p:=app.evaluation_actor(reader,sid,sub,false);
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=reader AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'evaluation.'||layer_value OR r.payload_digest IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',r.result->>'scope');END IF;
 p:=app.evaluation_actor(reader,sid,sub,true,expected,assignment_expected);
 IF layer_value NOT IN ('supervisor','committee') OR layer_value IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('layer','criteria','overall','calibration','members','assessedOn','attestation','inputContract')) OR jsonb_typeof(payload->'calibration') IS DISTINCT FROM 'boolean' OR (payload->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' AND payload->'calibration' IS DISTINCT FROM 'true'::jsonb) OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(payload->>'overall')) NOT BETWEEN (CASE WHEN payload->>'inputContract'='SCORES_ONLY_V3' THEN 0 ELSE 50 END) AND 2000 OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ASSESSMENT';END IF;
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
  IF jsonb_typeof(c)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('code','level','comment','locators')) OR coalesce(c->>'code','') !~ '^C[1-7]$' OR c->>'code'=ANY(seen) OR jsonb_typeof(c->'level') IS DISTINCT FROM 'number' OR jsonb_typeof(c->'comment') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'locators') IS DISTINCT FROM 'array' OR (payload->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' AND jsonb_array_length(c->'locators')<1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CRITERION';END IF;
  seen:=array_append(seen,c->>'code');lv:=(c->>'level')::numeric;
  IF lv<0 OR lv>4 OR lv<>trunc(lv) OR char_length(app.evaluation_trim(c->>'comment'))>1000 OR (payload->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' AND lv IN (0,4) AND char_length(app.evaluation_trim(c->>'comment'))<20) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LEVEL_COMMENT';END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(c->'locators') LOOP
   ref:=app.evaluation_trim(l->>'reference');
   IF jsonb_typeof(l)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(l) k WHERE k NOT IN ('file','kind','reference')) OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(ref) NOT BETWEEN 1 AND 200 OR ((l->>'kind') IN ('page','lines') AND ref !~ '^[1-9]\d*(-[1-9]\d*)?$') OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub AND file_id=(l->>'file')::uuid) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
   PERFORM app.submission_native_read(reader,sid,p.id,p.current_version_id,sub,(l->>'file')::uuid);
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM app.rubric_versions WHERE code='CORE_V1' AND kind='internal' AND schema_version=1 AND config_hash=encode(sha256(convert_to(config::text,'UTF8')),'hex')) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='RUBRIC_INTEGRITY';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256) ORDER BY o.id) INTO files FROM app.submission_files f JOIN app.storage_objects o ON o.id=f.storage_object_id AND o.project_id=f.project_id AND o.university_id=f.university_id WHERE f.submission_id=sub;
 RETURN jsonb_build_object('files',files);
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.committee_validate(sub uuid, payload jsonb, final_value boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE cr jsonb;loc jsonb;seen text[]:='{}';q integer:=0;lv numeric;modern boolean:=payload->>'inputContract'='SCORES_ONLY_V3';BEGIN
 IF payload ? 'inputContract' AND NOT coalesce(modern,false) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNSUPPORTED_ENTRY_CONTRACT';END IF;
 IF jsonb_typeof(payload)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('criteria','overall','calibration','inputContract')) OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR length(payload->>'overall')>2000 OR final_value AND NOT coalesce(modern,false) AND (length(btrim(payload->>'overall'))<50 OR payload->'calibration' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='COMPLETE_ASSESSMENT_REQUIRED';END IF;
 FOR cr IN SELECT value FROM jsonb_array_elements(payload->'criteria') LOOP
  IF jsonb_typeof(cr)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(cr) k WHERE k NOT IN ('code','level','comment','locators')) OR coalesce(cr->>'code','') !~ '^C[1-7]$' OR cr->>'code'=ANY(seen) OR jsonb_typeof(cr->'comment') IS DISTINCT FROM 'string' OR length(cr->>'comment')>1000 OR jsonb_typeof(cr->'locators') IS DISTINCT FROM 'array' OR jsonb_array_length(cr->'locators')>20 OR final_value AND NOT coalesce(modern,false) AND jsonb_array_length(cr->'locators')=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CRITERION';END IF;
  seen:=array_append(seen,cr->>'code');
  IF cr->'level' IS DISTINCT FROM 'null'::jsonb THEN
   IF jsonb_typeof(cr->'level') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INTEGER_LEVEL_REQUIRED';END IF;
   lv:=(cr->>'level')::numeric;
   IF lv<0 OR lv>4 OR lv<>trunc(lv) OR final_value AND NOT coalesce(modern,false) AND lv IN (0,4) AND length(btrim(cr->>'comment'))<20 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='LEVEL_REASON_REQUIRED';END IF;
   q:=q+(ARRAY[10,20,20,20,15,10,5])[(substring(cr->>'code' FROM 2))::integer]*lv::integer;
  ELSIF final_value THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SEVEN_SCORES_REQUIRED';END IF;
  FOR loc IN SELECT value FROM jsonb_array_elements(cr->'locators') LOOP
   IF jsonb_typeof(loc)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(loc) k WHERE k NOT IN ('file','kind','reference')) OR coalesce(loc->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(loc->'reference') IS DISTINCT FROM 'string' OR length(btrim(loc->>'reference')) NOT BETWEEN 1 AND 200 OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub AND file_id=(loc->>'file')::uuid) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='EXACT_EVIDENCE_REQUIRED';END IF;
  END LOOP;
 END LOOP;
 RETURN q;
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.external_form(body jsonb, packet uuid, complete boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE x jsonb;l jsonb;m jsonb;seen text[]:=ARRAY[]::text[];q integer:=0;lev integer;ref text;
BEGIN
 IF body ? 'inputContract' AND body->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNSUPPORTED_ENTRY_CONTRACT';END IF;
 SELECT manifest INTO m FROM app.academic_review_packets WHERE id=packet;
  IF jsonb_typeof(body)<>'object' OR body - ARRAY['criteria','overall','calibration','inputContract']<>'{}'::jsonb OR jsonb_typeof(body->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'criteria')>4 OR jsonb_typeof(body->'overall') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'overall'))>2000 OR jsonb_typeof(body->'calibration') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FORM';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(body->'criteria') LOOP
 IF jsonb_typeof(x)<>'object' OR x - ARRAY['code','level','comment','locators']<>'{}'::jsonb OR coalesce(x->>'code','') NOT IN ('E1','E2','E3','E4') OR x->>'code'=ANY(seen) OR jsonb_typeof(x->'comment') IS DISTINCT FROM 'string' OR char_length(btrim(x->>'comment'))>1000 OR jsonb_typeof(x->'locators') IS DISTINCT FROM 'array' OR jsonb_array_length(x->'locators')>20 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CRITERION';END IF;
 seen:=array_append(seen,x->>'code');lev:=NULL;
 IF x->'level' IS DISTINCT FROM 'null'::jsonb THEN IF jsonb_typeof(x->'level') IS DISTINCT FROM 'number' OR (x->>'level') !~ '^[0-4]$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LEVEL';END IF;lev:=(x->>'level')::integer;END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(x->'locators') LOOP
 ref:=btrim(normalize(l->>'reference',NFC));
 IF jsonb_typeof(l)<>'object' OR l - ARRAY['file','kind','reference']<>'{}'::jsonb OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(ref) NOT BETWEEN 1 AND 200 OR ref ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m->'entries') e WHERE e->>'id'=l->>'file') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
 IF l->>'kind' IN ('page','lines') THEN IF ref !~ '^[1-9]\d*(-[1-9]\d*)?$' OR length(ref)>17 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_RANGE';END IF;IF split_part(ref,'-',1)::numeric>10000000 OR coalesce(nullif(split_part(ref,'-',2),''),split_part(ref,'-',1))::numeric NOT BETWEEN split_part(ref,'-',1)::numeric AND 10000000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_RANGE';END IF;END IF;
 END LOOP;
 IF complete AND (lev IS NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INCOMPLETE_CRITERION';END IF;
 q:=q+coalesce(lev,0)*CASE x->>'code' WHEN 'E1' THEN 30 WHEN 'E2' THEN 25 WHEN 'E3' THEN 25 ELSE 20 END;
 END LOOP;
 IF complete AND (cardinality(seen)<>4) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INCOMPLETE_FORM';END IF;
 RETURN q;
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.external_form_legacy_r07(body jsonb, packet uuid, complete boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE x jsonb;l jsonb;m jsonb;seen text[]:=ARRAY[]::text[];q integer:=0;lev integer;ref text;
BEGIN
 IF body ? 'inputContract' AND body->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNSUPPORTED_ENTRY_CONTRACT';END IF;
 SELECT manifest INTO m FROM app.academic_review_packets WHERE id=packet;
 IF jsonb_typeof(body)<>'object' OR body - ARRAY['criteria','overall','calibration','inputContract']<>'{}'::jsonb OR jsonb_typeof(body->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'criteria')>4 OR jsonb_typeof(body->'overall') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'overall'))>2000 OR jsonb_typeof(body->'calibration') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FORM';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(body->'criteria') LOOP
 IF jsonb_typeof(x)<>'object' OR x - ARRAY['code','level','comment','locators']<>'{}'::jsonb OR coalesce(x->>'code','') NOT IN ('E1','E2','E3','E4') OR x->>'code'=ANY(seen) OR jsonb_typeof(x->'comment') IS DISTINCT FROM 'string' OR char_length(btrim(x->>'comment'))>1000 OR jsonb_typeof(x->'locators') IS DISTINCT FROM 'array' OR jsonb_array_length(x->'locators')>20 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CRITERION';END IF;
 seen:=array_append(seen,x->>'code');lev:=NULL;
 IF x->'level' IS DISTINCT FROM 'null'::jsonb THEN IF jsonb_typeof(x->'level') IS DISTINCT FROM 'number' OR (x->>'level') !~ '^[0-4]$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LEVEL';END IF;lev:=(x->>'level')::integer;END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(x->'locators') LOOP
 ref:=btrim(normalize(l->>'reference',NFC));
 IF jsonb_typeof(l)<>'object' OR l - ARRAY['file','kind','reference']<>'{}'::jsonb OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(ref) NOT BETWEEN 1 AND 200 OR ref ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m->'entries') e WHERE e->>'id'=l->>'file') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
 IF l->>'kind' IN ('page','lines') THEN IF ref !~ '^[1-9]\d*(-[1-9]\d*)?$' OR length(ref)>17 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_RANGE';END IF;IF split_part(ref,'-',1)::numeric>10000000 OR coalesce(nullif(split_part(ref,'-',2),''),split_part(ref,'-',1))::numeric NOT BETWEEN split_part(ref,'-',1)::numeric AND 10000000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_RANGE';END IF;END IF;
 END LOOP;
 IF complete AND (lev IS NULL OR body->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' AND (jsonb_array_length(x->'locators')=0 OR lev IN (0,4) AND char_length(btrim(x->>'comment'))<20)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INCOMPLETE_CRITERION';END IF;
 q:=q+coalesce(lev,0)*CASE x->>'code' WHEN 'E1' THEN 30 WHEN 'E2' THEN 25 WHEN 'E3' THEN 25 ELSE 20 END;
 END LOOP;
 IF complete AND (cardinality(seen)<>4 OR body->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' AND (char_length(btrim(body->>'overall'))<50 OR body->'calibration'<>'true'::jsonb)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INCOMPLETE_FORM';END IF;
 RETURN q;
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.external_command_r07(who uuid, sid uuid, aid uuid, operation text, expected integer, body jsonb, cid uuid, commit_value boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE t app.external_review_assignments;old_state text;receipt app.command_receipts;dig text;ev uuid;result jsonb;d app.external_review_drafts;prepared jsonb;now_value timestamptz(3):=app.governance_now();q integer;assessment uuid:=gen_random_uuid();x jsonb;l jsonb;ord integer;f jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text,29));
 t:=app.external_live(who,sid,aid,NULL);old_state:=t.status;
 IF cid IS NULL OR expected IS NULL OR expected<0 OR operation NOT IN ('accept','decline','withdraw','save','finalize') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_COMMAND';END IF;
 dig:=app.packet_hash(jsonb_build_array(aid,operation,expected,body));SELECT * INTO receipt FROM app.command_receipts WHERE actor_id=who AND command_id=cid;
 IF FOUND THEN IF receipt.action<>'external-review.'||operation OR receipt.payload_digest<>dig THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',(receipt.result->>'scope')::jsonb);END IF;
 IF operation IN ('decline','withdraw') THEN
 IF operation='decline' AND t.status<>'offered' OR operation IN ('withdraw') AND t.status<>'accepted' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='TASK_CLOSED';END IF;
 IF jsonb_typeof(body)<>'object' OR body - ARRAY['reason']<>'{}'::jsonb OR char_length(btrim(coalesce(body->>'reason',''))) NOT BETWEEN 3 AND 400 OR body->>'reason' ~ '[[:cntrl:]‪-‮⁦-⁩]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REASON_REQUIRED';END IF;
 t.status:=CASE WHEN operation='decline' THEN 'declined' ELSE 'withdrawn' END;t.closure_code:=operation;t.reason:=btrim(body->>'reason');t.closed_at:=now_value;
 ELSE
 t:=app.external_live(who,sid,aid,CASE WHEN operation='accept' THEN 'offered' ELSE 'accepted' END);prepared:=app.external_packet(t.packet_id);
 IF operation='accept' THEN
 IF (SELECT count(*) FROM app.external_review_assignments WHERE reviewer_id=who AND status IN ('offered','accepted'))>2 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='CAPACITY';END IF;
 IF body - ARRAY['noPersonalFinancialConflict','noCollaboration','noCommitteeParticipation','noPriorScoreExposure','willNotSeekScores']<>'{}'::jsonb OR (SELECT count(*) FROM jsonb_object_keys(body))<>5 OR EXISTS(SELECT 1 FROM jsonb_each(body) WHERE jsonb_typeof(value)<>'boolean') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DECLARATIONS_REQUIRED';END IF;
 t.declarations:=body;f:=app.external_candidate(who,t.packet_id,false);
 IF EXISTS(SELECT 1 FROM jsonb_each(body) WHERE value<>'true'::jsonb) OR f->'committeeNameMatch'='true' THEN
 t.status:='cancelled';t.closure_code:=CASE WHEN body->'noPriorScoreExposure'='false' THEN 'prior-score-exposure' WHEN f->'committeeNameMatch'='true' THEN 'committee-verification-hold' ELSE 'declared-conflict' END;t.closed_at:=now_value;
 ELSE
 t.status:='accepted';t.accepted_at:=now_value;t.due_at:=now_value+interval '14 days';
 END IF;
 ELSIF operation IN ('save','finalize') THEN
 SELECT * INTO d FROM app.external_review_drafts WHERE assignment_id=t.id FOR UPDATE;
 IF coalesce(d.revision,0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_DRAFT';END IF;
 q:=app.external_form(body,t.packet_id,operation='finalize');
 END IF;
 END IF;
 IF NOT commit_value THEN RETURN coalesce(prepared,'{}')||jsonb_build_object('prepared',true);END IF;
 IF operation='save' THEN
 INSERT INTO app.external_review_drafts(assignment_id,revision,body,updated_at) VALUES(t.id,expected+1,body,now_value) ON CONFLICT(assignment_id) DO UPDATE SET revision=expected+1,body=EXCLUDED.body,updated_at=now_value;
 ELSIF operation='finalize' THEN
 INSERT INTO app.external_assessments(id,assignment_id,case_id,submission_id,reviewer_id,rubric_hash,quarter_points,overall_comment,calibration_ack,finalized_at) SELECT assessment,t.id,t.case_id,(prepared->'manifest'->>'submission')::uuid,who,config_hash,q,btrim(body->>'overall'),coalesce((body->>'calibration')::boolean,false),now_value FROM app.rubric_versions WHERE code='EXTERNAL_V1';
 FOR x IN SELECT value FROM jsonb_array_elements(body->'criteria') LOOP
 INSERT INTO app.external_criterion_scores VALUES(assessment,x->>'code',(x->>'level')::integer,btrim(x->>'comment'));ord:=0;
 FOR l IN SELECT value FROM jsonb_array_elements(x->'locators') LOOP ord:=ord+1;INSERT INTO app.external_evidence_locators VALUES(assessment,x->>'code',ord,(l->>'file')::uuid,l->>'kind',btrim(normalize(l->>'reference',NFC)),(prepared->'manifest'->>'submission')::uuid);END LOOP;
 END LOOP;
 t.status:='completed';t.completed_at:=now_value;t.closed_at:=now_value;
 END IF;
 UPDATE app.external_review_assignments SET status=t.status,accepted_at=t.accepted_at,due_at=t.due_at,completed_at=t.completed_at,closed_at=t.closed_at,declarations=t.declarations,closure_code=t.closure_code,reason=t.reason WHERE id=t.id;
 IF t.status<>'offered' THEN PERFORM app.reminder_resolve(t.offer_reminder);END IF;
 IF t.status='accepted' AND old_state='offered' THEN PERFORM app.reminder_register(t.task_reminder,who,'review-task',t.due_at);END IF;
 IF t.status NOT IN ('offered','accepted') THEN PERFORM app.reminder_resolve(t.task_reminder);END IF;
 ev:=app.external_event(t,who,CASE WHEN operation='accept' AND t.status='cancelled' THEN 'cancel' ELSE operation END,cid,old_state,CASE WHEN operation='finalize' THEN assessment END,CASE WHEN operation='finalize' THEN q END);
 result:=jsonb_build_object('assignment',t.id,'status',t.status,'revision',CASE WHEN operation='save' THEN expected+1 ELSE expected END);
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,cid,'external-review.'||operation,dig,ev,jsonb_build_object('scope',result::text,'row_version',expected));RETURN result;
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.correction_form(body jsonb, logical uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE o app.logical_assessments;c jsonb;l jsonb;lev integer;seen text[]:='{}';names text[]:='{}';n text;ref text;q integer:=0;packet uuid;modern boolean;
BEGIN
 SELECT * INTO o FROM app.logical_assessments WHERE id=logical;
 IF o.id IS NULL THEN RAISE EXCEPTION 'ASSESSMENT_NOT_FOUND';END IF; modern:=app.original_correction_policy(logical)='ASSESSMENT_UX_V2' OR coalesce(body->>'inputContract'='SCORES_ONLY_V3',false);
 IF body ? 'inputContract' AND body->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNSUPPORTED_ENTRY_CONTRACT';END IF;
 IF modern AND body->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' AND o.layer<>'external' AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'criteria') criterion WHERE jsonb_typeof(criterion->'locators')='array' AND jsonb_array_length(criterion->'locators')>0) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MANUAL_LOCATORS_RETIRED';END IF;
 IF translate(body->>'overall',E'\n\t\r','') ~ '[[:cntrl:]‪-‮⁦-⁩]' OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'criteria') x WHERE translate(x->>'comment',E'\n\t\r','') ~ '[[:cntrl:]‪-‮⁦-⁩]') THEN RAISE EXCEPTION 'INVALID_TEXT';END IF;
 IF o.layer='external' THEN SELECT packet_id INTO packet FROM app.external_review_assignments WHERE id=o.assignment_id;IF modern THEN RETURN app.external_form(body,packet,true);ELSE RETURN app.external_form_legacy_r07(body,packet,true);END IF;END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR body-ARRAY['layer','criteria','overall','calibration','members','assessedOn','attestation','inputContract']<>'{}'::jsonb OR body->>'layer' IS DISTINCT FROM o.layer OR (jsonb_typeof(body->'calibration') IS DISTINCT FROM 'boolean' OR NOT modern AND body->'calibration' IS DISTINCT FROM 'true'::jsonb) OR jsonb_typeof(body->'overall') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(body->>'overall')) NOT BETWEEN (CASE WHEN modern THEN 0 ELSE 50 END) AND 2000 OR jsonb_typeof(body->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'criteria')<>7 THEN RAISE EXCEPTION 'INVALID_ASSESSMENT';END IF;
 IF o.layer='committee' THEN
 IF jsonb_typeof(body->'members') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'members')<2 OR body->'attestation' IS DISTINCT FROM 'true'::jsonb OR coalesce(body->>'assessedOn','') !~ '^\d{4}-\d{2}-\d{2}$' OR (body->>'assessedOn')::date>(clock_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'INVALID_COMMITTEE';END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(body->'members') LOOP n:=lower(regexp_replace(app.evaluation_trim(normalize(c#>>'{}',NFKC)),'[[:space:]]+',' ','g'));IF jsonb_typeof(c)<>'string' OR n='' OR n=ANY(names) THEN RAISE EXCEPTION 'INVALID_MEMBERS';END IF;names:=array_append(names,n);END LOOP;
 ELSE IF body->'members' IS DISTINCT FROM '[]'::jsonb OR body->'assessedOn' IS DISTINCT FROM 'null'::jsonb OR body->'attestation' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'INVALID_PROVENANCE';END IF;END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(body->'criteria') LOOP
 IF jsonb_typeof(c)<>'object' OR c-ARRAY['code','level','comment','locators']<>'{}'::jsonb OR coalesce(c->>'code','') !~ '^C[1-7]$' OR c->>'code'=ANY(seen) OR jsonb_typeof(c->'level') IS DISTINCT FROM 'number' OR (c->>'level') !~ '^[0-4]$' OR jsonb_typeof(c->'comment') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'locators') IS DISTINCT FROM 'array' OR (NOT modern AND jsonb_array_length(c->'locators')<1) THEN RAISE EXCEPTION 'INVALID_CRITERION';END IF;
 seen:=array_append(seen,c->>'code');lev:=(c->>'level')::integer;
 IF char_length(app.evaluation_trim(c->>'comment'))>1000 OR NOT modern AND lev IN (0,4) AND char_length(app.evaluation_trim(c->>'comment'))<20 THEN RAISE EXCEPTION 'INVALID_COMMENT';END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(c->'locators') LOOP ref:=app.evaluation_trim(l->>'reference');
 IF jsonb_typeof(l)<>'object' OR l-ARRAY['file','kind','reference']<>'{}'::jsonb OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(ref) NOT BETWEEN 1 AND 200 OR ref ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=o.submission_id AND file_id=(l->>'file')::uuid) THEN RAISE EXCEPTION 'INVALID_LOCATOR';END IF;
 IF l->>'kind' IN ('page','lines') THEN IF ref !~ '^[1-9]\d*(-[1-9]\d*)?$' OR length(ref)>17 THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;IF split_part(ref,'-',1)::numeric>10000000 OR coalesce(nullif(split_part(ref,'-',2),''),split_part(ref,'-',1))::numeric NOT BETWEEN split_part(ref,'-',1)::numeric AND 10000000 THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;END IF;
 END LOOP;
 q:=q+(ARRAY[10,20,20,20,15,10,5])[(substring(c->>'code' FROM 2))::integer]*lev;
 END LOOP;RETURN q;
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.academic_legacy_assessment_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE sub uuid;BEGIN
 IF TG_TABLE_NAME='internal_assessments' THEN
  IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=NEW.submission_id) AND NEW.entry_contract<>'SCORES_ONLY_V3' AND (char_length(app.evaluation_trim(NEW.overall_comment))<50 OR NOT NEW.calibration_ack) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_ASSESSMENT_CONSTRAINT';END IF;
 ELSE
  SELECT submission_id INTO sub FROM app.internal_assessments WHERE id=NEW.assessment_id;
  IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) AND (SELECT entry_contract FROM app.internal_assessments WHERE id=NEW.assessment_id)<>'SCORES_ONLY_V3' AND NEW.level IN (0,4) AND char_length(app.evaluation_trim(NEW.comment))<20 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_CRITERION_CONSTRAINT';END IF;
 END IF;RETURN NEW;
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.external_notes_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE policy text;BEGIN
 IF TG_TABLE_NAME='external_assessments' THEN
 IF NEW.interaction_policy='REFERENCED_EXTERNAL_V1' AND NEW.entry_contract<>'SCORES_ONLY_V3' AND char_length(btrim(NEW.overall_comment))<50 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_COMMENT_REQUIRED';END IF;
 ELSE SELECT interaction_policy INTO policy FROM app.external_assessments WHERE id=NEW.assessment_id;
 IF policy='REFERENCED_EXTERNAL_V1' AND (SELECT entry_contract FROM app.external_assessments WHERE id=NEW.assessment_id)<>'SCORES_ONLY_V3' AND NEW.level IN (0,4) AND char_length(btrim(NEW.comment))<20 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='LEGACY_COMMENT_REQUIRED';END IF;END IF;RETURN NEW;
END $function$;
