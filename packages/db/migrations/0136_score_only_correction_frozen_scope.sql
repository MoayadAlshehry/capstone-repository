-- Score-only corrections retain real frozen-original verification without manual locator entry.
-- Historical correction admission and actor/tenant/head/authorization/immutability checks are unchanged.
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
   (app.original_correction_policy(h.id)='ASSESSMENT_UX_V2' OR body->'form'->>'inputContract'='SCORES_ONLY_V3') AND (
     h.layer<>'external' OR EXISTS(SELECT 1 FROM app.external_review_assignments t JOIN app.academic_review_packets ap ON ap.id=t.packet_id CROSS JOIN LATERAL jsonb_array_elements(ap.manifest->'entries') entry WHERE t.id=h.assignment_id AND ap.submission_id=sf.submission_id AND entry->>'id'=sf.file_id::text)
   ) OR body->'form'->>'inputContract' IS DISTINCT FROM 'SCORES_ONLY_V3' AND app.original_correction_policy(h.id)='REFERENCED_ASSESSMENT_V1' AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'form'->'criteria') criterion CROSS JOIN LATERAL jsonb_array_elements(criterion->'locators') locator WHERE locator->>'file'=sf.file_id::text)
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
