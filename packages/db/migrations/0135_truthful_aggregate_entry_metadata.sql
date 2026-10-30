-- Derived metadata reflects actual individual forms; historical physical assessments are unchanged.
CREATE OR REPLACE VIEW app.effective_internal_assessments AS
 SELECT current_internal_assessments.id,
    current_internal_assessments.university_id,
    current_internal_assessments.project_id,
    current_internal_assessments.version_id,
    current_internal_assessments.submission_id,
    current_internal_assessments.case_id,
    current_internal_assessments.layer,
    current_internal_assessments.rubric_code,
    current_internal_assessments.rubric_hash,
    current_internal_assessments.recorded_by,
    current_internal_assessments.recorded_at,
    current_internal_assessments.finalized_at,
    current_internal_assessments.quarter_points::numeric AS quarter_points,
    current_internal_assessments.overall_comment,
    current_internal_assessments.calibration_ack,
    current_internal_assessments.member_names,
    current_internal_assessments.assessed_on,
    current_internal_assessments.attestation
   FROM app.current_internal_assessments
UNION ALL
 SELECT r.id,
    c.university_id,
    c.project_id,
    c.version_id,
    c.submission_id,
    c.id AS case_id,
    'committee'::text AS layer,
    c.rubric_code,
    rv.config_hash AS rubric_hash,
    NULL::uuid AS recorded_by,
    r.finalized_at AS recorded_at,
    r.finalized_at,
    r.mean_quarter_points AS quarter_points,
    'System-computed aggregate of individually verified committee forms.'::text AS overall_comment,
    coalesce((SELECT bool_and(coalesce((member.payload->>'calibration')::boolean,false)) FROM app.current_committee_members member JOIN app.committee_invitations invitation ON invitation.id=member.invite_id WHERE member.case_id=c.id AND invitation.revoked_at IS NULL),false) AS calibration_ack,
    ( SELECT jsonb_agg(COALESCE(NULLIF(i.display_name, ''::text), 'Verified committee member'::text) ORDER BY i.id) AS jsonb_agg
           FROM app.committee_invitations i
          WHERE i.case_id = c.id AND i.revoked_at IS NULL) AS member_names,
    (r.finalized_at AT TIME ZONE 'UTC'::text)::date AS assessed_on,
    false AS attestation
   FROM app.current_committee_results r
     JOIN app.evaluation_cases c ON c.id = r.case_id
     JOIN app.rubric_versions rv ON rv.code = c.rubric_code;
