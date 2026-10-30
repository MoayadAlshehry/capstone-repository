-- Numeric derived views preserve old rows exactly and never insert a forged integer committee form.
CREATE VIEW app.effective_internal_assessments AS
 SELECT id,university_id,project_id,version_id,submission_id,case_id,layer,rubric_code,rubric_hash,recorded_by,recorded_at,finalized_at,quarter_points::numeric,overall_comment,calibration_ack,member_names,assessed_on,attestation FROM app.current_internal_assessments
 UNION ALL
 SELECT r.id,c.university_id,c.project_id,c.version_id,c.submission_id,c.id,'committee'::text,c.rubric_code,rv.config_hash,NULL::uuid,r.finalized_at,r.finalized_at,r.mean_quarter_points,
 'System-computed aggregate of individually verified committee forms.'::text,true,
 (SELECT jsonb_agg(coalesce(nullif(i.display_name,''),'Verified committee member') ORDER BY i.id) FROM app.committee_invitations i WHERE i.case_id=c.id AND i.revoked_at IS NULL),
 (r.finalized_at AT TIME ZONE 'UTC')::date,false
 FROM app.current_committee_results r JOIN app.evaluation_cases c ON c.id=r.case_id JOIN app.rubric_versions rv ON rv.code=c.rubric_code;
CREATE VIEW app.effective_internal_criterion_scores AS
 SELECT assessment_id,code,level::numeric,comment FROM app.current_internal_criterion_scores
 UNION ALL SELECT r.id,j.key,j.value::numeric,'Derived display-only mean; not an individual integer rating.' FROM app.current_committee_results r CROSS JOIN LATERAL jsonb_each_text(r.criterion_means) j;
CREATE VIEW app.effective_internal_disagreements AS
 SELECT * FROM app.current_internal_disagreements
 UNION ALL
 SELECT c.id,c.id,s.id,r.id,'internal_disagreement',greatest(s.finalized_at,r.finalized_at)
 FROM app.evaluation_cases c JOIN app.current_internal_assessments s ON s.case_id=c.id AND s.layer='supervisor' JOIN app.current_committee_results r ON r.case_id=c.id
 WHERE abs(s.quarter_points-r.mean_quarter_points)>=60 OR EXISTS(
  SELECT 1 FROM app.current_committee_members a JOIN app.committee_invitations i ON i.id=a.invite_id AND i.revoked_at IS NULL CROSS JOIN LATERAL jsonb_array_elements(a.payload->'criteria') cr JOIN app.current_internal_criterion_scores sc ON sc.assessment_id=s.id AND sc.code=cr->>'code'
  WHERE a.case_id=c.id AND abs(sc.level-(cr->>'level')::integer)>=2);
REVOKE ALL ON app.effective_internal_assessments,app.effective_internal_criterion_scores,app.effective_internal_disagreements,app.current_committee_members,app.current_committee_results FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
-- Rebind the existing read/governance/publication projections to additive derived views.
-- Historical integer forms, payloads, correction heads and immutable policy-run rows are unchanged.
DO $$ DECLARE f record;d text;BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.prokind='f' AND (p.prosrc LIKE '%app.current_internal_assessments%' OR p.prosrc LIKE '%app.current_internal_criterion_scores%' OR p.prosrc LIKE '%app.current_internal_disagreements%') LOOP
  d:=pg_get_functiondef(f.oid);
  d:=replace(replace(replace(d,'app.current_internal_assessments','app.effective_internal_assessments'),'app.current_internal_criterion_scores','app.effective_internal_criterion_scores'),'app.current_internal_disagreements','app.effective_internal_disagreements');
  -- These are previously integer local variables, not stored historical columns.
  d:=replace(replace(replace(replace(d,'sq integer','sq numeric'),'cq integer','cq numeric'),'sup app.internal_assessments','sup app.effective_internal_assessments'),'com app.internal_assessments','com app.effective_internal_assessments');
  EXECUTE d;
 END LOOP;
END $$;
--> statement-breakpoint
-- From this migration onward no normal user can submit committee marks, even using old APIs.
ALTER FUNCTION app.evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text) RENAME TO evaluation_prepare_before_guest;
CREATE FUNCTION app.evaluation_prepare(reader uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,payload jsonb,command uuid,payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF payload->>'layer'='committee' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INDIVIDUAL_GUEST_ASSESSMENTS_REQUIRED';END IF;
 RETURN app.evaluation_prepare_before_guest(reader,sid,sub,expected,assignment_expected,payload,command,payload_hash);
END $$;
ALTER FUNCTION app.academic_draft_save(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text) RENAME TO academic_draft_save_before_guest;
CREATE FUNCTION app.academic_draft_save(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,draft_expected integer,payload jsonb,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 IF payload->>'layer'='committee' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INDIVIDUAL_GUEST_ASSESSMENTS_REQUIRED';END IF;
 RETURN app.academic_draft_save_before_guest(who,sid,sub,expected,assignment_expected,draft_expected,payload,command,digest);
END $$;
-- Exact-round publication must accept the complete aggregate, never an old recorder on a new guest round.
ALTER FUNCTION app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) RENAME TO academic_decision_prepare_before_guest;
CREATE FUNCTION app.academic_decision_prepare(who uuid,sid uuid,sub uuid,expected integer,assignment_expected integer,outcome text,reason text,manifest text,command uuid,digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;BEGIN
 p:=app.evaluation_actor(who,sid,sub,false);
 IF EXISTS(SELECT 1 FROM app.committee_rounds WHERE submission_id=sub) THEN
  IF outcome='publish' AND (NOT EXISTS(SELECT 1 FROM app.current_internal_assessments WHERE submission_id=sub AND layer='supervisor') OR NOT EXISTS(SELECT 1 FROM app.committee_rounds r JOIN app.current_committee_results c ON c.case_id=r.case_id WHERE r.submission_id=sub AND r.completed_at IS NOT NULL AND c.roster_hash=r.roster_hash) OR NOT EXISTS(SELECT 1 FROM app.academic_final_admissions WHERE submission_id=sub AND outcome='accepted')) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ALL_VERIFIED_MEMBER_FORMS_REQUIRED';END IF;
  -- The R06 prepare performs current assignment, version, manifest, reason, receipt and publication checks.
  RETURN app.academic_decision_prepare_r06(who,sid,sub,expected,assignment_expected,outcome,reason,manifest,command,digest);
 END IF;
 RETURN app.academic_decision_prepare_before_guest(who,sid,sub,expected,assignment_expected,outcome,reason,manifest,command,digest);
END $$;
-- The legacy integrity checker validates real supervisor forms; guest forms have their own immutable validation.
DO $$ DECLARE f record;d text;BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'publication_prepare%' LOOP
  d:=pg_get_functiondef(f.oid);
  -- Keep the original per-form integer integrity calculation on original rows only.
  d:=replace(d,'FROM app.effective_internal_assessments a WHERE a.submission_id=sub AND (a.rubric_code','FROM app.current_internal_assessments a WHERE a.submission_id=sub AND (a.rubric_code');
  EXECUTE d;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION app.committee_mail_claim() RETURNS SETOF app.committee_mail_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE m app.committee_mail_outbox;t timestamptz:=app.governance_now();BEGIN
 UPDATE app.committee_mail_outbox SET state='expired',ciphertext=NULL,lease=NULL,lease_until=NULL WHERE expires_at<=t AND state NOT IN ('provider_accepted','mailpit_accepted','expired');
 SELECT * INTO m FROM app.committee_mail_outbox WHERE ((state IN ('queued','failed','unknown') AND next_at<=t) OR (state='sending' AND lease_until<t)) AND attempts<8 AND expires_at>t ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM app.committee_invitations i WHERE i.id=m.invite_id AND i.generation=m.generation AND i.revoked_at IS NULL AND i.expires_at>t) THEN UPDATE app.committee_mail_outbox SET state='expired',ciphertext=NULL WHERE id=m.id;RETURN;END IF;
 UPDATE app.committee_mail_outbox SET state='sending',attempts=attempts+1,lease=gen_random_uuid(),lease_until=t+interval '30 seconds' WHERE id=m.id RETURNING * INTO m;RETURN NEXT m;
END $$;
CREATE FUNCTION app.committee_mail_finish(mid uuid,lease_value uuid,state_value text,code_value text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE m app.committee_mail_outbox;t timestamptz:=app.governance_now();BEGIN
 SELECT * INTO m FROM app.committee_mail_outbox WHERE id=mid AND lease=lease_value AND state='sending' AND lease_until>t FOR UPDATE;
 IF m.id IS NULL THEN RETURN false;END IF;
 IF state_value NOT IN ('provider_accepted','mailpit_accepted','failed','unknown') OR code_value !~ '^[A-Z_]{1,50}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_DELIVERY_STATE';END IF;
 INSERT INTO app.committee_mail_attempts(message_id,attempt,state,code) VALUES(mid,m.attempts,state_value,code_value);
 UPDATE app.committee_mail_outbox SET state=state_value,code=code_value,finished_at=CASE WHEN state_value IN ('provider_accepted','mailpit_accepted') THEN t END,ciphertext=CASE WHEN state_value IN ('provider_accepted','mailpit_accepted') THEN NULL ELSE ciphertext END,next_at=t+make_interval(secs=>least(1800,5*power(2,m.attempts)::integer)),lease=NULL,lease_until=NULL WHERE id=mid;RETURN true;
END $$;
-- Explicit least-privilege grants. Internal helpers and historical write variants remain inaccessible.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'committee_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,capstone_runtime,capstone_jobs',f.sig);END LOOP;
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('evaluation_prepare_before_guest','academic_draft_save_before_guest','academic_decision_prepare_before_guest') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,capstone_runtime,capstone_jobs',f.sig);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.committee_status(uuid,uuid,uuid),app.committee_manage(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid),app.committee_challenge_issue(uuid,text,text,text,uuid,text,text),app.committee_verify(uuid,text,text,text,text),app.committee_guest_read(uuid,text),app.committee_file_scope(uuid,text,uuid),app.committee_guest_write(uuid,text,integer,jsonb,uuid,boolean,boolean) TO capstone_runtime;
GRANT EXECUTE ON FUNCTION app.committee_mail_claim(),app.committee_mail_finish(uuid,uuid,text,text) TO capstone_jobs;
GRANT EXECUTE ON FUNCTION app.evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text),app.academic_draft_save(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text),app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text) TO capstone_runtime;
