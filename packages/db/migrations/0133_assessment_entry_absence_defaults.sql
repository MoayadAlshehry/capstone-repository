-- Absence defaults are part of V3, so clients never need to fabricate retired fields.
-- Unknown properties and explicit null/wrong types are retained for strict validation.
CREATE FUNCTION app.assessment_entry_payload(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,app AS $entry$
DECLARE criteria jsonb;
BEGIN
 IF payload->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' THEN RETURN payload; END IF;
 IF jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CRITERIA_REQUIRED'; END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(item)='object' THEN jsonb_build_object('comment','','locators','[]'::jsonb)||item ELSE item END ORDER BY ordinal),'[]'::jsonb) INTO criteria
 FROM jsonb_array_elements(payload->'criteria') WITH ORDINALITY source(item,ordinal);
 RETURN (CASE WHEN payload->>'layer'='supervisor' THEN jsonb_build_object('members','[]'::jsonb,'assessedOn',NULL,'attestation',false) ELSE '{}'::jsonb END)
 ||jsonb_build_object('overall','','calibration',false)||payload||jsonb_build_object('criteria',criteria);
END $entry$;
REVOKE ALL ON FUNCTION app.assessment_entry_payload(jsonb) FROM PUBLIC,capstone_runtime,capstone_jobs;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.academic_draft_save_r06(who uuid, sid uuid, sub uuid, expected integer, assignment_expected integer, draft_expected integer, payload jsonb, command uuid, digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE p app.projects;s app.project_submissions;row app.academic_assessment_drafts;r app.command_receipts;layer_value text:=payload->>'layer';c jsonb;l jsonb;seen text[]:='{}';ev uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();result jsonb;BEGIN
 payload:=app.assessment_entry_payload(payload);

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
 payload:=app.assessment_entry_payload(payload);

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
CREATE OR REPLACE FUNCTION app.committee_guest_write(iid uuid, session_digest text, expected integer, payload jsonb, command uuid, final_value boolean, commit_value boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE au app.committee_amendment_authorizations;i app.committee_invitations;r app.committee_rounds;d app.committee_member_drafts;q integer;t timestamptz:=app.governance_now();BEGIN
 payload:=app.assessment_entry_payload(payload);

 PERFORM pg_advisory_xact_lock(hashtextextended(iid::text,101));au:=app.committee_open_amendment(iid);
 IF au.id IS NULL THEN RETURN app.committee_guest_write_original(iid,session_digest,expected,payload,command,final_value,commit_value);END IF;
 i:=app.committee_guest(iid,session_digest);SELECT * INTO r FROM app.committee_rounds WHERE case_id=i.case_id FOR UPDATE;i:=app.committee_guest(iid,session_digest);au:=app.committee_open_amendment(iid);IF au.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='AMENDMENT_CLOSED';END IF;
 SELECT * INTO d FROM app.committee_member_drafts WHERE invite_id=iid;
 IF coalesce(d.revision,0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_DRAFT';END IF;
 q:=app.committee_validate(r.submission_id,payload,final_value);
 IF NOT final_value THEN INSERT INTO app.committee_member_drafts VALUES(iid,expected+1,payload,t) ON CONFLICT(invite_id) DO UPDATE SET revision=expected+1,payload=EXCLUDED.payload,saved_at=t;PERFORM app.committee_event(i.case_id,iid,NULL,'amendment_draft_saved');RETURN jsonb_build_object('revision',expected+1,'savedAt',t);END IF;
 IF NOT commit_value THEN RETURN app.committee_file_scope(iid,session_digest);END IF;
 INSERT INTO app.committee_member_assessments(id,invite_id,case_id,recipient_email_snapshot,rubric_code,rubric_hash,payload,quarter_points,submitted_at,supersedes_id,amendment_id) SELECT command,iid,i.case_id,i.email,'CORE_V1',config_hash,payload,q,t,au.assessment_id,au.id FROM app.rubric_versions WHERE code='CORE_V1';
 INSERT INTO app.committee_amendment_completions VALUES(au.id,command,t);PERFORM app.committee_event(i.case_id,iid,NULL,'amendment_submitted',au.reason,jsonb_build_object('authorization',au.id,'supersedes',au.assessment_id,'assessment',command));PERFORM app.committee_rederive(i.case_id);
 RETURN jsonb_build_object('receipt',jsonb_build_object('id',command,'total',q::numeric/4,'submittedAt',t));
END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.committee_validate(sub uuid, payload jsonb, final_value boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE cr jsonb;loc jsonb;seen text[]:='{}';q integer:=0;lv numeric;modern boolean:=payload->>'inputContract'='SCORES_ONLY_V3';BEGIN
 payload:=app.assessment_entry_payload(payload);

 IF payload ? 'inputContract' AND NOT coalesce(modern,false) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='UNSUPPORTED_ENTRY_CONTRACT';END IF;
 IF jsonb_typeof(payload)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('criteria','overall','calibration','inputContract')) OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR length(payload->>'overall')>2000 OR jsonb_typeof(payload->'calibration') IS DISTINCT FROM 'boolean' OR final_value AND NOT coalesce(modern,false) AND (length(btrim(payload->>'overall'))<50 OR payload->'calibration' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='COMPLETE_ASSESSMENT_REQUIRED';END IF;
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
CREATE OR REPLACE FUNCTION app.correction_form(body jsonb, logical uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE o app.logical_assessments;c jsonb;l jsonb;lev integer;seen text[]:='{}';names text[]:='{}';n text;ref text;q integer:=0;packet uuid;modern boolean;
BEGIN
 body:=app.assessment_entry_payload(body);

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
CREATE OR REPLACE FUNCTION app.evaluation_commit(reader uuid, sid uuid, sub uuid, expected integer, assignment_expected integer, payload jsonb, command uuid, payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE prepared jsonb;p app.projects;s app.project_submissions;cid uuid;aid uuid:=gen_random_uuid();ev uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();quarter integer:=0;c jsonb;l jsonb;ord integer;r app.rubric_versions;result jsonb;sup app.internal_assessments;
BEGIN
 payload:=app.assessment_entry_payload(payload);

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
 payload:=app.assessment_entry_payload(payload);

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
CREATE OR REPLACE FUNCTION app.external_check(who uuid, sid uuid, aid uuid, expected integer, body jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE t app.external_review_assignments;q integer;BEGIN
 body:=app.assessment_entry_payload(body);
 t:=app.external_live(who,sid,aid,'accepted');IF coalesce((SELECT revision FROM app.external_review_drafts WHERE assignment_id=aid),0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_DRAFT';END IF;q:=app.external_form(body,t.packet_id,true);RETURN jsonb_build_object('total',q::numeric/4,'quarterPoints',q,'revision',expected,'rubric','EXTERNAL_V1');END $function$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.external_command(who uuid, sid uuid, aid uuid, operation text, expected integer, body jsonb, cid uuid, commit_value boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE t app.external_review_assignments;BEGIN
 body:=app.assessment_entry_payload(body);
 IF operation NOT IN ('accept','decline','withdraw','save','finalize') OR operation IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_COMMAND'; END IF;
 t:=app.external_live(who,sid,aid,NULL);
 IF NOT EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=cid) AND operation IN ('decline','withdraw') AND app.governance_now()>=(CASE WHEN t.status='offered' THEN t.offer_expires_at ELSE t.due_at END) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='TASK_CLOSED';END IF;
 RETURN app.external_command_r07(who,sid,aid,operation,expected,body,cid,commit_value);
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
 body:=app.assessment_entry_payload(body);

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
CREATE OR REPLACE FUNCTION app.external_form(body jsonb, packet uuid, complete boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE x jsonb;l jsonb;m jsonb;seen text[]:=ARRAY[]::text[];q integer:=0;lev integer;ref text;
BEGIN
 body:=app.assessment_entry_payload(body);

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
 body:=app.assessment_entry_payload(body);

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
CREATE OR REPLACE FUNCTION app.governance_command(who uuid, sid uuid, operation text, body jsonb, command uuid, commit_value boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE a app.users;c app.evaluation_cases;i app.assessment_issues;h app.assessment_heads;receipt app.command_receipts;digest_value text;result jsonb;reason_value text:=body->>'reason';authority boolean;ev uuid;new_id uuid;q integer;run_id uuid;kind text;files jsonb;
BEGIN
 IF operation='correct' AND jsonb_typeof(body->'form')='object' THEN body:=jsonb_set(body,'{form}',app.assessment_entry_payload(body->'form'));END IF;

 a:=app.partner_access_principal(who,sid);
 IF operation NOT IN ('issue','authorize','correct','invalidate','explain','hold','resolve','retain','refresh') OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR body-ARRAY['assessment','issue','reason','type','evidence','expectedRevision','expectedHead','form','resolutionKind']<>'{}'::jsonb OR command IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 IF octet_length(body::text)>131072 OR operation<>'correct' AND body ? 'form' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 digest_value:=encode(sha256(convert_to(jsonb_build_array(operation,body)::text,'UTF8')),'hex');
 -- Match worker's lock order before touching governance rows.
 PERFORM app.progression_tick();
 IF operation='issue' THEN SELECT * INTO h FROM app.assessment_heads WHERE id=(body->>'assessment')::uuid;
 ELSE SELECT * INTO i FROM app.assessment_issues WHERE id=(body->>'issue')::uuid FOR UPDATE;SELECT * INTO h FROM app.assessment_heads WHERE id=i.logical_id;END IF;
 SELECT * INTO c FROM app.evaluation_cases WHERE id=h.case_id;
 authority:=CASE WHEN h.layer='external' THEN a.role_code='platform_admin' ELSE a.role_code='university_admin' AND a.university_id=c.university_id END;
 IF h.id IS NULL OR NOT (authority OR a.role_code='faculty_supervisor' AND a.id=h.evaluator_id) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT * INTO receipt FROM app.command_receipts WHERE actor_id=who AND command_id=command;
 IF receipt.command_id IS NOT NULL THEN IF receipt.action<>'evaluation.governance.'||operation OR receipt.payload_digest<>digest_value THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;RETURN (receipt.result->>'scope')::jsonb;END IF;
 IF jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(reason_value)) NOT BETWEEN 20 AND 2000 OR reason_value IS NULL OR translate(reason_value,E'\n\t\r','') ~ '[[:cntrl:]‪-‮⁦-⁩]' THEN RAISE EXCEPTION 'REASON_REQUIRED';END IF;reason_value:=app.evaluation_trim(reason_value);
 IF operation<>'issue' AND (i.revision IS DISTINCT FROM (body->>'expectedRevision')::integer OR h.head_id IS DISTINCT FROM (body->>'expectedHead')::uuid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_GOVERNANCE';END IF;
 IF operation='issue' AND (body ? 'expectedHead' OR body ? 'expectedRevision') THEN
  IF jsonb_typeof(body->'expectedHead') IS DISTINCT FROM 'string' OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR (body->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  IF h.head_id IS DISTINCT FROM (body->>'expectedHead')::uuid OR h.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_GOVERNANCE';END IF;
 END IF;
 IF operation='refresh' THEN
 run_id:=app.governance_refresh(c.id,who,command);PERFORM app.progression_tick();
 SELECT id INTO ev FROM app.audit_logs WHERE object_id=c.id AND action IN ('evaluation.governance.refresh','system.evaluation.governance.refresh') ORDER BY occurred_at DESC,id DESC LIMIT 1;
 result:=jsonb_build_object('issue',i.id,'state',i.state,'revision',i.revision,'assessment',h.head_id,'run',run_id);
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,command,'evaluation.governance.refresh',digest_value,ev,jsonb_build_object('scope',result::text));RETURN result;
 END IF;
 IF operation='issue' THEN
 IF body->>'type'='internal_disagreement' AND h.layer='external' OR body->>'type'='access_integrity' AND h.layer<>'external' THEN RAISE EXCEPTION 'ISSUE_SCOPE';END IF;
 INSERT INTO app.assessment_issues(case_id,logical_id,layer,type,reason,evidence,created_by,expected_head) VALUES(c.id,h.id,h.layer,body->>'type',reason_value,coalesce(body->'evidence','[]'),who,h.head_id) RETURNING * INTO i;
 ELSIF operation='authorize' THEN
 IF NOT authority OR i.state<>'open' OR i.expected_head<>h.head_id OR i.type NOT IN ('transcription_error','missing_evidence') OR EXISTS(SELECT 1 FROM app.assessment_invalidations WHERE logical_id=h.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AMENDMENT_FORBIDDEN';END IF;
 UPDATE app.assessment_issues SET state='amendment_authorized',authorized_by=who,authorized_at=clock_timestamp(),revision=revision+1 WHERE id=i.id RETURNING * INTO i;
 ELSIF operation='correct' THEN
 IF a.role_code<>'faculty_supervisor' OR who<>h.evaluator_id OR i.state<>'amendment_authorized' OR i.expected_head<>h.head_id OR EXISTS(SELECT 1 FROM app.assessment_invalidations WHERE logical_id=h.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='CORRECTION_FORBIDDEN';END IF;
 q:=app.correction_form(body->'form',h.id);
 IF NOT commit_value THEN
 SELECT jsonb_agg(jsonb_build_object('key',so.storage_key,'size',so.size_bytes,'sha256',so.sha256) ORDER BY so.id) INTO files FROM app.submission_files sf JOIN app.storage_objects so ON so.id=sf.storage_object_id AND so.university_id=sf.university_id AND so.project_id=sf.project_id WHERE sf.submission_id=h.submission_id AND (
   app.original_correction_policy(h.id)='ASSESSMENT_UX_V2' AND (
     h.layer<>'external' OR EXISTS(SELECT 1 FROM app.external_review_assignments t JOIN app.academic_review_packets ap ON ap.id=t.packet_id CROSS JOIN LATERAL jsonb_array_elements(ap.manifest->'entries') entry WHERE t.id=h.assignment_id AND ap.submission_id=sf.submission_id AND entry->>'id'=sf.file_id::text)
   ) OR app.original_correction_policy(h.id)='REFERENCED_ASSESSMENT_V1' AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'form'->'criteria') criterion CROSS JOIN LATERAL jsonb_array_elements(criterion->'locators') locator WHERE locator->>'file'=sf.file_id::text)
 );
 IF files IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='EVIDENCE_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('files',files);
 END IF;
 new_id:=gen_random_uuid();
 INSERT INTO app.assessment_revisions(id,logical_id,case_id,layer,supersedes_id,issue_id,revision,evaluator_id,rubric_code,rubric_hash,payload,quarter_points) VALUES(new_id,h.id,c.id,h.layer,h.head_id,i.id,h.revision+1,who,h.rubric_code,h.rubric_hash,body->'form',q);
 UPDATE app.assessment_issues SET state='corrected',resolved_by=who,resolved_at=clock_timestamp(),resolution=reason_value,resolution_kind='original_evaluator_amendment',revision=revision+1 WHERE id=i.id RETURNING * INTO i;
 IF h.layer='external' AND body->'form' IS DISTINCT FROM app.assessment_payload(h.head_id) THEN UPDATE app.evaluation_progression SET quality_paused=false WHERE case_id=c.id;END IF;
 ELSIF operation='invalidate' THEN
 IF NOT authority OR i.state NOT IN ('open','amendment_authorized') OR i.type NOT IN ('identity_integrity','undeclared_conflict') OR jsonb_typeof(body->'evidence') IS DISTINCT FROM 'object' OR body->'evidence'->>'confirmation' IS DISTINCT FROM (CASE WHEN i.type='identity_integrity' THEN 'distinct_identity_confirmation' ELSE 'disqualifying_conflict_confirmation' END) OR char_length(btrim(body->'evidence'->>'reference')) NOT BETWEEN 20 AND 2000 OR body->'evidence'->'namesOnly' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='EVIDENCED_INVALIDATION_REQUIRED';END IF;
 INSERT INTO app.assessment_invalidations(logical_id,case_id,issue_id,confirmed_by,reason,evidence) VALUES(h.id,c.id,i.id,who,reason_value,body->'evidence');
 UPDATE app.assessment_issues SET state='invalidated',resolved_by=who,resolved_at=clock_timestamp(),resolution=reason_value,resolution_kind='confirmed_invalidation',revision=revision+1 WHERE id=i.id RETURNING * INTO i;
 IF h.layer='external' THEN UPDATE app.evaluation_progression SET quality_paused=false WHERE case_id=c.id;END IF;
 ELSIF operation='explain' THEN
 IF NOT authority OR h.layer='external' OR i.type<>'internal_disagreement' OR i.state<>'open' OR NOT EXISTS(SELECT 1 FROM app.effective_internal_disagreements WHERE case_id=c.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='EXPLANATION_FORBIDDEN';END IF;
 INSERT INTO app.evaluation_discrepancy_explanations(case_id,supervisor_head,committee_head,issue_id,explanation,recorded_by) SELECT c.id,s.id,cm.id,i.id,reason_value,who FROM app.effective_internal_assessments s JOIN app.effective_internal_assessments cm ON cm.case_id=s.case_id AND cm.layer='committee' WHERE s.case_id=c.id AND s.layer='supervisor';
 UPDATE app.assessment_issues SET state='explained',resolved_by=who,resolved_at=clock_timestamp(),resolution=reason_value,resolution_kind='institutional_explanation',revision=revision+1 WHERE id=i.id RETURNING * INTO i;
 ELSIF operation='hold' THEN
 IF NOT authority OR i.state NOT IN ('open','amendment_authorized') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='HOLD_FORBIDDEN';END IF;
 kind:=CASE i.type WHEN 'internal_disagreement' THEN 'internal_disagreement' WHEN 'missing_evidence' THEN 'evidence_integrity' WHEN 'access_integrity' THEN 'access_integrity' ELSE 'assessment_integrity' END;
 INSERT INTO app.evaluation_holds(issue_id,case_id,version_id,type,created_by,reason) VALUES(i.id,c.id,c.version_id,kind,who,reason_value);UPDATE app.assessment_issues SET revision=revision+1 WHERE id=i.id RETURNING * INTO i;
 ELSIF operation='resolve' THEN
 IF NOT authority OR NOT EXISTS(SELECT 1 FROM app.evaluation_holds WHERE issue_id=i.id AND state='open') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RESOLUTION_FORBIDDEN';END IF;
 kind:=body->>'resolutionKind';
 IF NOT (kind='original_evaluator_amendment' AND i.state='corrected' OR kind='confirmed_invalidation' AND i.state='invalidated' OR kind='institutional_explanation' AND i.state='explained' OR kind='verified_evidence_restoration' AND i.type='missing_evidence' OR kind='verified_access_restoration' AND i.type='access_integrity') THEN RAISE EXCEPTION 'RESOLUTION_PROVENANCE_REQUIRED';END IF;
 IF kind IN ('verified_evidence_restoration','verified_access_restoration') THEN
 IF h.layer='external' THEN SELECT app.external_packet(t.packet_id)->'files' INTO files FROM app.external_review_assignments t WHERE t.id=h.assignment_id;
 ELSE SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256)) INTO files FROM app.submission_files sf JOIN app.storage_objects o ON o.id=sf.storage_object_id WHERE sf.submission_id=h.submission_id;END IF;
 IF NOT commit_value THEN RETURN jsonb_build_object('files',files);END IF;
 END IF;
 UPDATE app.evaluation_holds SET state='resolved',resolved_by=who,resolved_at=clock_timestamp(),resolution_kind=kind,resolution=reason_value WHERE issue_id=i.id;
 IF i.state='open' THEN UPDATE app.assessment_issues SET state='resolved_retained',resolved_by=who,resolved_at=clock_timestamp(),resolution_kind=kind,resolution=reason_value WHERE id=i.id;END IF;
 UPDATE app.assessment_issues SET revision=revision+1 WHERE id=i.id RETURNING * INTO i;
 ELSIF operation='retain' THEN
 IF NOT authority OR i.state NOT IN ('open','amendment_authorized') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='RETAIN_FORBIDDEN';END IF;
 UPDATE app.assessment_issues SET state='resolved_retained',resolved_by=who,resolved_at=clock_timestamp(),resolution=reason_value,resolution_kind='retained_original',revision=revision+1 WHERE id=i.id RETURNING * INTO i;
 ELSIF operation='refresh' THEN IF NOT authority THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 END IF;
 INSERT INTO app.assessment_issue_history(issue_id,actor_id,operation,reason,evidence) VALUES(i.id,who,operation,reason_value,coalesce(body->'evidence','[]'));
 ev:=app.governance_event(who,c,operation,i.id,command,i.state,CASE WHEN operation IN ('authorize','correct','invalidate','hold','resolve','explain','retain') THEN h.evaluator_id ELSE NULL END);
 run_id:=app.governance_refresh(c.id,who,command);PERFORM app.progression_tick();
 UPDATE app.evaluation_holds SET policy_run=run_id WHERE issue_id=i.id AND operation='resolve';
 result:=jsonb_build_object('issue',i.id,'state',i.state,'revision',i.revision,'assessment',coalesce(new_id,h.head_id),'run',run_id);
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,command,'evaluation.governance.'||operation,digest_value,ev,jsonb_build_object('scope',result::text));RETURN result;
END $function$;
