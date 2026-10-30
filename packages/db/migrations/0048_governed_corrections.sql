-- Phase32 owner-approved governance; all predecessor migrations remain immutable.
CREATE TABLE app.assessment_issues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),logical_id uuid NOT NULL,layer text NOT NULL CHECK(layer IN ('supervisor','committee','external')),
 type text NOT NULL CHECK(type IN ('transcription_error','missing_evidence','identity_integrity','undeclared_conflict','internal_disagreement','access_integrity')),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','amendment_authorized','corrected','invalidated','explained','resolved_retained')),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 20 AND 2000),evidence jsonb NOT NULL,created_by uuid REFERENCES app.users(id),created_kind text NOT NULL DEFAULT 'user' CHECK(created_kind IN ('user','system')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((created_kind='user')=(created_by IS NOT NULL)),authorized_by uuid REFERENCES app.users(id),authorized_at timestamptz,resolved_by uuid REFERENCES app.users(id),resolved_at timestamptz,resolution text,resolution_kind text,
 expected_head uuid NOT NULL,revision integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX one_detected_discrepancy ON app.assessment_issues(case_id,(evidence->>'supervisorHead'),(evidence->>'committeeHead')) WHERE type='internal_disagreement' AND created_kind='system';
CREATE UNIQUE INDEX one_pending_amendment ON app.assessment_issues(logical_id) WHERE state='amendment_authorized';
CREATE TABLE app.assessment_issue_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),issue_id uuid NOT NULL REFERENCES app.assessment_issues(id),actor_id uuid REFERENCES app.users(id),operation text NOT NULL,reason text NOT NULL,evidence jsonb NOT NULL,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE app.assessment_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),logical_id uuid NOT NULL,case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),layer text NOT NULL CHECK(layer IN ('supervisor','committee','external')),
 supersedes_id uuid NOT NULL UNIQUE,issue_id uuid NOT NULL UNIQUE REFERENCES app.assessment_issues(id),revision integer NOT NULL CHECK(revision>0),
 evaluator_id uuid NOT NULL REFERENCES app.users(id),rubric_code text NOT NULL REFERENCES app.rubric_versions(code),rubric_hash text NOT NULL,payload jsonb NOT NULL,
 quarter_points integer NOT NULL CHECK(quarter_points BETWEEN 0 AND 400),finalized_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(logical_id,revision)
);
CREATE TABLE app.assessment_invalidations(logical_id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),issue_id uuid NOT NULL UNIQUE REFERENCES app.assessment_issues(id),confirmed_by uuid NOT NULL REFERENCES app.users(id),reason text NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE app.evaluation_holds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),issue_id uuid NOT NULL UNIQUE REFERENCES app.assessment_issues(id),case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),version_id uuid NOT NULL REFERENCES app.project_versions(id),type text NOT NULL CHECK(type IN ('assessment_integrity','evidence_integrity','internal_disagreement','access_integrity')),state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','resolved')),created_by uuid NOT NULL REFERENCES app.users(id),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),resolved_by uuid REFERENCES app.users(id),resolved_at timestamptz,resolution_kind text CHECK(resolution_kind IN ('original_evaluator_amendment','confirmed_invalidation','institutional_explanation','verified_evidence_restoration','verified_access_restoration','retained_original')),resolution text,policy_run uuid);
CREATE TABLE app.evaluation_governance_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),policy_code text NOT NULL,config_hash text NOT NULL,inputs jsonb NOT NULL,outputs jsonb NOT NULL,executed_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(policy_code,config_hash) REFERENCES app.evaluation_policies(code,config_hash));
CREATE TABLE app.evaluation_governance_projection(case_id uuid PRIMARY KEY REFERENCES app.evaluation_cases(id),inputs_hash text NOT NULL,outputs jsonb NOT NULL,last_run uuid NOT NULL REFERENCES app.evaluation_governance_runs(id));
CREATE TABLE app.evaluation_discrepancy_explanations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),supervisor_head uuid NOT NULL,committee_head uuid NOT NULL,issue_id uuid NOT NULL REFERENCES app.assessment_issues(id),explanation text NOT NULL,recorded_by uuid NOT NULL REFERENCES app.users(id),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(case_id,supervisor_head,committee_head));
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['assessment_issue_history','assessment_revisions','assessment_invalidations','evaluation_governance_runs','evaluation_discrepancy_explanations'] LOOP EXECUTE format('CREATE TRIGGER immutable_governance BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.immutable_record()',n);END LOOP;
FOREACH n IN ARRAY ARRAY['assessment_issues','assessment_issue_history','assessment_revisions','assessment_invalidations','evaluation_holds','evaluation_governance_runs','evaluation_governance_projection','evaluation_discrepancy_explanations'] LOOP EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,capstone_runtime,capstone_jobs',n);END LOOP;END $$;
--> statement-breakpoint
CREATE VIEW app.logical_assessments AS
 SELECT id,case_id,layer,recorded_by evaluator_id,rubric_code,rubric_hash,submission_id,NULL::uuid assignment_id FROM app.internal_assessments
 UNION ALL SELECT id,case_id,'external',reviewer_id,rubric_code,rubric_hash,submission_id,assignment_id FROM app.external_assessments;
CREATE VIEW app.assessment_heads AS SELECT o.*,coalesce(r.id,o.id) head_id,coalesce(r.revision,0) revision FROM app.logical_assessments o LEFT JOIN LATERAL(SELECT id,revision FROM app.assessment_revisions WHERE logical_id=o.id ORDER BY revision DESC LIMIT 1) r ON true;
CREATE VIEW app.current_internal_assessments AS
 SELECT (jsonb_populate_record(NULL::app.internal_assessments,to_jsonb(o)||CASE WHEN r.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('id',r.id,'quarter_points',r.quarter_points,'overall_comment',r.payload->>'overall','recorded_at',r.finalized_at,'finalized_at',r.finalized_at,'member_names',r.payload->'members','assessed_on',r.payload->>'assessedOn','attestation',r.payload->'attestation') END)).*
 FROM app.internal_assessments o LEFT JOIN LATERAL(SELECT * FROM app.assessment_revisions WHERE logical_id=o.id ORDER BY revision DESC LIMIT 1) r ON true WHERE NOT EXISTS(SELECT 1 FROM app.assessment_invalidations WHERE logical_id=o.id);
CREATE VIEW app.current_external_assessments AS
 SELECT (jsonb_populate_record(NULL::app.external_assessments,to_jsonb(o)||CASE WHEN r.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('id',r.id,'quarter_points',r.quarter_points,'overall_comment',r.payload->>'overall','finalized_at',r.finalized_at) END)).*
 FROM app.external_assessments o LEFT JOIN LATERAL(SELECT * FROM app.assessment_revisions WHERE logical_id=o.id ORDER BY revision DESC LIMIT 1) r ON true WHERE NOT EXISTS(SELECT 1 FROM app.assessment_invalidations WHERE logical_id=o.id);
CREATE VIEW app.current_internal_criterion_scores AS SELECT * FROM app.internal_criterion_scores UNION ALL SELECT r.id,c->>'code',(c->>'level')::integer,c->>'comment' FROM app.assessment_revisions r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'criteria') c WHERE r.layer<>'external';
CREATE VIEW app.current_external_criterion_scores AS SELECT * FROM app.external_criterion_scores UNION ALL SELECT r.id,c->>'code',(c->>'level')::integer,c->>'comment' FROM app.assessment_revisions r CROSS JOIN LATERAL jsonb_array_elements(r.payload->'criteria') c WHERE r.layer='external';
CREATE VIEW app.current_internal_evidence_locators AS SELECT * FROM app.internal_evidence_locators UNION ALL SELECT ec.university_id,ec.project_id,ec.version_id,ec.submission_id,r.id,c->>'code',l.ordinal::integer,(l.value->>'file')::uuid,l.value->>'kind',l.value->>'reference' FROM app.assessment_revisions r JOIN app.evaluation_cases ec ON ec.id=r.case_id CROSS JOIN LATERAL jsonb_array_elements(r.payload->'criteria') c CROSS JOIN LATERAL jsonb_array_elements(c->'locators') WITH ORDINALITY l(value,ordinal) WHERE r.layer<>'external';
CREATE VIEW app.current_external_evidence_locators AS SELECT * FROM app.external_evidence_locators UNION ALL SELECT r.id,c->>'code',l.ordinal::integer,(l.value->>'file')::uuid,l.value->>'kind',l.value->>'reference',ec.submission_id FROM app.assessment_revisions r JOIN app.evaluation_cases ec ON ec.id=r.case_id CROSS JOIN LATERAL jsonb_array_elements(r.payload->'criteria') c CROSS JOIN LATERAL jsonb_array_elements(c->'locators') WITH ORDINALITY l(value,ordinal) WHERE r.layer='external';
CREATE VIEW app.current_internal_disagreements AS SELECT ec.id,ec.id case_id,s.id supervisor_id,c.id committee_id,'internal_disagreement'::text kind,greatest(s.finalized_at,c.finalized_at) created_at FROM app.evaluation_cases ec JOIN app.current_internal_assessments s ON s.case_id=ec.id AND s.layer='supervisor' JOIN app.current_internal_assessments c ON c.case_id=ec.id AND c.layer='committee' WHERE abs(s.quarter_points-c.quarter_points)>=60 OR EXISTS(SELECT 1 FROM app.current_internal_criterion_scores sc JOIN app.current_internal_criterion_scores cc ON cc.code=sc.code WHERE sc.assessment_id=s.id AND cc.assessment_id=c.id AND abs(sc.level-cc.level)>=2);
REVOKE ALL ON app.logical_assessments,app.assessment_heads,app.current_internal_assessments,app.current_external_assessments,app.current_internal_criterion_scores,app.current_external_criterion_scores,app.current_internal_evidence_locators,app.current_external_evidence_locators,app.current_internal_disagreements FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.correction_form(body jsonb,logical uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE o app.logical_assessments;c jsonb;l jsonb;lev integer;seen text[]:='{}';names text[]:='{}';n text;ref text;q integer:=0;packet uuid;
BEGIN
 SELECT * INTO o FROM app.logical_assessments WHERE id=logical;
 IF o.id IS NULL THEN RAISE EXCEPTION 'ASSESSMENT_NOT_FOUND';END IF;
 IF translate(body->>'overall',E'\n\t\r','') ~ '[[:cntrl:]‪-‮⁦-⁩]' OR EXISTS(SELECT 1 FROM jsonb_array_elements(body->'criteria') x WHERE translate(x->>'comment',E'\n\t\r','') ~ '[[:cntrl:]‪-‮⁦-⁩]') THEN RAISE EXCEPTION 'INVALID_TEXT';END IF;
 IF o.layer='external' THEN SELECT packet_id INTO packet FROM app.external_review_assignments WHERE id=o.assignment_id;RETURN app.external_form(body,packet,true);END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR body-ARRAY['layer','criteria','overall','calibration','members','assessedOn','attestation']<>'{}'::jsonb OR body->>'layer' IS DISTINCT FROM o.layer OR body->'calibration' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(body->'overall') IS DISTINCT FROM 'string' OR char_length(app.evaluation_trim(body->>'overall')) NOT BETWEEN 50 AND 2000 OR jsonb_typeof(body->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'criteria')<>7 THEN RAISE EXCEPTION 'INVALID_ASSESSMENT';END IF;
 IF o.layer='committee' THEN
 IF jsonb_typeof(body->'members') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'members')<2 OR body->'attestation' IS DISTINCT FROM 'true'::jsonb OR coalesce(body->>'assessedOn','') !~ '^\d{4}-\d{2}-\d{2}$' OR (body->>'assessedOn')::date>(clock_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'INVALID_COMMITTEE';END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(body->'members') LOOP n:=lower(regexp_replace(app.evaluation_trim(normalize(c#>>'{}',NFKC)),'[[:space:]]+',' ','g'));IF jsonb_typeof(c)<>'string' OR n='' OR n=ANY(names) THEN RAISE EXCEPTION 'INVALID_MEMBERS';END IF;names:=array_append(names,n);END LOOP;
 ELSE IF body->'members' IS DISTINCT FROM '[]'::jsonb OR body->'assessedOn' IS DISTINCT FROM 'null'::jsonb OR body->'attestation' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'INVALID_PROVENANCE';END IF;END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(body->'criteria') LOOP
 IF jsonb_typeof(c)<>'object' OR c-ARRAY['code','level','comment','locators']<>'{}'::jsonb OR coalesce(c->>'code','') !~ '^C[1-7]$' OR c->>'code'=ANY(seen) OR jsonb_typeof(c->'level') IS DISTINCT FROM 'number' OR (c->>'level') !~ '^[0-4]$' OR jsonb_typeof(c->'comment') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'locators') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'locators')<1 THEN RAISE EXCEPTION 'INVALID_CRITERION';END IF;
 seen:=array_append(seen,c->>'code');lev:=(c->>'level')::integer;
 IF char_length(app.evaluation_trim(c->>'comment'))>1000 OR lev IN (0,4) AND char_length(app.evaluation_trim(c->>'comment'))<20 THEN RAISE EXCEPTION 'INVALID_COMMENT';END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(c->'locators') LOOP ref:=app.evaluation_trim(l->>'reference');
 IF jsonb_typeof(l)<>'object' OR l-ARRAY['file','kind','reference']<>'{}'::jsonb OR coalesce(l->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(l->'reference') IS DISTINCT FROM 'string' OR char_length(ref) NOT BETWEEN 1 AND 200 OR ref ~ '[[:cntrl:]‪-‮⁦-⁩]' OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=o.submission_id AND file_id=(l->>'file')::uuid) THEN RAISE EXCEPTION 'INVALID_LOCATOR';END IF;
 IF l->>'kind' IN ('page','lines') THEN IF ref !~ '^[1-9]\d*(-[1-9]\d*)?$' OR length(ref)>17 THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;IF split_part(ref,'-',1)::numeric>10000000 OR coalesce(nullif(split_part(ref,'-',2),''),split_part(ref,'-',1))::numeric NOT BETWEEN split_part(ref,'-',1)::numeric AND 10000000 THEN RAISE EXCEPTION 'INVALID_RANGE';END IF;END IF;
 END LOOP;
 q:=q+(ARRAY[10,20,20,20,15,10,5])[(substring(c->>'code' FROM 2))::integer]*lev;
 END LOOP;RETURN q;
END $$;
CREATE FUNCTION app.revision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE h app.assessment_heads;i app.assessment_issues;BEGIN
 SELECT * INTO h FROM app.assessment_heads WHERE id=NEW.logical_id;SELECT * INTO i FROM app.assessment_issues WHERE id=NEW.issue_id;
 IF h.id IS NULL OR h.case_id IS DISTINCT FROM NEW.case_id OR h.layer IS DISTINCT FROM NEW.layer OR h.evaluator_id IS DISTINCT FROM NEW.evaluator_id OR h.rubric_code IS DISTINCT FROM NEW.rubric_code OR h.rubric_hash IS DISTINCT FROM NEW.rubric_hash OR NEW.revision<>h.revision+1 OR NEW.supersedes_id<>h.head_id OR i.logical_id<>h.id OR i.state<>'amendment_authorized' OR i.expected_head<>h.head_id OR EXISTS(SELECT 1 FROM app.assessment_invalidations WHERE logical_id=h.id) OR NEW.quarter_points<>app.correction_form(NEW.payload,h.id) THEN RAISE EXCEPTION 'BROKEN_SUPERSESSION';END IF;RETURN NEW;END $$;
CREATE TRIGGER assessment_revision_guard BEFORE INSERT ON app.assessment_revisions FOR EACH ROW EXECUTE FUNCTION app.revision_guard();
REVOKE ALL ON FUNCTION app.correction_form(jsonb,uuid),app.revision_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;

--> statement-breakpoint
-- Forward refresh of the finite current-score readers; no original writers are replaced.
DO $$ DECLARE f record;d text; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN ('progression_tick','allocation_snapshot','allocation_commit','allocation_view','external_offer','external_view','evaluation_read','publication_projection','publication_state','publication_prepare','publication_commit') LOOP
 d:=pg_get_functiondef(f.oid);
 d:=replace(replace(replace(d,'app.internal_assessments','app.current_internal_assessments'),'app.internal_criterion_scores','app.current_internal_criterion_scores'),'app.internal_evidence_locators','app.current_internal_evidence_locators');
 d:=replace(replace(replace(d,'app.external_assessments','app.current_external_assessments'),'app.external_criterion_scores','app.current_external_criterion_scores'),'app.external_evidence_locators','app.current_external_evidence_locators');
 d:=replace(d,'app.internal_evaluation_issues','app.current_internal_disagreements');
 IF d LIKE '%FUNCTION app.progression_tick(%' THEN
 d:=replace(d,'slot_value:=num+1;',$rewrite$SELECT gs INTO slot_value FROM generate_series(3,10) gs WHERE NOT EXISTS(SELECT 1 FROM app.external_review_assignments slot_task WHERE slot_task.case_id=c.id AND slot_task.slot=gs AND (slot_task.status IN ('offered','accepted') OR EXISTS(SELECT 1 FROM app.current_external_assessments ca WHERE ca.assignment_id=slot_task.id))) ORDER BY gs LIMIT 1;$rewrite$);
 d:=replace(d,$rewrite$status IN ('offered','accepted','completed')) ORDER BY s LIMIT 1$rewrite$,$rewrite$(status IN ('offered','accepted') OR status='completed' AND EXISTS(SELECT 1 FROM app.current_external_assessments ca WHERE ca.assignment_id=app.external_review_assignments.id))) ORDER BY s LIMIT 1$rewrite$);
 END IF;
 IF d LIKE '%FUNCTION app.external_offer(%' THEN d:=replace(d,$rewrite$slot=slot_value AND status IN ('offered','accepted','completed')$rewrite$,$rewrite$slot=slot_value AND (status IN ('offered','accepted') OR EXISTS(SELECT 1 FROM app.current_external_assessments ca WHERE ca.assignment_id=app.external_review_assignments.id))$rewrite$);END IF;
 IF d LIKE '%FUNCTION app.allocation_snapshot(%' THEN
 d:=replace(d,$rewrite$'completed',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND status='completed')$rewrite$,$rewrite$'completed',(SELECT count(*) FROM app.current_external_assessments WHERE case_id=c.id)$rewrite$);
 d:=replace(d,$rewrite$case_id=c.id AND status IN ('offered','accepted','completed')$rewrite$,$rewrite$case_id=c.id AND (status IN ('offered','accepted') OR EXISTS(SELECT 1 FROM app.current_external_assessments ca WHERE ca.assignment_id=app.external_review_assignments.id))$rewrite$);
 END IF;
 EXECUTE d;
 END LOOP;
END $$;
ALTER TABLE app.evaluation_allocation_prerequisites ADD COLUMN legacy_hold boolean NOT NULL DEFAULT false;
UPDATE app.evaluation_allocation_prerequisites SET legacy_hold=hold;
DO $$ BEGIN IF left(current_database(),14)<>'capstone_test_' AND EXISTS(SELECT 1 FROM app.evaluation_allocation_prerequisites WHERE legacy_hold) THEN RAISE EXCEPTION 'LEGACY_HOLD_PROVENANCE_REQUIRED';END IF;END $$;
CREATE FUNCTION app.governance_event(who uuid,c app.evaluation_cases,operation text,object uuid,cid uuid,state_value text,recipient uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE ev uuid:=gen_random_uuid();role_value text;BEGIN
 SELECT role_code INTO role_value FROM app.users WHERE id=who;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,project_id,version_id,action,object_type,object_id,after_state,correlation_id,event_key,occurred_at) VALUES(ev,who,role_value,CASE WHEN who IS NULL THEN 'system' ELSE 'user' END,c.university_id,c.project_id,c.version_id,CASE WHEN who IS NULL THEN 'system.evaluation.governance.' ELSE 'evaluation.governance.' END||operation,'evaluation_issue',object,jsonb_build_object('scope',jsonb_build_object('case',c.id,'state',state_value)::text),cid,ev,clock_timestamp());
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 IF recipient IS NOT NULL THEN INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(ev,recipient,c.university_id,c.project_id,'evaluation.governance.'||operation,jsonb_build_object('message_key','evaluation.governance.'||operation,'link',jsonb_build_object('kind','evaluation-governance','id',object)));END IF;RETURN ev;
END $$;
CREATE FUNCTION app.governance_refresh(cid uuid,who uuid DEFAULT NULL,command uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.evaluation_cases;s app.current_internal_assessments;cm app.current_internal_assessments;inputs_value jsonb;output_value jsonb;digest_value text;run_id uuid;disagreement boolean;explained boolean;held boolean;n integer;sumq integer;minq integer;maxq integer;recipient record;ev uuid;automatic_id uuid;automatic_issue record;explanation_record record;previously_released boolean;
BEGIN
 SELECT * INTO c FROM app.evaluation_cases WHERE id=cid;SELECT * INTO s FROM app.current_internal_assessments WHERE case_id=cid AND layer='supervisor';SELECT * INTO cm FROM app.current_internal_assessments WHERE case_id=cid AND layer='committee';
 disagreement:=EXISTS(SELECT 1 FROM app.current_internal_disagreements WHERE case_id=cid);
 explained:=EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id);
 IF disagreement AND NOT explained THEN
 INSERT INTO app.assessment_issues(case_id,logical_id,layer,type,reason,evidence,created_by,created_kind,expected_head)
 SELECT cid,h.id,'committee','internal_disagreement','Current supervisor and committee assessments differ; an institutional explanation is required.',jsonb_build_object('supervisorHead',s.id,'committeeHead',cm.id),NULL,'system',cm.id FROM app.assessment_heads h WHERE h.head_id=cm.id
 ON CONFLICT DO NOTHING RETURNING id INTO automatic_id;
 IF automatic_id IS NOT NULL THEN
 INSERT INTO app.assessment_issue_history(issue_id,actor_id,operation,reason,evidence) VALUES(automatic_id,NULL,'issue','Current internal discrepancy detected under CORE_V1.',jsonb_build_object('supervisorHead',s.id,'committeeHead',cm.id));
 PERFORM app.governance_event(NULL,c,'issue',automatic_id,gen_random_uuid(),'open');
 END IF;
 END IF;
 IF explained THEN
 SELECT * INTO explanation_record FROM app.evaluation_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id;
 FOR automatic_issue IN SELECT * FROM app.assessment_issues WHERE case_id=cid AND created_kind='system' AND type='internal_disagreement' AND state='open' AND evidence->>'supervisorHead'=s.id::text AND evidence->>'committeeHead'=cm.id::text FOR UPDATE LOOP
 UPDATE app.assessment_issues SET state='explained',resolved_by=explanation_record.recorded_by,resolved_at=explanation_record.recorded_at,resolution=explanation_record.explanation,resolution_kind='institutional_explanation',revision=revision+1 WHERE id=automatic_issue.id;
 INSERT INTO app.assessment_issue_history(issue_id,actor_id,operation,reason,evidence) VALUES(automatic_issue.id,explanation_record.recorded_by,'explain',explanation_record.explanation,jsonb_build_object('explanation',explanation_record.id));
 PERFORM app.governance_event(NULL,c,'explain',automatic_issue.id,explanation_record.id,'explained');
 END LOOP;
 END IF;
 held:=EXISTS(SELECT 1 FROM app.evaluation_holds WHERE case_id=cid AND state='open') OR coalesce((SELECT legacy_hold FROM app.evaluation_allocation_prerequisites WHERE case_id=cid),false);
 INSERT INTO app.evaluation_allocation_prerequisites(case_id,hold,explanation) VALUES(cid,held,CASE WHEN explained THEN (SELECT explanation FROM app.evaluation_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id) ELSE NULL END) ON CONFLICT(case_id) DO UPDATE SET hold=EXCLUDED.hold,explanation=EXCLUDED.explanation;
 SELECT count(*),coalesce(sum(quarter_points),0),min(quarter_points),max(quarter_points) INTO n,sumq,minq,maxq FROM app.current_external_assessments WHERE case_id=cid;
 inputs_value:=jsonb_build_object('heads',(SELECT coalesce(jsonb_agg(jsonb_build_object('logical',h.id,'head',h.head_id,'invalidated',iv.logical_id IS NOT NULL) ORDER BY h.id),'[]') FROM app.assessment_heads h LEFT JOIN app.assessment_invalidations iv ON iv.logical_id=h.id WHERE h.case_id=cid),'holds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]') FROM app.evaluation_holds WHERE case_id=cid AND state='open'),'explained',explained,'current',EXISTS(SELECT 1 FROM app.projects WHERE id=c.project_id AND published_version_id=c.version_id));
 output_value:=jsonb_build_object('supervisor',s.quarter_points,'committee',cm.quarter_points,'internalNumerator',2*s.quarter_points+3*cm.quarter_points,'internalDenominator',20,'discrepancy',disagreement,'explained',explained,'hold',held,'n',n,'sumQuarterPoints',sumq,'minQuarterPoints',minq,'maxQuarterPoints',maxq,'feedbackReleased',n>=2,'corrected',EXISTS(SELECT 1 FROM app.assessment_revisions WHERE case_id=cid),'aggregateChanged',EXISTS(SELECT 1 FROM app.assessment_revisions r LEFT JOIN app.internal_assessments ia ON ia.id=r.logical_id LEFT JOIN app.external_assessments ea ON ea.id=r.logical_id WHERE r.case_id=cid AND r.quarter_points<>coalesce(ia.quarter_points,ea.quarter_points)) OR EXISTS(SELECT 1 FROM app.assessment_invalidations WHERE case_id=cid));
 previously_released:=coalesce((SELECT (outputs->>'feedbackReleased')::boolean FROM app.evaluation_governance_projection WHERE case_id=cid),false);
 digest_value:=encode(sha256(convert_to(jsonb_build_array(inputs_value,output_value)::text,'UTF8')),'hex');
 SELECT last_run INTO run_id FROM app.evaluation_governance_projection WHERE case_id=cid AND inputs_hash=digest_value;IF run_id IS NOT NULL THEN RETURN run_id;END IF;
 run_id:=gen_random_uuid();INSERT INTO app.evaluation_governance_runs SELECT run_id,cid,code,config_hash,inputs_value,output_value,clock_timestamp() FROM app.evaluation_policies WHERE code='EVAL_POLICY_V1';
 INSERT INTO app.evaluation_governance_projection VALUES(cid,digest_value,output_value,run_id) ON CONFLICT(case_id) DO UPDATE SET inputs_hash=EXCLUDED.inputs_hash,outputs=EXCLUDED.outputs,last_run=EXCLUDED.last_run;
 UPDATE app.evaluation_case_admissions SET eligible=false,reasons='["governance_refresh_pending"]' WHERE case_id=cid;
 ev:=app.governance_event(who,c,'refresh',c.id,coalesce(command,run_id),'refreshed');
 IF n>=2 OR previously_released THEN FOR recipient IN SELECT user_id FROM app.project_authors WHERE project_id=c.project_id LOOP
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload) VALUES(ev,recipient.user_id,c.university_id,c.project_id,'evaluation.governance.feedback',jsonb_build_object('message_key','evaluation.governance.feedback','link',jsonb_build_object('kind','evaluation-feedback','id',c.id)));END LOOP;END IF;
 RETURN run_id;
END $$;
REVOKE ALL ON FUNCTION app.governance_event(uuid,app.evaluation_cases,text,uuid,uuid,text,uuid),app.governance_refresh(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.governance_command(who uuid,sid uuid,operation text,body jsonb,command uuid,commit_value boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;c app.evaluation_cases;i app.assessment_issues;h app.assessment_heads;receipt app.command_receipts;digest_value text;result jsonb;reason_value text:=body->>'reason';authority boolean;ev uuid;new_id uuid;q integer;run_id uuid;kind text;files jsonb;
BEGIN
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
 SELECT jsonb_agg(jsonb_build_object('key',so.storage_key,'size',so.size_bytes,'sha256',so.sha256) ORDER BY so.id) INTO files FROM app.submission_files sf JOIN app.storage_objects so ON so.id=sf.storage_object_id AND so.university_id=sf.university_id AND so.project_id=sf.project_id WHERE sf.submission_id=h.submission_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'form'->'criteria') criterion CROSS JOIN LATERAL jsonb_array_elements(criterion->'locators') locator WHERE locator->>'file'=sf.file_id::text);
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
 IF NOT authority OR h.layer='external' OR i.type<>'internal_disagreement' OR i.state<>'open' OR NOT EXISTS(SELECT 1 FROM app.current_internal_disagreements WHERE case_id=c.id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='EXPLANATION_FORBIDDEN';END IF;
 INSERT INTO app.evaluation_discrepancy_explanations(case_id,supervisor_head,committee_head,issue_id,explanation,recorded_by) SELECT c.id,s.id,cm.id,i.id,reason_value,who FROM app.current_internal_assessments s JOIN app.current_internal_assessments cm ON cm.case_id=s.case_id AND cm.layer='committee' WHERE s.case_id=c.id AND s.layer='supervisor';
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
END $$;
REVOKE ALL ON FUNCTION app.governance_command(uuid,uuid,text,jsonb,uuid,boolean) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_command(uuid,uuid,text,jsonb,uuid,boolean) TO capstone_runtime;

--> statement-breakpoint
CREATE FUNCTION app.assessment_payload(aid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE result jsonb;o app.logical_assessments;BEGIN
 SELECT payload INTO result FROM app.assessment_revisions WHERE id=aid;IF result IS NOT NULL THEN RETURN result;END IF;
 SELECT * INTO o FROM app.logical_assessments WHERE id=aid;
 IF o.layer='external' THEN
 SELECT jsonb_build_object('criteria',(SELECT jsonb_agg(jsonb_build_object('code',c.code,'level',c.level,'comment',c.comment,'locators',(SELECT jsonb_agg(jsonb_build_object('file',l.file_id,'kind',l.kind,'reference',l.reference) ORDER BY ordinal) FROM app.external_evidence_locators l WHERE l.assessment_id=a.id AND l.code=c.code)) ORDER BY c.code) FROM app.external_criterion_scores c WHERE c.assessment_id=a.id),'overall',a.overall_comment,'calibration',a.calibration_ack) INTO result FROM app.external_assessments a WHERE id=aid;
 ELSE
 SELECT jsonb_build_object('layer',a.layer,'criteria',(SELECT jsonb_agg(jsonb_build_object('code',c.code,'level',c.level,'comment',c.comment,'locators',(SELECT jsonb_agg(jsonb_build_object('file',l.file_id,'kind',l.kind,'reference',l.reference) ORDER BY ordinal) FROM app.internal_evidence_locators l WHERE l.assessment_id=a.id AND l.code=c.code)) ORDER BY c.code) FROM app.internal_criterion_scores c WHERE c.assessment_id=a.id),'overall',a.overall_comment,'calibration',a.calibration_ack,'members',a.member_names,'assessedOn',a.assessed_on,'attestation',a.attestation) INTO result FROM app.internal_assessments a WHERE id=aid;
 END IF;RETURN result;
END $$;
CREATE FUNCTION app.governance_view(who uuid,sid uuid,case_value uuid DEFAULT NULL,issue_value uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;cases_value jsonb;issues_value jsonb;assessments_value jsonb;
BEGIN
 a:=app.partner_access_principal(who,sid);
 IF a.role_code NOT IN ('university_admin','platform_admin','faculty_supervisor') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 IF issue_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.assessment_issues i JOIN app.logical_assessments l ON l.id=i.logical_id JOIN app.evaluation_cases c ON c.id=i.case_id WHERE i.id=issue_value AND (a.role_code='platform_admin' OR a.role_code='university_admin' AND c.university_id=a.university_id OR a.role_code='faculty_supervisor' AND l.evaluator_id=who AND i.authorized_at IS NOT NULL)) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(q.value ORDER BY q.created_at DESC),'[]') INTO cases_value FROM (SELECT c.created_at,jsonb_build_object('case',c.id,'project',c.project_id,'version',c.version_id,'title',v.title,'current',p.published_version_id=c.version_id,'projection',gp.outputs,'run',gp.last_run,'progression',pr.state) value FROM app.evaluation_cases c JOIN app.project_versions v ON v.id=c.version_id JOIN app.projects p ON p.id=c.project_id LEFT JOIN app.evaluation_governance_projection gp ON gp.case_id=c.id LEFT JOIN app.evaluation_progression pr ON pr.case_id=c.id WHERE (case_value IS NULL OR c.id=case_value) AND (a.role_code='platform_admin' OR a.role_code='university_admin' AND c.university_id=a.university_id) ORDER BY c.created_at DESC LIMIT 100) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('logical',h.id,'head',h.head_id,'revision',h.revision,'case',h.case_id,'layer',h.layer,'evaluator',h.evaluator_id,'invalidated',EXISTS(SELECT 1 FROM app.assessment_invalidations WHERE logical_id=h.id),'rubric',h.rubric_code,'rubricDefinition',(SELECT config FROM app.rubric_versions WHERE code=h.rubric_code AND config_hash=h.rubric_hash),'score',coalesce((SELECT quarter_points FROM app.assessment_revisions WHERE id=h.head_id),(SELECT quarter_points FROM app.internal_assessments WHERE id=h.id),(SELECT quarter_points FROM app.external_assessments WHERE id=h.id))::numeric/4,'payload',app.assessment_payload(h.head_id),'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'supersedes_id',r.supersedes_id,'issue',r.issue_id,'finalizedAt',r.finalized_at,'quarterPoints',r.quarter_points,'payload',r.payload) ORDER BY r.revision),'[]') FROM app.assessment_revisions r WHERE r.logical_id=h.id),'original',app.assessment_payload(h.id),'evidenceChoices',CASE WHEN h.layer='external' THEN (SELECT jsonb_agg(jsonb_build_object('id',sf.file_id,'path',sf.relative_path)) FROM app.external_review_assignments t JOIN app.academic_review_packets ap ON ap.id=t.packet_id JOIN app.submission_files sf ON sf.submission_id=ap.submission_id WHERE t.id=h.assignment_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(ap.manifest->'entries') entry WHERE entry->>'id'=sf.file_id::text)) ELSE (SELECT jsonb_agg(jsonb_build_object('id',sf.file_id,'path',sf.relative_path)) FROM app.submission_files sf WHERE sf.submission_id=h.submission_id) END) ORDER BY h.layer,h.id),'[]') INTO assessments_value FROM app.assessment_heads h JOIN app.evaluation_cases c ON c.id=h.case_id WHERE (case_value IS NULL OR c.id=case_value) AND (issue_value IS NULL OR EXISTS(SELECT 1 FROM app.assessment_issues WHERE id=issue_value AND logical_id=h.id)) AND (a.role_code='platform_admin' OR a.role_code='university_admin' AND c.university_id=a.university_id OR a.role_code='faculty_supervisor' AND h.evaluator_id=who AND EXISTS(SELECT 1 FROM app.assessment_issues WHERE logical_id=h.id AND authorized_at IS NOT NULL));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'case',i.case_id,'logical',i.logical_id,'layer',i.layer,'type',i.type,'state',i.state,'reason',i.reason,'evidence',i.evidence,'createdBy',i.created_by,'createdKind',i.created_kind,'createdAt',i.created_at,'authorizedBy',i.authorized_by,'authorizedAt',i.authorized_at,'resolvedAt',i.resolved_at,'resolution',i.resolution,'resolutionKind',i.resolution_kind,'revision',i.revision,'expectedHead',h.head_id,'hold',(SELECT to_jsonb(eh) FROM app.evaluation_holds eh WHERE eh.issue_id=i.id),'history',(SELECT jsonb_agg(to_jsonb(ih) ORDER BY ih.occurred_at,ih.id) FROM app.assessment_issue_history ih WHERE ih.issue_id=i.id)) ORDER BY i.created_at DESC),'[]') INTO issues_value FROM app.assessment_issues i JOIN app.assessment_heads h ON h.id=i.logical_id JOIN app.evaluation_cases c ON c.id=i.case_id WHERE (case_value IS NULL OR c.id=case_value) AND (issue_value IS NULL OR i.id=issue_value) AND (a.role_code='platform_admin' OR a.role_code='university_admin' AND c.university_id=a.university_id OR a.role_code='faculty_supervisor' AND h.evaluator_id=who AND i.authorized_at IS NOT NULL);
 RETURN jsonb_build_object('cases',cases_value,'assessments',assessments_value,'issues',issues_value);
END $$;
CREATE FUNCTION app.feedback_redact(value text,cid uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE r record;s text:=value;token text;BEGIN
 FOR r IN SELECT u.full_name,u.email,u.id::text uid,un.name_en,un.name_ar,t.id::text assignment FROM app.external_review_assignments t JOIN app.users u ON u.id=t.reviewer_id JOIN app.universities un ON un.id=t.institution_id WHERE t.case_id=cid LOOP
 FOREACH token IN ARRAY ARRAY[r.full_name,r.email,r.uid,r.name_en,r.name_ar,r.assignment] LOOP IF char_length(token)>=3 THEN s:=replace(s,token,'[…]');END IF;END LOOP;
 END LOOP;
 FOR r IN SELECT jsonb_array_elements_text(a.member_names) member FROM app.internal_assessments a WHERE a.case_id=cid UNION SELECT jsonb_array_elements_text(ar.payload->'members') FROM app.assessment_revisions ar WHERE ar.case_id=cid AND ar.layer='committee' LOOP IF char_length(r.member)>=3 THEN s:=replace(s,r.member,'[…]');END IF;END LOOP;
 s:=regexp_replace(s,'[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}','[…]','g');
 RETURN s;
END $$;
CREATE FUNCTION app.feedback_form(aid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE b jsonb;criteria_value jsonb;BEGIN
 b:=app.assessment_payload(aid);
 SELECT jsonb_agg(jsonb_build_object('code',c->>'code','level',c->'level','comment',app.feedback_redact(c->>'comment',cid),'locators',(SELECT jsonb_agg(jsonb_build_object('kind',l->>'kind','reference',app.feedback_redact(l->>'reference',cid))) FROM jsonb_array_elements(c->'locators') l)) ORDER BY c->>'code') INTO criteria_value FROM jsonb_array_elements(b->'criteria') c;
 RETURN jsonb_build_object('criteria',criteria_value,'overall',app.feedback_redact(b->>'overall',cid));
END $$;
CREATE FUNCTION app.author_feedback(who uuid,sid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE a app.users;c app.evaluation_cases;iv jsonb;ev jsonb;n integer;BEGIN
 a:=app.partner_access_principal(who,sid);SELECT * INTO c FROM app.evaluation_cases WHERE id=cid;
 IF c.id IS NULL OR a.role_code<>'student' OR NOT EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=c.project_id AND user_id=who) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT count(*) INTO n FROM app.current_external_assessments WHERE case_id=cid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('layer',ia.layer,'score',ia.quarter_points::numeric/4,'form',app.feedback_form(ia.id,cid),'corrected',EXISTS(SELECT 1 FROM app.assessment_revisions WHERE id=ia.id),'finalizedAt',ia.finalized_at) ORDER BY ia.layer),'[]') INTO iv FROM app.current_internal_assessments ia WHERE case_id=cid;
 ev:='[]';IF n>=2 THEN SELECT jsonb_agg(jsonb_build_object('label',ordinal,'score',e.quarter_points::numeric/4,'form',app.feedback_form(e.id,cid),'corrected',EXISTS(SELECT 1 FROM app.assessment_revisions WHERE id=e.id),'finalizedAt',e.finalized_at) ORDER BY ordinal) INTO ev FROM (SELECT ca.*,row_number() OVER(ORDER BY t.slot,t.offered_at,t.id) ordinal FROM app.current_external_assessments ca JOIN app.external_review_assignments t ON t.id=ca.assignment_id WHERE ca.case_id=cid) e;END IF;
 RETURN jsonb_build_object('case',cid,'version',c.version_id,'internal',iv,'external',ev,'externalReleased',n>=2,'corrected',EXISTS(SELECT 1 FROM app.assessment_revisions WHERE case_id=cid));
END $$;
REVOKE ALL ON FUNCTION app.assessment_payload(uuid),app.governance_view(uuid,uuid,uuid,uuid),app.feedback_redact(text,uuid),app.feedback_form(uuid,uuid),app.author_feedback(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_view(uuid,uuid,uuid,uuid),app.author_feedback(uuid,uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
CREATE FUNCTION app.public_correction_marker(pid uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ SELECT jsonb_build_object('corrected',EXISTS(SELECT 1 FROM app.assessment_revisions r WHERE r.case_id=c.id),'aggregateChanged',EXISTS(SELECT 1 FROM app.assessment_revisions r WHERE r.case_id=c.id) OR EXISTS(SELECT 1 FROM app.assessment_invalidations i WHERE i.case_id=c.id)) FROM app.projects p JOIN app.evaluation_cases c ON c.project_id=p.id AND c.version_id=p.published_version_id WHERE p.id=pid AND app.partner_archive_eligible(p.id,p.published_version_id) $$;
REVOKE ALL ON FUNCTION app.public_correction_marker(uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.public_correction_marker(uuid) TO capstone_runtime;

--> statement-breakpoint
-- Active slots are unique; completed invalid logical assessments remain historical.
DROP INDEX app.external_active_slot;
CREATE UNIQUE INDEX external_active_slot ON app.external_review_assignments(case_id,slot) WHERE status IN ('offered','accepted');
CREATE FUNCTION app.external_valid_slot_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE slot_value integer;BEGIN
 SELECT slot INTO slot_value FROM app.external_review_assignments WHERE id=NEW.assignment_id;
 IF (SELECT count(*) FROM app.current_external_assessments WHERE case_id=NEW.case_id)>=10 OR EXISTS(SELECT 1 FROM app.current_external_assessments ca JOIN app.external_review_assignments t ON t.id=ca.assignment_id WHERE ca.case_id=NEW.case_id AND t.slot=slot_value) THEN RAISE EXCEPTION 'VALID_SLOT_OCCUPIED';END IF;RETURN NEW;
END $$;
CREATE TRIGGER external_valid_slot_guard BEFORE INSERT ON app.external_assessments FOR EACH ROW EXECUTE FUNCTION app.external_valid_slot_guard();
REVOKE ALL ON FUNCTION app.external_valid_slot_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;

--> statement-breakpoint
CREATE FUNCTION app.assessment_feedback_refresh() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE cid uuid;total integer;BEGIN
 IF TG_TABLE_NAME='internal_criterion_scores' THEN SELECT case_id INTO cid FROM app.internal_assessments WHERE id=NEW.assessment_id;SELECT count(*) INTO total FROM app.internal_criterion_scores WHERE assessment_id=NEW.assessment_id;IF total=7 THEN PERFORM app.governance_refresh(cid);END IF;
 ELSE SELECT case_id INTO cid FROM app.external_assessments WHERE id=NEW.assessment_id;SELECT count(*) INTO total FROM app.external_criterion_scores WHERE assessment_id=NEW.assessment_id;IF total=4 THEN PERFORM app.governance_refresh(cid);END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER internal_feedback_refresh AFTER INSERT ON app.internal_criterion_scores FOR EACH ROW EXECUTE FUNCTION app.assessment_feedback_refresh();
CREATE TRIGGER external_feedback_refresh AFTER INSERT ON app.external_criterion_scores FOR EACH ROW EXECUTE FUNCTION app.assessment_feedback_refresh();
REVOKE ALL ON FUNCTION app.assessment_feedback_refresh() FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER FUNCTION app.notice_link(app.notifications) RENAME TO notice_link_pre_governance;
CREATE FUNCTION app.notice_link(n app.notifications) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN IF n.type LIKE 'evaluation.governance.%' AND n.payload->'link'->>'kind' IN ('evaluation-governance','evaluation-feedback') THEN RETURN n.payload->'link';END IF;RETURN app.notice_link_pre_governance(n);END $$;
ALTER FUNCTION app.notice_target(uuid,uuid,uuid) RENAME TO notice_target_pre_governance;
CREATE FUNCTION app.notice_target(reader uuid,sid uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE n app.notifications;l jsonb;BEGIN
 PERFORM app.partner_access_principal(reader,sid);SELECT * INTO n FROM app.notifications WHERE id=target AND recipient_id=reader;l:=app.notice_link(n);
 IF l->>'kind'='evaluation-governance' THEN PERFORM app.governance_view(reader,sid,NULL,(l->>'id')::uuid);RETURN l;END IF;
 IF l->>'kind'='evaluation-feedback' THEN PERFORM app.author_feedback(reader,sid,(l->>'id')::uuid);RETURN l;END IF;
 RETURN app.notice_target_pre_governance(reader,sid,target);
END $$;
REVOKE ALL ON FUNCTION app.notice_link_pre_governance(app.notifications),app.notice_link(app.notifications),app.notice_target_pre_governance(uuid,uuid,uuid),app.notice_target(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.notice_target(uuid,uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
CREATE TABLE app.assessment_logical_registry(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES app.evaluation_cases(id),layer text NOT NULL,evaluator_id uuid NOT NULL REFERENCES app.users(id),rubric_code text NOT NULL REFERENCES app.rubric_versions(code),rubric_hash text NOT NULL,submission_id uuid NOT NULL REFERENCES app.project_submissions(id),assignment_id uuid REFERENCES app.external_review_assignments(id),UNIQUE(id,case_id,layer),UNIQUE(id,case_id),UNIQUE(id,case_id,layer,evaluator_id,rubric_code,rubric_hash));
INSERT INTO app.assessment_logical_registry SELECT * FROM app.logical_assessments;
CREATE TRIGGER immutable_logical_identity BEFORE UPDATE OR DELETE ON app.assessment_logical_registry FOR EACH ROW EXECUTE FUNCTION app.immutable_record();
REVOKE ALL ON app.assessment_logical_registry FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.assessment_logical_register() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF TG_TABLE_NAME='internal_assessments' THEN INSERT INTO app.assessment_logical_registry VALUES(NEW.id,NEW.case_id,NEW.layer,NEW.recorded_by,NEW.rubric_code,NEW.rubric_hash,NEW.submission_id,NULL);
 ELSE INSERT INTO app.assessment_logical_registry VALUES(NEW.id,NEW.case_id,'external',NEW.reviewer_id,NEW.rubric_code,NEW.rubric_hash,NEW.submission_id,NEW.assignment_id);END IF;RETURN NEW;
END $$;
CREATE TRIGGER internal_logical_register AFTER INSERT ON app.internal_assessments FOR EACH ROW EXECUTE FUNCTION app.assessment_logical_register();
CREATE TRIGGER external_logical_register AFTER INSERT ON app.external_assessments FOR EACH ROW EXECUTE FUNCTION app.assessment_logical_register();
ALTER TABLE app.assessment_issues ADD FOREIGN KEY(logical_id,case_id,layer) REFERENCES app.assessment_logical_registry(id,case_id,layer);
ALTER TABLE app.assessment_revisions ADD FOREIGN KEY(logical_id,case_id,layer,evaluator_id,rubric_code,rubric_hash) REFERENCES app.assessment_logical_registry(id,case_id,layer,evaluator_id,rubric_code,rubric_hash);
ALTER TABLE app.assessment_invalidations ADD FOREIGN KEY(logical_id,case_id) REFERENCES app.assessment_logical_registry(id,case_id);
CREATE FUNCTION app.governance_scope_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF TG_TABLE_NAME='assessment_issues' THEN IF NEW.expected_head IS DISTINCT FROM (SELECT head_id FROM app.assessment_heads WHERE id=NEW.logical_id) THEN RAISE EXCEPTION 'STALE_ISSUE_HEAD';END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM app.assessment_issues i JOIN app.evaluation_cases c ON c.id=i.case_id WHERE i.id=NEW.issue_id AND i.case_id=NEW.case_id AND c.version_id=NEW.version_id) THEN RAISE EXCEPTION 'HOLD_SCOPE_MISMATCH';END IF;RETURN NEW;
END $$;
CREATE TRIGGER issue_scope_guard BEFORE INSERT ON app.assessment_issues FOR EACH ROW EXECUTE FUNCTION app.governance_scope_guard();
CREATE TRIGGER hold_scope_guard BEFORE INSERT ON app.evaluation_holds FOR EACH ROW EXECUTE FUNCTION app.governance_scope_guard();
REVOKE ALL ON FUNCTION app.assessment_logical_register(),app.governance_scope_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;

--> statement-breakpoint
CREATE FUNCTION app.governance_pointer_refresh() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE c record;BEGIN
 IF NEW.published_version_id IS DISTINCT FROM OLD.published_version_id THEN FOR c IN SELECT id FROM app.evaluation_cases WHERE project_id=NEW.id AND version_id IN (OLD.published_version_id,NEW.published_version_id) ORDER BY id LOOP PERFORM app.governance_refresh(c.id);END LOOP;END IF;RETURN NEW;
END $$;
CREATE TRIGGER governance_pointer_refresh AFTER UPDATE OF published_version_id ON app.projects FOR EACH ROW EXECUTE FUNCTION app.governance_pointer_refresh();
REVOKE ALL ON FUNCTION app.governance_pointer_refresh() FROM PUBLIC,capstone_runtime,capstone_jobs;

--> statement-breakpoint
ALTER TABLE app.evaluation_holds ADD FOREIGN KEY(policy_run) REFERENCES app.evaluation_governance_runs(id);
ALTER TABLE app.evaluation_holds ADD CHECK((state='open' AND resolved_by IS NULL AND resolved_at IS NULL AND resolution_kind IS NULL AND resolution IS NULL) OR (state='resolved' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND resolution_kind IS NOT NULL AND char_length(btrim(resolution)) BETWEEN 20 AND 2000));
CREATE FUNCTION app.hold_resolution_run_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN IF EXISTS(SELECT 1 FROM app.evaluation_holds WHERE id=NEW.id AND state='resolved' AND policy_run IS NULL) THEN RAISE EXCEPTION 'RESOLUTION_POLICY_RUN_REQUIRED';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER hold_resolution_run AFTER INSERT OR UPDATE ON app.evaluation_holds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.hold_resolution_run_guard();
REVOKE ALL ON FUNCTION app.hold_resolution_run_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
