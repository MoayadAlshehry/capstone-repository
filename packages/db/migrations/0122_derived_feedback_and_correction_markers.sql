-- The aggregate is a derived read model, never a signed integer assessment or
-- an editable logical form in the original-account correction registry.
ALTER FUNCTION app.assessment_payload(uuid) RENAME TO assessment_payload_before_guest_aggregate;
CREATE FUNCTION app.assessment_payload(aid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.committee_results;BEGIN
 SELECT * INTO r FROM app.committee_results WHERE id=aid;
 IF r.id IS NULL THEN RETURN app.assessment_payload_before_guest_aggregate(aid);END IF;
 RETURN jsonb_build_object('layer','committee','kind','committee_aggregate','memberCount',r.member_count,
 'criteria',(SELECT jsonb_agg(jsonb_build_object('code',j.key,'level',j.value::numeric,'comment','System-derived mean of the required verified individual levels; not an individual rating.','locators','[]'::jsonb) ORDER BY j.key) FROM jsonb_each_text(r.criterion_means) j),
 'overall','System-computed arithmetic mean of all finalized required member forms. No unanimous agreement or individual endorsement is asserted.','calibration',true,'members','[]'::jsonb,'assessedOn',NULL,'attestation',false);
END $$;
ALTER FUNCTION app.feedback_form(uuid,uuid) RENAME TO feedback_form_before_guest_aggregate;
CREATE FUNCTION app.feedback_form(aid uuid,cid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE value jsonb;r app.committee_results;BEGIN value:=app.feedback_form_before_guest_aggregate(aid,cid);SELECT * INTO r FROM app.committee_results WHERE id=aid AND case_id=cid;IF r.id IS NOT NULL THEN value:=value||jsonb_build_object('kind','committee_aggregate','memberCount',r.member_count);END IF;RETURN value;END $$;
ALTER FUNCTION app.public_correction_marker(uuid) RENAME TO public_correction_marker_before_guest_aggregate;
CREATE FUNCTION app.public_correction_marker(pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE value jsonb;cid uuid;BEGIN
 value:=app.public_correction_marker_before_guest_aggregate(pid);IF value IS NULL THEN RETURN NULL;END IF;SELECT c.id INTO cid FROM app.evaluation_cases c JOIN app.projects p ON p.published_version_id=c.version_id AND p.id=c.project_id WHERE p.id=pid;
 RETURN value||jsonb_build_object('corrected',coalesce((value->>'corrected')::boolean,false) OR EXISTS(SELECT 1 FROM app.committee_member_assessments WHERE case_id=cid AND supersedes_id IS NOT NULL),'aggregateChanged',coalesce((value->>'aggregateChanged')::boolean,false) OR EXISTS(SELECT 1 FROM app.committee_results r JOIN app.committee_results old ON old.id=r.supersedes_id WHERE r.case_id=cid AND r.sum_quarter_points::bigint*old.member_count<>old.sum_quarter_points::bigint*r.member_count));
END $$;
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.governance_refresh(uuid,uuid,uuid)'::regprocedure);
 d:=replace(d,'previously_released:=','output_value:=output_value||jsonb_build_object(''corrected'',coalesce((output_value->>''corrected'')::boolean,false) OR EXISTS(SELECT 1 FROM app.committee_member_assessments WHERE case_id=cid AND supersedes_id IS NOT NULL),''aggregateChanged'',coalesce((output_value->>''aggregateChanged'')::boolean,false) OR EXISTS(SELECT 1 FROM app.committee_results nr JOIN app.committee_results prior ON prior.id=nr.supersedes_id WHERE nr.case_id=cid AND nr.sum_quarter_points::bigint*prior.member_count<>prior.sum_quarter_points::bigint*nr.member_count));previously_released:=');EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION app.assessment_payload_before_guest_aggregate(uuid),app.assessment_payload(uuid),app.feedback_form_before_guest_aggregate(uuid,uuid),app.feedback_form(uuid,uuid),app.public_correction_marker_before_guest_aggregate(uuid),app.public_correction_marker(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.public_correction_marker(uuid) TO capstone_runtime;
