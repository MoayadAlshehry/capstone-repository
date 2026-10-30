-- Public snapshot only; no scoring, allocation or permission mutation on a read.
-- Publication remains discoverable after a governed internal invalidation.
DO $$ DECLARE d text;BEGIN d:=pg_get_functiondef('app.publication_projection(uuid)'::regprocedure);d:=replace(d,'IF sq IS NULL OR cq IS NULL OR NOT EXISTS','IF NOT EXISTS');EXECUTE d;END $$;
--> statement-breakpoint
CREATE FUNCTION app.public_evaluation_summary(pid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE p app.projects;v app.project_versions;c app.evaluation_cases;s app.current_internal_assessments;cm app.current_internal_assessments;n integer;total integer;lo integer;hi integer;t timestamptz;held boolean;paused boolean;result jsonb;
BEGIN
 p:=NULL;SELECT * INTO p FROM app.projects WHERE id=pid;SELECT * INTO v FROM app.project_versions WHERE id=p.published_version_id AND status='archived';
 IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=v.approved_submission_id AND decision='archived') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT * INTO c FROM app.evaluation_cases WHERE project_id=pid AND version_id=v.id AND submission_id=v.approved_submission_id;
 SELECT * INTO s FROM app.current_internal_assessments WHERE case_id=c.id AND layer='supervisor';SELECT * INTO cm FROM app.current_internal_assessments WHERE case_id=c.id AND layer='committee';
 SELECT count(*),coalesce(sum(quarter_points),0),min(quarter_points),max(quarter_points),max(finalized_at) INTO n,total,lo,hi,t FROM app.current_external_assessments WHERE case_id=c.id;
 held:=EXISTS(SELECT 1 FROM app.evaluation_holds WHERE case_id=c.id AND state='open') OR coalesce((SELECT legacy_hold FROM app.evaluation_allocation_prerequisites WHERE case_id=c.id),false) OR EXISTS(SELECT 1 FROM app.current_internal_disagreements WHERE case_id=c.id) AND NOT EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=c.id AND supervisor_head=s.id AND committee_head=cm.id);
 paused:=coalesce((SELECT quality_paused FROM app.evaluation_progression WHERE case_id=c.id),false) OR n>=2 AND n<10 AND (total<n*(80+2*(n-2))*4 OR lo<280 OR hi-lo>80);
 result:=jsonb_build_object('internal',CASE WHEN s.id IS NOT NULL AND cm.id IS NOT NULL THEN jsonb_build_object('numerator',2*s.quarter_points+3*cm.quarter_points,'denominator',20) ELSE NULL END,'n',n,'external',CASE WHEN n>=2 THEN jsonb_build_object('numerator',total,'denominator',4*n,'rangeQuarterPoints',hi-lo) ELSE NULL END,'coreRubric',c.rubric_code,'externalRubric','EXTERNAL_V1','policy','EVAL_POLICY_V1','aggregateAt',greatest(t,s.finalized_at,cm.finalized_at,(SELECT executed_at FROM app.evaluation_governance_runs WHERE id=(SELECT last_run FROM app.evaluation_governance_projection WHERE case_id=c.id))),'pausedQuality',paused,'distinction',n>=2 AND total>=320*n AND lo>=280 AND hi-lo<=80 AND NOT held);
 RETURN result||app.public_correction_marker(pid);
END $$;
REVOKE ALL ON FUNCTION app.public_evaluation_summary(uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.public_evaluation_summary(uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.showcase_snapshot(who uuid DEFAULT NULL,sid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE hidden jsonb:='[]';c record;pub jsonb;summary_value jsonb;rows_value jsonb:='[]';concealed boolean;held boolean;compatible boolean;s app.current_internal_assessments;cm app.current_internal_assessments;
BEGIN
 IF who IS NOT NULL THEN PERFORM app.partner_access_principal(who,sid);hidden:=app.external_concealed(who,sid);END IF;
 FOR c IN SELECT p.id project,p.university_id,v.id version,v.archived_at,ec.id case_id,ec.rubric_code FROM app.projects p JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id AND v.university_id=p.university_id AND v.status='archived' JOIN app.project_submissions ps ON ps.id=v.approved_submission_id AND ps.version_id=v.id AND ps.project_id=p.id AND ps.university_id=p.university_id JOIN app.evaluation_cases ec ON ec.submission_id=ps.id AND ec.version_id=v.id AND ec.project_id=p.id WHERE p.assignment_managed AND EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=ps.id AND decision='archived') ORDER BY p.id LOOP
 pub:=app.publication_projection(c.project)||jsonb_build_object('publishedAt',to_char(c.archived_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 concealed:=EXISTS(SELECT 1 FROM jsonb_array_elements(hidden) h WHERE h->>'project'=c.project::text AND h->>'version'=c.version::text);
 SELECT * INTO s FROM app.current_internal_assessments WHERE case_id=c.case_id AND layer='supervisor';SELECT * INTO cm FROM app.current_internal_assessments WHERE case_id=c.case_id AND layer='committee';
 held:=EXISTS(SELECT 1 FROM app.evaluation_holds WHERE case_id=c.case_id AND state='open') OR coalesce((SELECT legacy_hold FROM app.evaluation_allocation_prerequisites WHERE case_id=c.case_id),false) OR EXISTS(SELECT 1 FROM app.current_internal_disagreements WHERE case_id=c.case_id) AND NOT EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=c.case_id AND supervisor_head=s.id AND committee_head=cm.id);
 compatible:=c.rubric_code='CORE_V1' AND s.id IS NOT NULL AND cm.id IS NOT NULL AND s.rubric_code='CORE_V1' AND cm.rubric_code='CORE_V1' AND s.rubric_hash=(SELECT config_hash FROM app.rubric_versions WHERE code='CORE_V1') AND cm.rubric_hash=s.rubric_hash AND NOT EXISTS(SELECT 1 FROM app.current_external_assessments e WHERE e.case_id=c.case_id AND (e.rubric_code<>'EXTERNAL_V1' OR e.rubric_hash<>(SELECT config_hash FROM app.rubric_versions WHERE code='EXTERNAL_V1')));
 IF concealed THEN pub:=pub-ARRAY['internal','rubric'];summary_value:=NULL;ELSE summary_value:=app.public_evaluation_summary(c.project);END IF;
 rows_value:=rows_value||jsonb_build_array(jsonb_build_object('publication',pub,'summary',summary_value,'rankEligible',NOT concealed AND NOT held,'compatible',NOT concealed AND compatible,'universityKey',c.university_id::text,'concealed',concealed));
 END LOOP;RETURN rows_value;
END $$;
REVOKE ALL ON FUNCTION app.showcase_snapshot(uuid,uuid) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.showcase_snapshot(uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
-- Detail gets the same safe summary; assigned sessions never get summary or I.
CREATE OR REPLACE FUNCTION app.external_projection(pid uuid,who uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ DECLARE result jsonb;BEGIN
 result:=app.publication_projection(pid);
 IF who IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(app.external_concealed(who,sid,pid)) h WHERE h->>'version'=result->>'version') THEN RETURN result-ARRAY['internal','rubric'];END IF;
 RETURN result||jsonb_build_object('evaluation',app.public_evaluation_summary(pid));
END $$;

--> statement-breakpoint
CREATE INDEX external_current_case_lookup ON app.external_assessments(case_id,finalized_at);
CREATE INDEX internal_current_case_lookup ON app.internal_assessments(case_id,layer);
CREATE INDEX open_governance_case_lookup ON app.evaluation_holds(case_id) WHERE state='open';
