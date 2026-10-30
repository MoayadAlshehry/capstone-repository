-- Phase29 execution mechanics. Allocation policy belongs to Phase30.
ALTER TABLE app.rubric_versions DROP CONSTRAINT rubric_versions_code_check;
ALTER TABLE app.rubric_versions DROP CONSTRAINT rubric_versions_kind_check;
ALTER TABLE app.rubric_versions ADD CHECK ((code='CORE_V1' AND kind='internal') OR (code='EXTERNAL_V1' AND kind='external'));
CREATE TABLE app.external_policy_runs(id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('technical-fixture-v1','scheduler-v1')),created_at timestamptz NOT NULL DEFAULT app.governance_now());
CREATE TRIGGER immutable_external_policy_run BEFORE UPDATE OR DELETE ON app.external_policy_runs FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TABLE app.external_review_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),packet_id uuid NOT NULL,reviewer_id uuid NOT NULL REFERENCES app.users(id),institution_id uuid NOT NULL REFERENCES app.universities(id),policy_run_id uuid NOT NULL REFERENCES app.external_policy_runs(id),slot integer NOT NULL CHECK(slot BETWEEN 1 AND 10),
 status text NOT NULL CHECK(status IN ('offered','accepted','completed','declined','expired','withdrawn','cancelled')),offered_at timestamptz(3) NOT NULL,offer_expires_at timestamptz(3) NOT NULL,accepted_at timestamptz(3),due_at timestamptz(3),completed_at timestamptz(3),closed_at timestamptz(3),declarations jsonb,closure_code text,reason text,
 offer_reminder uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),task_reminder uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 UNIQUE(case_id,reviewer_id),FOREIGN KEY(case_id,packet_id) REFERENCES app.academic_review_packets(case_id,id),
 CHECK(offer_expires_at=offered_at+interval '7 days'),CHECK((accepted_at IS NULL)=(due_at IS NULL)),CHECK(due_at IS NULL OR due_at=accepted_at+interval '14 days'),CHECK((status IN ('offered','accepted'))=(closed_at IS NULL)),CHECK((status='completed')=(completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX external_active_slot ON app.external_review_assignments(case_id,slot) WHERE status IN ('offered','accepted','completed');
CREATE INDEX external_reviewer_active ON app.external_review_assignments(reviewer_id,status);
CREATE TABLE app.external_review_drafts(assignment_id uuid PRIMARY KEY REFERENCES app.external_review_assignments(id),revision integer NOT NULL CHECK(revision>=1),body jsonb NOT NULL,updated_at timestamptz(3) NOT NULL);
ALTER TABLE app.evaluation_cases ADD UNIQUE(id,submission_id);
CREATE TABLE app.external_assessments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assignment_id uuid NOT NULL UNIQUE REFERENCES app.external_review_assignments(id),case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),submission_id uuid NOT NULL,FOREIGN KEY(case_id,submission_id) REFERENCES app.evaluation_cases(id,submission_id),reviewer_id uuid NOT NULL REFERENCES app.users(id),rubric_code text NOT NULL DEFAULT 'EXTERNAL_V1' CHECK(rubric_code='EXTERNAL_V1') REFERENCES app.rubric_versions(code),rubric_hash text NOT NULL,quarter_points integer NOT NULL CHECK(quarter_points BETWEEN 0 AND 400),overall_comment text NOT NULL CHECK(char_length(btrim(overall_comment)) BETWEEN 50 AND 2000),calibration_ack boolean NOT NULL CHECK(calibration_ack),finalized_at timestamptz(3) NOT NULL,UNIQUE(id,submission_id));
CREATE TABLE app.external_criterion_scores(assessment_id uuid NOT NULL REFERENCES app.external_assessments(id),code text NOT NULL CHECK(code IN ('E1','E2','E3','E4')),level integer NOT NULL CHECK(level BETWEEN 0 AND 4),comment text NOT NULL CHECK(char_length(btrim(comment))<=1000 AND (level NOT IN (0,4) OR char_length(btrim(comment))>=20)),PRIMARY KEY(assessment_id,code));
CREATE TABLE app.external_evidence_locators(assessment_id uuid NOT NULL,code text NOT NULL,ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 20),file_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('page','section','figure','test','lines')),reference text NOT NULL CHECK(char_length(reference) BETWEEN 1 AND 200),PRIMARY KEY(assessment_id,code,ordinal),FOREIGN KEY(assessment_id,code) REFERENCES app.external_criterion_scores(assessment_id,code),submission_id uuid NOT NULL,FOREIGN KEY(assessment_id,submission_id) REFERENCES app.external_assessments(id,submission_id),FOREIGN KEY(submission_id,file_id) REFERENCES app.submission_files(submission_id,file_id));
CREATE TRIGGER immutable_external_assessment BEFORE UPDATE OR DELETE ON app.external_assessments FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_external_criterion BEFORE UPDATE OR DELETE ON app.external_criterion_scores FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
CREATE TRIGGER immutable_external_locator BEFORE UPDATE OR DELETE ON app.external_evidence_locators FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.external_policy_runs,app.external_review_assignments,app.external_review_drafts,app.external_assessments,app.external_criterion_scores,app.external_evidence_locators FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.external_packet(packet uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.academic_review_packets;body jsonb;m jsonb;files jsonb;
BEGIN
 SELECT * INTO r FROM app.academic_review_packets WHERE id=packet;
 IF r.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.projects p JOIN app.project_versions v ON v.id=p.published_version_id WHERE p.id=r.project_id AND p.published_version_id=r.version_id AND v.approved_submission_id=r.submission_id) OR NOT app.partner_archive_eligible(r.project_id,r.version_id) OR NOT EXISTS(SELECT 1 FROM app.academic_packet_workspaces WHERE case_id=r.case_id AND current_packet_id=r.id) OR EXISTS(SELECT 1 FROM app.academic_packet_revocations WHERE packet_id=r.id) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='PACKET_UNAVAILABLE';END IF;
 body:=jsonb_build_object('files',(SELECT jsonb_agg(e->'id') FROM jsonb_array_elements(r.manifest->'entries') e),'reports',(SELECT coalesce(jsonb_agg(e->'id'),'[]') FROM jsonb_array_elements(r.manifest->'entries') e WHERE e->'report'='true'::jsonb),'locators',r.manifest->'locators','languages',r.manifest->'languages','attestation',true);
 m:=app.packet_manifest(r.case_id,body,true);IF m IS DISTINCT FROM r.manifest OR app.packet_hash(m)<>r.manifest_hash THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='PACKET_INTEGRITY';END IF;
 SELECT jsonb_agg(jsonb_build_object('key',o.storage_key,'size',o.size_bytes,'sha256',o.sha256)) INTO files FROM app.submission_files sf JOIN app.storage_objects o ON o.id=sf.storage_object_id WHERE sf.submission_id=r.submission_id AND (body->'files') ? sf.file_id::text;
 RETURN jsonb_build_object('manifest',m,'hash',r.manifest_hash,'files',files);
END $$;
CREATE FUNCTION app.external_candidate(reviewer uuid,packet uuid,new_offer boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.academic_review_packets;f jsonb;p app.projects;
BEGIN
 SELECT * INTO r FROM app.academic_review_packets WHERE id=packet;SELECT * INTO p FROM app.projects WHERE id=r.project_id FOR UPDATE;
 PERFORM 1 FROM app.evaluation_cases WHERE id=r.case_id FOR UPDATE;
 f:=app.reviewer_candidate_facts(reviewer,p.id);
 IF f IS NULL OR f->'activeFaculty'<>'true' OR f->'approved'<>'true' OR f->'calibrated'<>'true' OR f->>'institution'=f->>'projectUniversity' OR f->'author'='true' OR f->'supervisor'='true' OR f->'formerSupervisor'='true' OR new_offer AND f->'available'<>'true' OR NOT (f->'domains') ? (SELECT domain FROM app.project_versions WHERE id=r.version_id) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(f->'languages') l WHERE (r.manifest->'languages') ? l) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INELIGIBLE';END IF;
 RETURN f;
END $$;
CREATE FUNCTION app.external_live(who uuid,sid uuid,aid uuid,required_status text DEFAULT NULL) RETURNS app.external_review_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;t app.external_review_assignments;f jsonb;
BEGIN
 a:=app.partner_access_principal(who,sid);SELECT * INTO t FROM app.external_review_assignments WHERE id=aid AND reviewer_id=who FOR UPDATE;
 IF t.id IS NULL OR a.role_code<>'faculty_supervisor' THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF required_status IS NOT NULL THEN
 IF t.status<>required_status OR required_status='offered' AND app.governance_now()>=t.offer_expires_at OR required_status='accepted' AND app.governance_now()>=t.due_at THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='TASK_CLOSED';END IF;
 f:=app.external_candidate(who,t.packet_id,false);IF required_status='accepted' AND f->'committeeNameMatch'='true' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='COMMITTEE_VERIFICATION_HOLD';END IF;IF f->>'institution'<>t.institution_id::text THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INSTITUTION_CHANGED';END IF;
 PERFORM app.external_packet(t.packet_id);
 END IF;
 RETURN t;
END $$;
CREATE FUNCTION app.external_event(t app.external_review_assignments,who uuid,operation text,cid uuid,old_state text,assessment uuid DEFAULT NULL,total_value integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE ev uuid:=gen_random_uuid();c app.evaluation_cases;a app.users;
BEGIN
 SELECT * INTO c FROM app.evaluation_cases WHERE id=t.case_id;SELECT * INTO a FROM app.users WHERE id=who;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,project_id,version_id,action,object_type,object_id,before_state,after_state,correlation_id,event_key,occurred_at) VALUES(ev,who,a.role_code,CASE WHEN who IS NULL THEN 'system' ELSE 'user' END,c.university_id,c.project_id,c.version_id,CASE WHEN who IS NULL THEN 'system.external-review.' ELSE 'external-review.' END||operation,'external_assignment',t.id,jsonb_build_object('scope',old_state),jsonb_build_object('scope',jsonb_build_object('state',t.status,'case',t.case_id,'packet',t.packet_id,'reviewer',t.reviewer_id,'expires',t.offer_expires_at,'due',t.due_at,'declarations',t.declarations,'closure',t.closure_code,'assessment',assessment,'quarterPoints',total_value)::text),cid,gen_random_uuid(),app.governance_now());
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 IF operation<>'save' THEN INSERT INTO app.notifications(event_id,recipient_id,type,payload,created_at) VALUES(ev,t.reviewer_id,'external-review.'||operation,jsonb_build_object('route','/reviewer/tasks/'||t.id,'message_key','external-review.'||operation),app.governance_now());END IF;
 RETURN ev;
END $$;
CREATE FUNCTION app.external_policy_register(run uuid,kind_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF kind_value NOT IN ('technical-fixture-v1','scheduler-v1') OR run IS NULL OR kind_value='technical-fixture-v1' AND left(current_database(),14)<>'capstone_test_' AND current_database()<>'capstone_local' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='UNTRUSTED_ALLOCATION';END IF;
 INSERT INTO app.external_policy_runs(id,kind) VALUES(run,kind_value) ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM app.external_policy_runs WHERE id=run AND kind=kind_value) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='RUN_CONFLICT';END IF;
END $$;
CREATE FUNCTION app.external_offer(reviewer uuid,packet uuid,run uuid,slot_value integer,cid uuid,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE f jsonb;t app.external_review_assignments;prepared jsonb;n integer;ev uuid;now_value timestamptz(3):=app.governance_now();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(reviewer::text,29));
 IF cid IS NULL OR slot_value NOT BETWEEN 1 AND 10 OR NOT EXISTS(SELECT 1 FROM app.external_policy_runs WHERE id=run) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='UNTRUSTED_ALLOCATION';END IF;
 f:=app.external_candidate(reviewer,packet,true);prepared:=app.external_packet(packet);
 SELECT * INTO t FROM app.external_review_assignments WHERE case_id=(prepared->'manifest'->>'case')::uuid AND reviewer_id=reviewer;
 IF FOUND THEN IF t.policy_run_id=run AND t.packet_id=packet AND t.slot=slot_value THEN RETURN jsonb_build_object('assignment',t.id,'status',t.status,'replayed',true);END IF;RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='DUPLICATE_REVIEWER';END IF;
 SELECT count(*) INTO n FROM app.external_review_assignments WHERE reviewer_id=reviewer AND status IN ('offered','accepted');IF n>=2 OR f->'committeeNameMatch'='true' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='CAPACITY_OR_VERIFICATION_HOLD';END IF;
 IF NOT commit_value THEN RETURN prepared;END IF;
 INSERT INTO app.external_review_assignments(case_id,packet_id,reviewer_id,institution_id,policy_run_id,slot,status,offered_at,offer_expires_at) VALUES((prepared->'manifest'->>'case')::uuid,packet,reviewer,(f->>'institution')::uuid,run,slot_value,'offered',now_value,now_value+interval '7 days') RETURNING * INTO t;
 ev:=app.external_event(t,NULL,'offer',cid,NULL);PERFORM app.reminder_register(t.offer_reminder,reviewer,'review-offer',t.offer_expires_at);
 RETURN jsonb_build_object('assignment',t.id,'status',t.status);
END $$;
REVOKE ALL ON FUNCTION app.external_packet(uuid),app.external_candidate(uuid,uuid,boolean),app.external_live(uuid,uuid,uuid,text),app.external_event(app.external_review_assignments,uuid,text,uuid,text,uuid,integer),app.external_policy_register(uuid,text),app.external_offer(uuid,uuid,uuid,integer,uuid,boolean) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_policy_register(uuid,text),app.external_offer(uuid,uuid,uuid,integer,uuid,boolean) TO capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.external_form(body jsonb,packet uuid,complete boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE x jsonb;l jsonb;m jsonb;seen text[]:=ARRAY[]::text[];q integer:=0;lev integer;ref text;
BEGIN
 SELECT manifest INTO m FROM app.academic_review_packets WHERE id=packet;
 IF jsonb_typeof(body)<>'object' OR body - ARRAY['criteria','overall','calibration']<>'{}'::jsonb OR jsonb_typeof(body->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'criteria')>4 OR jsonb_typeof(body->'overall') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'overall'))>2000 OR jsonb_typeof(body->'calibration') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FORM';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(body->'criteria') LOOP
 IF jsonb_typeof(x)<>'object' OR x - ARRAY['code','level','comment','locators']<>'{}'::jsonb OR coalesce(x->>'code','') NOT IN ('E1','E2','E3','E4') OR x->>'code'=ANY(seen) OR jsonb_typeof(x->'comment') IS DISTINCT FROM 'string' OR char_length(btrim(x->>'comment'))>1000 OR jsonb_typeof(x->'locators') IS DISTINCT FROM 'array' OR jsonb_array_length(x->'locators')>20 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CRITERION';END IF;
 seen:=array_append(seen,x->>'code');lev:=NULL;
 IF x->'level' IS DISTINCT FROM 'null'::jsonb THEN IF jsonb_typeof(x->'level') IS DISTINCT FROM 'number' OR (x->>'level') !~ '^[0-4]$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LEVEL';END IF;lev:=(x->>'level')::integer;END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(x->'locators') LOOP
 ref:=btrim(normalize(l->>'reference',NFC));
 IF jsonb_typeof(l)<>'object' OR l - ARRAY['file','kind','reference']<>'{}'::jsonb OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(ref) NOT BETWEEN 1 AND 200 OR ref ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m->'entries') e WHERE e->>'id'=l->>'file') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LOCATOR';END IF;
 IF l->>'kind' IN ('page','lines') THEN IF ref !~ '^[1-9]\d*(-[1-9]\d*)?$' OR length(ref)>17 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_RANGE';END IF;IF split_part(ref,'-',1)::numeric>10000000 OR coalesce(nullif(split_part(ref,'-',2),''),split_part(ref,'-',1))::numeric NOT BETWEEN split_part(ref,'-',1)::numeric AND 10000000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_RANGE';END IF;END IF;
 END LOOP;
 IF complete AND (lev IS NULL OR jsonb_array_length(x->'locators')=0 OR lev IN (0,4) AND char_length(btrim(x->>'comment'))<20) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INCOMPLETE_CRITERION';END IF;
 q:=q+coalesce(lev,0)*CASE x->>'code' WHEN 'E1' THEN 30 WHEN 'E2' THEN 25 WHEN 'E3' THEN 25 ELSE 20 END;
 END LOOP;
 IF complete AND (cardinality(seen)<>4 OR char_length(btrim(body->>'overall'))<50 OR body->'calibration'<>'true'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INCOMPLETE_FORM';END IF;
 RETURN q;
END $$;
CREATE FUNCTION app.external_view(who uuid,sid uuid,aid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE a app.users;t app.external_review_assignments;items jsonb;item jsonb;record_value jsonb;p jsonb;d app.external_review_drafts;assessment app.external_assessments;
BEGIN
 a:=app.partner_access_principal(who,sid);IF a.role_code<>'faculty_supervisor' THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.external_review_assignments WHERE id=aid AND reviewer_id=who) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 items:='[]';
 FOR t IN SELECT * FROM app.external_review_assignments WHERE reviewer_id=who AND (aid IS NULL OR id=aid) ORDER BY offered_at DESC,id LOOP
 SELECT jsonb_build_object('title',v.title,'abstract',v.abstract,'domain',v.domain,'version',v.id,'versionNumber',v.version_number) INTO p FROM app.academic_review_packets ap JOIN app.project_versions v ON v.id=ap.version_id WHERE ap.id=t.packet_id;
 SELECT * INTO d FROM app.external_review_drafts WHERE assignment_id=t.id;
 item:=jsonb_build_object('id',t.id,'case',t.case_id,'packet',t.packet_id,'status',t.status,'offeredAt',t.offered_at,'expiresAt',t.offer_expires_at,'acceptedAt',t.accepted_at,'dueAt',t.due_at,'completedAt',t.completed_at,'closedAt',t.closed_at,'closure',t.closure_code,'project',p,'revision',coalesce(d.revision,0));
 -- Public pointer changes never retarget this task's identity.
 item:=item||jsonb_build_object('context',(SELECT jsonb_build_object('project',project_id,'version',version_id,'submission',submission_id) FROM app.academic_review_packets WHERE id=t.packet_id),'manifest',(SELECT manifest FROM app.academic_review_packets WHERE id=t.packet_id));
 IF aid IS NOT NULL THEN
 item:=item||jsonb_build_object('draft',CASE WHEN t.status='accepted' THEN d.body ELSE NULL END);
 IF t.status='completed' THEN
 SELECT * INTO assessment FROM app.external_assessments WHERE assignment_id=t.id;
 record_value:=jsonb_build_object('id',assessment.id,'rubric',assessment.rubric_code,'total',assessment.quarter_points::numeric/4,'finalizedAt',assessment.finalized_at,'overall',assessment.overall_comment,'criteria',(SELECT jsonb_agg(jsonb_build_object('code',s.code,'level',s.level,'comment',s.comment,'locators',(SELECT jsonb_agg(jsonb_build_object('file',l.file_id,'kind',l.kind,'reference',l.reference) ORDER BY ordinal) FROM app.external_evidence_locators l WHERE l.assessment_id=s.assessment_id AND l.code=s.code)) ORDER BY s.code) FROM app.external_criterion_scores s WHERE s.assessment_id=assessment.id));item:=item||jsonb_build_object('assessment',record_value);
 END IF;
 END IF;
 items:=items||jsonb_build_array(item);
 END LOOP;
 RETURN CASE WHEN aid IS NULL THEN jsonb_build_object('items',items,'serverTime',app.governance_now()) ELSE items->0||jsonb_build_object('serverTime',app.governance_now()) END;
END $$;
CREATE FUNCTION app.external_command(who uuid,sid uuid,aid uuid,operation text,expected integer,body jsonb,cid uuid,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE t app.external_review_assignments;old_state text;receipt app.command_receipts;dig text;ev uuid;result jsonb;d app.external_review_drafts;prepared jsonb;now_value timestamptz(3):=app.governance_now();q integer;assessment uuid:=gen_random_uuid();x jsonb;l jsonb;ord integer;f jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text,29));
 t:=app.external_live(who,sid,aid,NULL);old_state:=t.status;
 IF cid IS NULL OR expected IS NULL OR expected<0 OR operation NOT IN ('accept','decline','withdraw','inability','save','finalize') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_COMMAND';END IF;
 dig:=app.packet_hash(jsonb_build_array(aid,operation,expected,body));SELECT * INTO receipt FROM app.command_receipts WHERE actor_id=who AND command_id=cid;
 IF FOUND THEN IF receipt.action<>'external-review.'||operation OR receipt.payload_digest<>dig THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('completed',(receipt.result->>'scope')::jsonb);END IF;
 IF operation IN ('decline','withdraw','inability') THEN
 IF operation='decline' AND t.status<>'offered' OR operation IN ('withdraw','inability') AND t.status<>'accepted' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='TASK_CLOSED';END IF;
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
 INSERT INTO app.external_assessments(id,assignment_id,case_id,submission_id,reviewer_id,rubric_hash,quarter_points,overall_comment,calibration_ack,finalized_at) SELECT assessment,t.id,t.case_id,(prepared->'manifest'->>'submission')::uuid,who,config_hash,q,btrim(body->>'overall'),true,now_value FROM app.rubric_versions WHERE code='EXTERNAL_V1';
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
END $$;
REVOKE ALL ON FUNCTION app.external_form(jsonb,uuid,boolean),app.external_view(uuid,uuid,uuid),app.external_command(uuid,uuid,uuid,text,integer,jsonb,uuid,boolean) FROM PUBLIC,capstone_jobs;
REVOKE ALL ON FUNCTION app.external_form(jsonb,uuid,boolean) FROM capstone_runtime;
GRANT EXECUTE ON FUNCTION app.external_view(uuid,uuid,uuid),app.external_command(uuid,uuid,uuid,text,integer,jsonb,uuid,boolean) TO capstone_runtime;

INSERT INTO app.rubric_versions(code,kind,schema_version,config,config_hash) SELECT 'EXTERNAL_V1','external',1,v,encode(sha256(convert_to(v::text,'UTF8')),'hex') FROM (SELECT '{"code": "EXTERNAL_V1", "kind": "external", "schemaVersion": 1, "criteria": [{"code": "E1", "weight": 30, "label": {"en": "Innovation and Originality", "ar": "الابتكار والأصالة"}, "description": {"en": "State the contribution and compare it against at least two relevant prior works, alternatives, or established practices; distinguish adaptation, combination, and a new contribution using evidence. A justified improvement or context-specific adaptation can be valuable. Do not require proof that nobody worldwide has used the idea; comparison evidence must be in the assessed snapshot.", "ar": "حدد المساهمة وقارنها بعملين سابقين أو بديلين أو ممارستين معتمدتين على الأقل وميز بالأدلة بين التكييف والتركيب والمساهمة الجديدة. التحسين المبرر أو التكييف السياقي ذو قيمة؛ لا تشترط إثبات الأسبقية العالمية وتوجد المقارنة في اللقطة المقيمة."}, "anchors": [{"level": 0, "en": "No identifiable contribution evidence.", "ar": "لا توجد أدلة مساهمة قابلة للتحديد."}, {"level": 1, "en": "Contribution is claimed but not distinguished from prior work.", "ar": "المساهمة مدعاة لكنها غير مميزة عن الأعمال السابقة."}, {"level": 2, "en": "A clear adaptation or improvement is identified against relevant alternatives.", "ar": "تكييف أو تحسين واضح محدد مقابل بدائل ذات صلة."}, {"level": 3, "en": "A justified distinctive combination, approach or improvement is supported by the comparison.", "ar": "تركيبة أو منهج أو تحسين مميز ومبرر تدعمه المقارنة."}, {"level": 4, "en": "The contribution’s advantage or new insight is demonstrated against the documented alternatives, without unsupported world-first claims.", "ar": "إثبات ميزة المساهمة أو الرؤية الجديدة مقابل البدائل الموثقة دون ادعاءات غير مدعومة بالأسبقية العالمية."}]}, {"code": "E2", "weight": 25, "label": {"en": "Methodological / Disciplinary Rigor", "ar": "الصرامة المنهجية والتخصصية"}, "description": {"en": "Explain the selected method, material assumptions, and key design/research decisions; justify why the approach fits the problem and identify appropriate alternatives. Evidence: methods/design section and decision rationale. Use disciplinary norms rather than requiring software engineering for every project. Evaluate decisions supported in the submitted evidence, not later promises.", "ar": "اشرح المنهج والافتراضات الجوهرية وقرارات التصميم أو البحث الأساسية وبرر ملاءمته وحدد البدائل المناسبة. الأدلة: قسم المنهج أو التصميم ومبررات القرارات. اتبع أعراف التخصص دون اشتراط هندسة البرمجيات؛ قيّم القرارات المدعومة في اللقطة لا الوعود اللاحقة."}, "anchors": [{"level": 0, "en": "No defensible method.", "ar": "لا توجد منهجية يمكن الدفاع عنها."}, {"level": 1, "en": "Method named but unsuitable or largely unexplained.", "ar": "المنهجية مسماة لكنها غير مناسبة أو غير مشروحة إلى حد كبير."}, {"level": 2, "en": "Suitable method with basic steps and material assumptions documented.", "ar": "منهجية مناسبة مع توثيق الخطوات الأساسية والافتراضات الجوهرية."}, {"level": 3, "en": "Key choices and relevant alternatives are justified with coherent disciplinary reasoning.", "ar": "تبرير الخيارات الأساسية والبدائل ذات الصلة باستدلال تخصصي متماسك."}, {"level": 4, "en": "The reasoning is consistently supported, critical assumptions are examined, and trade-offs/limitations are evidenced.", "ar": "الاستدلال مدعوم باستمرار مع فحص الافتراضات الحاسمة وإثبات المفاضلات والقيود."}]}, {"code": "E3", "weight": 25, "label": {"en": "Validation and Evidence", "ar": "التحقق والأدلة"}, "description": {"en": "Report at least one suitable validation activity with method, data or observations, explicit success conditions, results, and limitations; trace each core claim to the evidence that tests it. Validation depth is proportionate to the project and discipline; no fixed national sample size is imposed. Results and procedures must be recorded in the assessed version.", "ar": "وثق نشاط تحقق مناسباً واحداً على الأقل يتضمن المنهج والبيانات أو الملاحظات وشروط النجاح والنتائج والقيود واربط كل ادعاء أساسي بدليل اختباره. يتناسب عمق التحقق مع المشروع والتخصص دون حجم عينة وطني ثابت؛ يجب توثيق النتائج والإجراءات في النسخة المقيمة."}, "anchors": [{"level": 0, "en": "Claims have no validation evidence.", "ar": "لا توجد أدلة تحقق للادعاءات."}, {"level": 1, "en": "Assertions or an isolated demonstration without a clear method or result record.", "ar": "تأكيدات أو عرض منفرد دون منهجية واضحة أو سجل نتائج."}, {"level": 2, "en": "A suitable validation activity records procedure and results for the main output.", "ar": "نشاط تحقق مناسب يوثق الإجراءات والنتائج للمخرج الرئيسي."}, {"level": 3, "en": "Core claims are tested against stated success conditions; results, failures and limitations are reported.", "ar": "اختبار الادعاءات الأساسية مقابل شروط النجاح المعلنة مع الإبلاغ عن النتائج والفشل والقيود."}, {"level": 4, "en": "Validation is repeatable, critically analyzed, and supported by a suitable baseline, triangulation, or robustness check.", "ar": "التحقق قابل للتكرار ومحلل نقدياً ومدعوم بخط أساس مناسب أو تثليث الأدلة أو فحص المتانة."}]}, {"code": "E4", "weight": 20, "label": {"en": "Impact and Practical Relevance", "ar": "الأثر والأهمية العملية"}, "description": {"en": "Identify at least one beneficiary and plausible use context; support the claimed benefit with a stakeholder observation, measured outcome, reasoned analysis, or feasibility evidence. Academic, social, environmental, or practical benefit qualifies; commercial potential is not mandatory. Distinguish demonstrated benefit from projected benefit at the evidence cutoff.", "ar": "حدد مستفيداً واحداً على الأقل وسياق استخدام معقولاً وادعم الفائدة بملاحظة صاحب مصلحة أو نتيجة مقاسة أو تحليل معلل أو دليل جدوى. تقبل الفائدة الأكاديمية والاجتماعية والبيئية والعملية دون اشتراط التجارة؛ ميز الفائدة المثبتة من المتوقعة عند موعد التسليم."}, "anchors": [{"level": 0, "en": "No plausible beneficiary or use.", "ar": "لا يوجد مستفيد أو استخدام معقول."}, {"level": 1, "en": "Benefit is vague or unsupported.", "ar": "الفائدة غامضة أو غير مدعومة."}, {"level": 2, "en": "A beneficiary, realistic use context and reasoned benefit are identified.", "ar": "تحديد مستفيد وسياق استخدام واقعي وفائدة معللة."}, {"level": 3, "en": "Stakeholder evidence, measured benefit or credible feasibility analysis supports the stated use.", "ar": "أدلة أصحاب المصلحة أو الفائدة المقاسة أو تحليل جدوى موثوق يدعم الاستخدام المعلن."}, {"level": 4, "en": "The benefit is demonstrated or strongly substantiated in context, with adoption/resource limitations and possible adverse effects considered.", "ar": "الفائدة مثبتة أو مدعومة بقوة في السياق مع مراعاة قيود التبني والموارد والآثار السلبية المحتملة."}]}], "calibration": {"en": "Choose the highest descriptor fully supported by frozen evidence. A suitable validation activity with recorded procedure and results supports C4 level 2; stated success conditions, tested core claims, failures and limitations support level 3. Counts alone do not establish exemplary quality. All level 2 gives 50; all level 3 gives 75. These are repository scores, not course grades. Common anchors support consistent use without establishing inter-rater reliability.", "ar": "اختر أعلى وصف تدعمه الأدلة المجمدة بالكامل. نشاط تحقق مناسب يوثق الإجراءات والنتائج يدعم المستوى 2 في C4؛ شروط النجاح المعلنة واختبار الادعاءات الأساسية والفشل والقيود تدعم المستوى 3. العدد وحده لا يثبت الجودة النموذجية. جميع المستويات 2 تعطي 50 وجميع المستويات 3 تعطي 75. هذه درجات المستودع وليست درجات المقرر. تدعم الأوصاف المشتركة اتساق الاستخدام دون إثبات موثوقية الاتفاق بين المقيمين."}}'::jsonb v) q;
--> statement-breakpoint
ALTER FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) RENAME TO file_delivery_read_pre_external;
REVOKE ALL ON FUNCTION app.file_delivery_read_pre_external(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.file_delivery_read(kind text,reader uuid,sid uuid,pid uuid,vid uuid,fid uuid,sub uuid,capability uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.external_review_assignments;r app.academic_review_packets;prepared jsonb;result jsonb;
BEGIN
 IF kind IS DISTINCT FROM 'review-packet' THEN RETURN app.file_delivery_read_pre_external(kind,reader,sid,pid,vid,fid,sub,capability);END IF;
 t:=app.external_live(reader,sid,capability,'accepted');SELECT * INTO r FROM app.academic_review_packets WHERE id=t.packet_id;
 IF r.project_id<>pid OR r.version_id<>vid OR sub IS NOT NULL AND sub<>r.submission_id THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 prepared:=app.external_packet(r.id);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',sf.file_id,'project',pid,'version',vid,'path',sf.relative_path,'name',regexp_replace(sf.relative_path,'^.*/',''),'extension',sf.extension_at_submit,'mime',sf.mime_at_submit,'size',sf.size_at_submit,'sha256',sf.sha256_at_submit,'visibility',f.visibility,'status','ready')||CASE WHEN fid IS NOT NULL THEN jsonb_build_object('key',o.storage_key) ELSE '{}'::jsonb END ORDER BY sf.relative_path COLLATE "C",sf.file_id),'[]') INTO result FROM app.submission_files sf JOIN app.project_files f ON f.id=sf.file_id JOIN app.storage_objects o ON o.id=sf.storage_object_id WHERE sf.submission_id=r.submission_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.manifest->'entries') e WHERE e->>'id'=sf.file_id::text) AND (fid IS NULL OR sf.file_id=fid);
 IF fid IS NOT NULL AND jsonb_array_length(result)<>1 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN CASE WHEN fid IS NULL THEN jsonb_build_object('files',result) ELSE result->0||jsonb_build_object('packetIntegrity',prepared->'files') END;
END $$;
REVOKE ALL ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.external_concealed(who uuid,sid uuid,pid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 PERFORM app.partner_access_principal(who,sid);
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('project',p.project_id,'version',p.version_id)),'[]') FROM app.external_review_assignments t JOIN app.academic_review_packets p ON p.id=t.packet_id WHERE t.reviewer_id=who AND t.status<>'completed' AND (pid IS NULL OR p.project_id=pid));
END $$;
REVOKE ALL ON FUNCTION app.external_concealed(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_concealed(uuid,uuid,uuid) TO capstone_runtime;
CREATE FUNCTION app.external_invalidate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.external_review_assignments;code_value text;ev uuid;
BEGIN
 code_value:=CASE TG_TABLE_NAME WHEN 'academic_packet_revocations' THEN 'packet-revoked' WHEN 'reviewer_profiles' THEN 'profile-invalid' WHEN 'universities' THEN 'institution-invalid' ELSE 'account-invalid' END;
 FOR t IN SELECT * FROM app.external_review_assignments WHERE status IN ('offered','accepted') AND (CASE TG_TABLE_NAME WHEN 'academic_packet_revocations' THEN packet_id=(to_jsonb(NEW)->>'packet_id')::uuid WHEN 'universities' THEN institution_id=(to_jsonb(NEW)->>'id')::uuid AND to_jsonb(NEW)->>'status'<>'active' WHEN 'reviewer_profiles' THEN reviewer_id=(to_jsonb(NEW)->>'user_id')::uuid AND (to_jsonb(NEW)->>'status'<>'approved' OR to_jsonb(NEW)->>'institution_id' IS DISTINCT FROM to_jsonb(OLD)->>'institution_id') ELSE reviewer_id=(to_jsonb(NEW)->>'id')::uuid AND (to_jsonb(NEW)->>'account_status'<>'active' OR to_jsonb(NEW)->>'role_code'<>'faculty_supervisor' OR to_jsonb(NEW)->>'university_id' IS DISTINCT FROM to_jsonb(OLD)->>'university_id' OR to_jsonb(NEW)->>'full_name' IS DISTINCT FROM to_jsonb(OLD)->>'full_name' AND EXISTS(SELECT 1 FROM app.internal_assessments ia CROSS JOIN LATERAL jsonb_array_elements_text(ia.member_names) n WHERE ia.case_id=external_review_assignments.case_id AND ia.layer='committee' AND lower(normalize(btrim(n),NFC))=lower(normalize(btrim(to_jsonb(NEW)->>'full_name'),NFC)))) END) ORDER BY id FOR UPDATE LOOP
 IF TG_TABLE_NAME='users' AND to_jsonb(NEW)->>'account_status'='active' AND to_jsonb(NEW)->>'role_code'='faculty_supervisor' AND to_jsonb(NEW)->>'university_id' IS NOT DISTINCT FROM to_jsonb(OLD)->>'university_id' THEN code_value:='committee-verification-hold';END IF;
 t.status:='cancelled';t.closed_at:=app.governance_now();t.closure_code:=code_value;
 UPDATE app.external_review_assignments SET status=t.status,closed_at=t.closed_at,closure_code=code_value WHERE id=t.id;
 PERFORM app.reminder_resolve(t.offer_reminder);PERFORM app.reminder_resolve(t.task_reminder);ev:=app.external_event(t,NULL,'cancel',gen_random_uuid(),'incomplete');
 END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER external_profile_invalidation AFTER UPDATE ON app.reviewer_profiles FOR EACH ROW EXECUTE FUNCTION app.external_invalidate();
CREATE TRIGGER external_account_invalidation AFTER UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.external_invalidate();
CREATE TRIGGER external_packet_invalidation AFTER INSERT ON app.academic_packet_revocations FOR EACH ROW EXECUTE FUNCTION app.external_invalidate();
REVOKE ALL ON FUNCTION app.external_invalidate() FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER FUNCTION app.reminder_deliver(uuid) RENAME TO reminder_deliver_pre_external;
REVOKE ALL ON FUNCTION app.reminder_deliver_pre_external(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.reminder_deliver(target uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t app.external_review_assignments;f jsonb;
BEGIN
 SELECT * INTO t FROM app.external_review_assignments WHERE offer_reminder=target OR task_reminder=target;
 IF t.id IS NOT NULL THEN
 IF t.offer_reminder=target AND t.status<>'offered' OR t.task_reminder=target AND t.status<>'accepted' THEN RETURN 'suppressed';END IF;
 BEGIN f:=app.external_candidate(t.reviewer_id,t.packet_id,false);PERFORM app.external_packet(t.packet_id);IF f->>'institution'<>t.institution_id::text THEN RETURN 'suppressed';END IF;EXCEPTION WHEN OTHERS THEN RETURN 'suppressed';END;
 END IF;
 RETURN app.reminder_deliver_pre_external(target);
END $$;
REVOKE ALL ON FUNCTION app.reminder_deliver(uuid) FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.reminder_deliver(uuid) TO capstone_jobs;
CREATE FUNCTION app.external_pending_reminders() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'deadline',r.deadline)),'[]') FROM app.reminder_targets r JOIN app.external_review_assignments t ON r.id IN (t.offer_reminder,t.task_reminder) WHERE r.resolved_at IS NULL AND r.deadline>app.governance_now() $$;
REVOKE ALL ON FUNCTION app.external_pending_reminders() FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.external_pending_reminders() TO capstone_jobs;
ALTER FUNCTION app.notice_link(app.notifications) RENAME TO notice_link_pre_external;
REVOKE ALL ON FUNCTION app.notice_link_pre_external(app.notifications) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.notice_link(n app.notifications) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE aid uuid;
BEGIN
 IF n.type LIKE 'external-review.%' THEN SELECT object_id INTO aid FROM app.audit_logs WHERE id=n.event_id;END IF;
 IF n.type IN ('reminder.review-offer','reminder.review-task') THEN SELECT t.id INTO aid FROM app.external_review_assignments t JOIN app.reminder_targets r ON r.id IN (t.offer_reminder,t.task_reminder) WHERE r.event_id=n.event_id;END IF;
 IF aid IS NOT NULL THEN RETURN jsonb_build_object('kind','review-task','id',aid);END IF;
 RETURN app.notice_link_pre_external(n);
END $$;
REVOKE ALL ON FUNCTION app.notice_link(app.notifications) FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER FUNCTION app.notice_target(uuid,uuid,uuid) RENAME TO notice_target_pre_external;
REVOKE ALL ON FUNCTION app.notice_target_pre_external(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.notice_target(reader uuid,sid uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE n app.notifications;l jsonb;
BEGIN
 PERFORM app.partner_access_principal(reader,sid);SELECT * INTO n FROM app.notifications WHERE id=target AND recipient_id=reader;l:=app.notice_link(n);
 IF l->>'kind'='review-task' THEN PERFORM app.external_live(reader,sid,(l->>'id')::uuid,NULL);RETURN l;END IF;
 RETURN app.notice_target_pre_external(reader,sid,target);
END $$;
REVOKE ALL ON FUNCTION app.notice_target(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.notice_target(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.external_projection(pid uuid,who uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE v jsonb;
BEGIN
 v:=app.publication_projection(pid);
 IF who IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(app.external_concealed(who,sid,pid)) t WHERE t->>'version'=v->>'version') THEN v:=v-ARRAY['internal','rubric'];END IF;RETURN v;
END $$;
CREATE FUNCTION app.external_catalogue(input jsonb,who uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE v jsonb;hidden jsonb;items jsonb;
BEGIN
 v:=app.catalogue_query(input);IF who IS NOT NULL THEN hidden:=app.external_concealed(who,sid);
 SELECT coalesce(jsonb_agg(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(hidden) t WHERE t->>'version'=item->>'version') THEN item-ARRAY['internal','rubric'] ELSE item END ORDER BY ordinal),'[]') INTO items FROM jsonb_array_elements(v->'items') WITH ORDINALITY a(item,ordinal);v:=jsonb_set(v,'{items}',items);END IF;RETURN v;
END $$;
REVOKE ALL ON FUNCTION app.external_projection(uuid,uuid,uuid),app.external_catalogue(jsonb,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_projection(uuid,uuid,uuid),app.external_catalogue(jsonb,uuid,uuid) TO capstone_runtime;

ALTER TABLE app.external_review_assignments ADD UNIQUE(id,case_id,reviewer_id);
ALTER TABLE app.external_assessments ADD FOREIGN KEY(assignment_id,case_id,reviewer_id) REFERENCES app.external_review_assignments(id,case_id,reviewer_id);
--> statement-breakpoint
-- Finite expiry mechanics only; systematic polling/replacement remains Phase31.
CREATE FUNCTION app.external_expire(aid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE t app.external_review_assignments;ev uuid;old_state text;
BEGIN
 SELECT * INTO t FROM app.external_review_assignments WHERE id=aid FOR UPDATE;
 IF t.id IS NULL OR cid IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF t.status='expired' THEN RETURN jsonb_build_object('assignment',t.id,'status',t.status);END IF;
 IF t.status NOT IN ('offered','accepted') OR app.governance_now()<(CASE WHEN t.status='offered' THEN t.offer_expires_at ELSE t.due_at END) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='NOT_EXPIRED';END IF;
 old_state:=t.status;t.status:='expired';t.closed_at:=app.governance_now();t.closure_code:='deadline';UPDATE app.external_review_assignments SET status=t.status,closed_at=t.closed_at,closure_code=t.closure_code WHERE id=t.id;
 PERFORM app.reminder_resolve(t.offer_reminder);PERFORM app.reminder_resolve(t.task_reminder);ev:=app.external_event(t,NULL,'expire',cid,old_state);RETURN jsonb_build_object('assignment',t.id,'status',t.status);
END $$;
REVOKE ALL ON FUNCTION app.external_expire(uuid,uuid) FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.external_expire(uuid,uuid) TO capstone_jobs;

CREATE FUNCTION app.external_task_readiness(who uuid,sid uuid,aid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE t app.external_review_assignments;BEGIN t:=app.external_live(who,sid,aid,'accepted');RETURN app.external_packet(t.packet_id);END $$;
REVOKE ALL ON FUNCTION app.external_task_readiness(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_task_readiness(uuid,uuid,uuid) TO capstone_runtime;

CREATE TRIGGER external_institution_invalidation AFTER UPDATE ON app.universities FOR EACH ROW EXECUTE FUNCTION app.external_invalidate();
CREATE FUNCTION app.external_reminder_evidence(target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE t app.external_review_assignments;BEGIN SELECT * INTO t FROM app.external_review_assignments WHERE target IN (offer_reminder,task_reminder);IF t.id IS NULL THEN RETURN '[]';END IF;PERFORM app.external_candidate(t.reviewer_id,t.packet_id,false);RETURN app.external_packet(t.packet_id)->'files';EXCEPTION WHEN insufficient_privilege OR no_data_found OR check_violation THEN RETURN NULL;END $$;
REVOKE ALL ON FUNCTION app.external_reminder_evidence(uuid) FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.external_reminder_evidence(uuid) TO capstone_jobs;

CREATE FUNCTION app.external_locator_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM app.external_assessments a JOIN app.external_review_assignments t ON t.id=a.assignment_id JOIN app.academic_review_packets p ON p.id=t.packet_id CROSS JOIN LATERAL jsonb_array_elements(p.manifest->'entries') e WHERE a.id=NEW.assessment_id AND e->>'id'=NEW.file_id::text) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='OUTSIDE_PACKET';END IF;RETURN NEW;END $$;
CREATE TRIGGER external_locator_manifest BEFORE INSERT ON app.external_evidence_locators FOR EACH ROW EXECUTE FUNCTION app.external_locator_guard();
REVOKE ALL ON FUNCTION app.external_locator_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
