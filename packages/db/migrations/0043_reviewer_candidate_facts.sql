-- Internal candidate facts only. No user route, allocation or assignment is introduced.
CREATE FUNCTION app.reviewer_candidate_facts(reviewer uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.users;p app.projects;r app.reviewer_profiles;
BEGIN
 SELECT * INTO u FROM app.users WHERE id=reviewer FOR SHARE;
 SELECT * INTO r FROM app.reviewer_profiles WHERE user_id=reviewer FOR SHARE;
 SELECT * INTO p FROM app.projects WHERE id=pid FOR SHARE;
 IF u.id IS NULL OR p.id IS NULL OR r.user_id IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('activeFaculty',u.role_code='faculty_supervisor' AND u.account_status='active' AND EXISTS(SELECT 1 FROM app.universities WHERE id=u.university_id AND status='active'),'approved',r.status='approved' AND r.institution_id=u.university_id,'institution',u.university_id,'available',r.availability,'domains',r.domain_codes,'languages',r.reading_languages,'calibrated',r.calibration_version='EXTERNAL_V1' AND r.calibration_at IS NOT NULL,'projectUniversity',p.university_id,'author',EXISTS(SELECT 1 FROM app.project_authors WHERE project_id=pid AND user_id=reviewer),'supervisor',p.supervisor_id=reviewer,'formerSupervisor',EXISTS(SELECT 1 FROM app.audit_logs a WHERE a.project_id=pid AND a.action IN ('assignment.create','assignment.supervisor') AND ((a.before_state->>'scope')::jsonb->>'supervisor'=reviewer::text OR (a.after_state->>'scope')::jsonb->>'supervisor'=reviewer::text)),'committeeNameMatch',EXISTS(SELECT 1 FROM app.internal_assessments a CROSS JOIN LATERAL jsonb_array_elements_text(a.member_names) n WHERE a.project_id=pid AND a.layer='committee' AND lower(normalize(btrim(n),NFC))=lower(normalize(btrim(u.full_name),NFC))));
END $$;
REVOKE ALL ON FUNCTION app.reviewer_candidate_facts(uuid,uuid) FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.reviewer_candidate_facts(uuid,uuid) TO capstone_jobs;
