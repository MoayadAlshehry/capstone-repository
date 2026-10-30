-- R06 task adapters: server-side drafts, reviewed file-scope decisions and read models.
CREATE TABLE app.academic_decision_commands(
 actor_id uuid NOT NULL,command_id uuid NOT NULL,submission_id uuid NOT NULL REFERENCES app.academic_finals(submission_id),
 operation text NOT NULL CHECK(operation IN ('publish','revision','retain')),reason text NOT NULL,
 public_manifest_digest text NOT NULL CHECK(public_manifest_digest~'^[a-f0-9]{64}$'),payload_digest text NOT NULL,
 PRIMARY KEY(actor_id,command_id),FOREIGN KEY(actor_id) REFERENCES app.users(id)
);
CREATE TRIGGER immutable_academic_decision_command BEFORE UPDATE OR DELETE ON app.academic_decision_commands FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.academic_decision_commands FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.academic_public_manifest(sub uuid) RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('file',m.file_id,'path',m.relative_path,'sha256',m.sha256_at_submit,'visibility',f.visibility,'policyRevision',f.policy_revision) ORDER BY m.relative_path,m.file_id),'[]')::text,'UTF8')),'hex') FROM app.submission_files m JOIN app.project_files f ON f.id=m.file_id WHERE m.submission_id=sub
$$;
REVOKE ALL ON FUNCTION app.academic_public_manifest(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.academic_readiness(who uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE state jsonb;vid uuid;BEGIN
 state:=app.semester_state(who,sid,pid);vid:=(state->'project'->>'version')::uuid;
 RETURN jsonb_build_object('studio',state,'final',app.submission_state(who,sid,pid,vid),'manifestDigest',app.semester_manifest(pid,vid),'contract','ACADEMIC_FINAL_V1');
END $$;
CREATE FUNCTION app.academic_receipt(who uuid,sid uuid,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.command_receipts;a app.audit_logs;BEGIN
 PERFORM app.assignment_principal(who,sid);SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=command;
 IF r.command_id IS NULL THEN RETURN NULL;END IF;SELECT * INTO a FROM app.audit_logs WHERE id=r.audit_id;
 PERFORM app.file_actor(who,sid,a.project_id,a.version_id,false);RETURN (r.result->>'scope')::jsonb;
END $$;
CREATE FUNCTION app.academic_round_read(who uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;p app.projects;tag app.academic_finals;assessment jsonb;state jsonb;BEGIN
 result:=app.submission_read(who,sid,sub);p:=app.submission_actor(who,sid,sub);SELECT * INTO tag FROM app.academic_finals WHERE submission_id=sub;
 IF tag.submission_id IS NULL THEN RETURN result||jsonb_build_object('contract','FINAL_LEGACY','assessment',NULL,'publication',app.publication_state(who,sid,sub));END IF;
 IF p.supervisor_id=who AND (app.assignment_principal(who,sid)).role_code='faculty_supervisor' THEN
  assessment:=app.evaluation_read(who,sid,sub)||jsonb_build_object('drafts',(SELECT coalesce(jsonb_agg(jsonb_build_object('layer',layer,'payload',payload,'revision',revision,'savedAt',saved_at) ORDER BY layer),'[]') FROM app.academic_assessment_drafts WHERE submission_id=sub AND actor_id=who),'provenance',(SELECT coalesce(jsonb_agg(jsonb_build_object('assessment',pr.assessment_id,'name',pr.actor_name,'recordedAt',pr.recorded_at)),'[]') FROM app.academic_assessment_provenance pr JOIN app.internal_assessments ia ON ia.id=pr.assessment_id WHERE ia.submission_id=sub));
 END IF;
 RETURN result||jsonb_build_object('contract',tag.contract,'finalNumber',tag.number,'manifestDigest',tag.manifest_digest,'publicManifestDigest',app.academic_public_manifest(sub),'assessment',assessment,'publication',app.publication_state(who,sid,sub),'decisionScope',(SELECT to_jsonb(d)-'submission_id' FROM app.academic_decision_scope d WHERE submission_id=sub),'canAssess',(result->>'canDecide')::boolean AND p.supervisor_id=who AND (app.assignment_principal(who,sid)).role_code='faculty_supervisor');
END $$;
REVOKE ALL ON FUNCTION app.academic_readiness(uuid,uuid,uuid),app.academic_receipt(uuid,uuid,uuid),app.academic_round_read(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_readiness(uuid,uuid,uuid),app.academic_receipt(uuid,uuid,uuid),app.academic_round_read(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.academic_draft_save(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,draft_expected integer,payload jsonb,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;s app.project_submissions;row app.academic_assessment_drafts;r app.command_receipts;layer_value text:=payload->>'layer';c jsonb;l jsonb;seen text[]:='{}';ev uuid:=gen_random_uuid();t timestamptz:=clock_timestamp();result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));p:=app.evaluation_actor(who,sid,sub,false);
 IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NEW_FINAL_REQUIRED';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=command;
 IF r.command_id IS NOT NULL THEN IF r.action<>'academic.draft.'||layer_value OR r.payload_digest<>digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN (r.result->>'scope')::jsonb;END IF;
 PERFORM app.evaluation_actor(who,sid,sub,true,expected,assignment_expected);
 IF layer_value NOT IN ('supervisor','committee') OR layer_value IS NULL OR draft_expected IS NULL OR draft_expected<0 OR EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer=layer_value) OR layer_value='committee' AND NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=sub AND layer='supervisor') THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ASSESSMENT_LOCKED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('layer','criteria','overall','calibration','members','assessedOn','attestation')) OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(payload->>'overall'))>2000 OR jsonb_typeof(payload->'calibration') IS DISTINCT FROM 'boolean' OR jsonb_typeof(payload->'attestation') IS DISTINCT FROM 'boolean' OR jsonb_typeof(payload->'members') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'members')>30 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DRAFT';END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(payload->'criteria') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(c) k WHERE k NOT IN ('code','level','comment','locators')) OR coalesce(c->>'code','') !~ '^C[1-7]$' OR c->>'code'=ANY(seen) OR (c->'level' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(c->'level') IS DISTINCT FROM 'number' OR (c->>'level')::numeric NOT BETWEEN 0 AND 4 OR (c->>'level')::numeric<>trunc((c->>'level')::numeric))) OR jsonb_typeof(c->'comment') IS DISTINCT FROM 'string' OR char_length(c->>'comment')>1000 OR jsonb_typeof(c->'locators') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DRAFT_CRITERION';END IF;
  seen:=array_append(seen,c->>'code');
  FOR l IN SELECT value FROM jsonb_array_elements(c->'locators') LOOP
   IF jsonb_typeof(l) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(l) k WHERE k NOT IN ('file','kind','reference')) OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(l->>'reference') NOT BETWEEN 1 AND 200 OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub AND file_id=(l->>'file')::uuid) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
   PERFORM app.submission_native_read(who,sid,p.id,p.current_version_id,sub,(l->>'file')::uuid);
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'members') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR char_length(x#>>'{}')>200) OR (payload->'assessedOn' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(payload->'assessedOn') IS DISTINCT FROM 'string' OR coalesce(payload->>'assessedOn','') !~ '^\d{4}-\d{2}-\d{2}$')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DRAFT_PROVENANCE';END IF;
 SELECT * INTO row FROM app.academic_assessment_drafts WHERE submission_id=sub AND layer=layer_value AND actor_id=who FOR UPDATE;
 IF coalesce(row.revision,0)<>draft_expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='DRAFT_CONFLICT';END IF;
 SELECT * INTO s FROM app.project_submissions WHERE id=sub;
 INSERT INTO app.academic_assessment_drafts(university_id,project_id,version_id,submission_id,layer,actor_id,payload,revision,saved_at) VALUES(p.university_id,p.id,s.version_id,sub,layer_value,who,payload,draft_expected+1,t) ON CONFLICT(submission_id,layer,actor_id) DO UPDATE SET payload=EXCLUDED.payload,revision=EXCLUDED.revision,saved_at=EXCLUDED.saved_at;
 result:=jsonb_build_object('submission',sub,'layer',layer_value,'revision',draft_expected+1,'savedAt',t);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,after_state) VALUES(ev,who,'faculty_supervisor',p.university_id,'academic.draft.'||layer_value,'project_submission',sub,p.id,s.version_id,command,ev,jsonb_build_object('scope',result::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(ev,who,p.university_id,p.id,'evaluation.draft.saved',jsonb_build_object('route','/submissions/'||sub::text,'message_key','evaluation.draft.saved'));
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'immediate_notice');
 INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES(who,command,'academic.draft.'||layer_value,digest,ev,jsonb_build_object('scope',result::text));RETURN result;
END $$;
CREATE FUNCTION app.academic_finalize_draft_guard(who uuid,sid uuid,sub uuid,layer_value text,expected integer,payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE draft app.academic_assessment_drafts;BEGIN
 PERFORM app.evaluation_actor(who,sid,sub,false);
 SELECT * INTO draft FROM app.academic_assessment_drafts WHERE submission_id=sub AND layer=layer_value AND actor_id=who FOR SHARE;
 IF expected IS NULL OR expected<1 OR draft.revision IS DISTINCT FROM expected OR draft.payload IS DISTINCT FROM payload THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='DRAFT_CONFLICT';END IF;
END $$;
REVOKE ALL ON FUNCTION app.academic_draft_save(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text),app.academic_finalize_draft_guard(uuid,uuid,uuid,text,integer,jsonb) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_draft_save(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text),app.academic_finalize_draft_guard(uuid,uuid,uuid,text,integer,jsonb) TO capstone_runtime;
--> statement-breakpoint
-- Old endpoints cannot bypass the new named file-scope decision command.
ALTER FUNCTION app.publication_prepare(uuid,uuid,uuid,integer,integer,uuid,text) RENAME TO publication_prepare_legacy;
CREATE FUNCTION app.publication_prepare(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) AND NOT EXISTS(SELECT 1 FROM app.academic_decision_commands WHERE actor_id=reader AND command_id=command AND submission_id=sub AND operation='publish' AND payload_digest=payload_hash) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='REVIEWED_DECISION_REQUIRED';END IF;
 RETURN app.publication_prepare_legacy(reader,sid,sub,expected,assignment_expected,command,payload_hash);
END $$;
ALTER FUNCTION app.submission_decide(uuid,uuid,uuid,integer,integer,text,text,uuid,text) RENAME TO submission_decide_legacy;
CREATE FUNCTION app.submission_decide(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,operation text,comment_value text,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) AND NOT EXISTS(SELECT 1 FROM app.academic_decision_commands dc WHERE dc.actor_id=reader AND dc.command_id=command AND dc.submission_id=sub AND dc.operation=CASE WHEN submission_decide.operation='revision' THEN 'revision' ELSE 'retain' END AND payload_digest=payload_hash) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='REVIEWED_DECISION_REQUIRED';END IF;
 RETURN app.submission_decide_legacy(reader,sid,sub,expected,assignment_expected,operation,comment_value,command,payload_hash);
END $$;
REVOKE ALL ON FUNCTION app.publication_prepare_legacy(uuid,uuid,uuid,integer,integer,uuid,text),app.submission_decide_legacy(uuid,uuid,uuid,integer,integer,text,text,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.publication_prepare(uuid,uuid,uuid,integer,integer,uuid,text),app.submission_decide(uuid,uuid,uuid,integer,integer,text,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.publication_prepare(uuid,uuid,uuid,integer,integer,uuid,text),app.submission_decide(uuid,uuid,uuid,integer,integer,text,text,uuid,text) TO capstone_runtime;
CREATE FUNCTION app.academic_decision_prepare(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome text,reason text,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;r app.command_receipts;gate app.academic_decision_commands;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||command::text,0));p:=app.evaluation_actor(who,sid,sub,false);
 IF NOT EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) OR outcome NOT IN ('publish','revision','retain') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NEW_FINAL_REQUIRED';END IF;
 SELECT * INTO r FROM app.command_receipts WHERE actor_id=who AND command_id=command;
 IF r.command_id IS NOT NULL THEN
  SELECT * INTO gate FROM app.academic_decision_commands WHERE actor_id=who AND command_id=command;
  IF gate.submission_id IS DISTINCT FROM sub OR gate.payload_digest IS DISTINCT FROM digest THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('completed',(r.result->>'scope')::jsonb);
 END IF;
 PERFORM app.evaluation_actor(who,sid,sub,true,expected,assignment_expected);
 IF manifest IS NULL OR manifest<>app.academic_public_manifest(sub) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_PUBLIC_MANIFEST';END IF;
 IF reason IS NULL OR char_length(app.evaluation_trim(reason))>2000 OR outcome<>'publish' AND char_length(app.evaluation_trim(reason))<3 OR reason ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f‪-‮⁦-⁩]' OR reason ~* '(password|secret|token|cookie)[[:space:]]*[:=]' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='REASON_REQUIRED';END IF;
 INSERT INTO app.academic_decision_commands VALUES(who,command,sub,outcome,reason,manifest,digest);
 IF outcome='publish' THEN RETURN app.publication_prepare(who,sid,sub,expected,assignment_expected,command,digest);END IF;
 RETURN jsonb_build_object('files','[]'::jsonb);
END $$;
CREATE FUNCTION app.academic_decision_commit(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome text,reason text,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prep jsonb;result jsonb;BEGIN
 -- The service invokes prepare in the same transaction; never insert a second gate.
 IF NOT EXISTS(SELECT 1 FROM app.academic_decision_commands WHERE actor_id=who AND command_id=command AND submission_id=sub AND payload_digest=digest) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PREPARE_REQUIRED';END IF;
 IF outcome='publish' THEN result:=app.publication_commit(who,sid,sub,expected,assignment_expected,command,digest);
 ELSE result:=app.submission_decide(who,sid,sub,expected,assignment_expected,CASE WHEN outcome='revision' THEN 'revision' ELSE 'reject' END,reason,command,digest);END IF;
 INSERT INTO app.academic_decision_scope(submission_id,actor_name,outcome,reason,public_manifest_digest) SELECT sub,full_name,outcome,reason,manifest FROM app.users WHERE id=who;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text),app.academic_decision_commit(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text),app.academic_decision_commit(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) TO capstone_runtime;
--> statement-breakpoint
ALTER FUNCTION app.edition_visibility(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text) RENAME TO edition_visibility_legacy;
CREATE FUNCTION app.edition_visibility(reader uuid,sid uuid,pid uuid,vid uuid,fid uuid,expected integer,intended text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.project_versions v WHERE v.id=vid AND v.status IN ('archived','rejected')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ARCHIVE_READ_ONLY';END IF;
 RETURN app.edition_visibility_legacy(reader,sid,pid,vid,fid,expected,intended,command,digest);
END $$;
REVOKE ALL ON FUNCTION app.edition_visibility_legacy(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.edition_visibility(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.edition_visibility(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text) TO capstone_runtime;


--> statement-breakpoint
ALTER FUNCTION app.evaluation_read(uuid,uuid,uuid) RENAME TO evaluation_read_legacy;
CREATE FUNCTION app.evaluation_read(reader uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 RETURN app.evaluation_read_legacy(reader,sid,sub)||jsonb_build_object('contract',CASE WHEN EXISTS(SELECT 1 FROM app.academic_finals WHERE submission_id=sub) THEN 'ACADEMIC_FINAL_V1' ELSE 'FINAL_LEGACY' END);
END $$;
REVOKE ALL ON FUNCTION app.evaluation_read_legacy(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.evaluation_read(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.evaluation_read(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
ALTER FUNCTION app.successor_prepare(uuid,uuid,uuid,uuid,integer,uuid,text) RENAME TO successor_prepare_legacy;
CREATE FUNCTION app.successor_prepare(reader uuid,sid uuid,pid uuid,base uuid,expected integer,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.project_versions v WHERE v.id=base AND v.status IN ('archived','rejected')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ARCHIVE_READ_ONLY';END IF;
 RETURN app.successor_prepare_legacy(reader,sid,pid,base,expected,command,digest);
END $$;
REVOKE ALL ON FUNCTION app.successor_prepare_legacy(uuid,uuid,uuid,uuid,integer,uuid,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.successor_prepare(uuid,uuid,uuid,uuid,integer,uuid,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.successor_prepare(uuid,uuid,uuid,uuid,integer,uuid,text) TO capstone_runtime;


--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.semester_collection(who uuid,sid uuid,needs_review boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;item jsonb;pid uuid;result jsonb:='[]';data jsonb;
BEGIN
 a:=app.assignment_principal(who,sid);IF a.role_code NOT IN ('student','faculty_supervisor') OR needs_review AND a.role_code<>'faculty_supervisor' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FORBIDDEN';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(app.assignment_view(who,sid,NULL)->'projects') ORDER BY value->>'id' LOOP
  pid:=(item->>'id')::uuid;data:=app.semester_state(who,sid,pid);
  IF NOT needs_review OR data->>'lifecycle' IN ('awaiting_review','final_pending') THEN result:=result||jsonb_build_array(jsonb_build_object('id',pid,'title',data->'project'->'metadata'->>'title','department',item->>'department','year',data->'project'->'metadata'->>'academic_year','supervisor',item->'supervisor'->>'name','lead',(SELECT u.full_name FROM app.project_authors pa JOIN app.users u ON u.id=pa.user_id WHERE pa.project_id=pid AND pa.is_team_lead),'role',data->>'role','lifecycle',data->>'lifecycle','checkpoint',data->'latest'->>'id','number',data->'latest'->>'number','submittedAt',data->'latest'->>'submittedAt','updatedAt',data->'project'->>'updatedAt','final',(SELECT id FROM app.project_submissions WHERE version_id=(data->'project'->>'version')::uuid AND purpose='FINAL' ORDER BY round_number DESC LIMIT 1),'finalNumber',(SELECT number FROM app.academic_finals WHERE version_id=(data->'project'->>'version')::uuid ORDER BY number DESC LIMIT 1),'finalSubmittedAt',(SELECT submitted_at FROM app.project_submissions WHERE version_id=(data->'project'->>'version')::uuid AND purpose='FINAL' ORDER BY round_number DESC LIMIT 1)));END IF;
 END LOOP;RETURN jsonb_build_object('items',result);
END $$;
--> statement-breakpoint
ALTER FUNCTION app.semester_state(uuid,uuid,uuid) RENAME TO semester_state_r05;
CREATE FUNCTION app.semester_state(who uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;vid uuid;final jsonb;r app.review_records;sub uuid;BEGIN
 result:=app.semester_state_r05(who,sid,pid);vid:=(result->'project'->>'version')::uuid;
 SELECT af.submission_id INTO sub FROM app.academic_finals af WHERE af.version_id=vid ORDER BY af.number DESC LIMIT 1;
 IF sub IS NULL THEN RETURN result;END IF;
 SELECT * INTO r FROM app.review_records WHERE submission_id=sub;
 SELECT jsonb_build_object('id',af.submission_id,'number',af.number,'state',coalesce(r.decision,'final_pending'),'comment',r.comment,'decidedAt',r.decided_at) INTO final FROM app.academic_finals af WHERE af.submission_id=sub;
 RETURN result||jsonb_build_object('final',final,'lifecycle',CASE WHEN result->'project'->>'status'='revision_required' AND r.decision='revision_required' THEN 'final_revision' ELSE result->>'lifecycle' END);
END $$;
REVOKE ALL ON FUNCTION app.semester_state_r05(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.semester_state(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.semester_state(uuid,uuid,uuid) TO capstone_runtime;


--> statement-breakpoint
-- Owner archive-read-only rule applies to ordinary completed-project actions,
-- including legacy archives; stored policies, grants and historical successors stay intact.
ALTER FUNCTION app.edition_history(uuid,uuid,uuid) RENAME TO edition_history_legacy;
CREATE FUNCTION app.edition_history(reader uuid,sid uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;BEGIN
 result:=app.edition_history_legacy(reader,sid,pid);
 RETURN result||jsonb_build_object('items',(SELECT coalesce(jsonb_agg(v||jsonb_build_object('canCreate',false,'files',(SELECT coalesce(jsonb_agg(f||jsonb_build_object('canChange',CASE WHEN v->>'status' IN ('archived','rejected') THEN false ELSE (f->>'canChange')::boolean END)),'[]') FROM jsonb_array_elements(v->'files') f)) ORDER BY (v->>'number')::integer DESC),'[]') FROM jsonb_array_elements(result->'items') v));
END $$;
REVOKE ALL ON FUNCTION app.edition_history_legacy(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.edition_history(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.edition_history(uuid,uuid,uuid) TO capstone_runtime;
