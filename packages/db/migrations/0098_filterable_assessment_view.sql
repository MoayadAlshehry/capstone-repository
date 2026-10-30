-- Owner-approved isolated public-refinement migration (2026-10-20).
-- Exposes only unchanged base columns directly; preserves all revision overrides and invalidation rules.
SET LOCAL search_path=pg_catalog,app;
CREATE OR REPLACE VIEW app.current_internal_assessments AS
 SELECT (jsonb_populate_record(NULL::internal_assessments, to_jsonb(o.*) ||
        CASE
            WHEN r.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', r.id, 'quarter_points', r.quarter_points, 'overall_comment', r.payload ->> 'overall'::text, 'recorded_at', r.finalized_at, 'finalized_at', r.finalized_at, 'member_names', r.payload -> 'members'::text, 'assessed_on', r.payload ->> 'assessedOn'::text, 'attestation', r.payload -> 'attestation'::text)
        END)).id AS id,
    o.university_id AS university_id,
    o.project_id AS project_id,
    o.version_id AS version_id,
    o.submission_id AS submission_id,
    o.case_id AS case_id,
    o.layer AS layer,
    o.rubric_code AS rubric_code,
    o.rubric_hash AS rubric_hash,
    o.recorded_by AS recorded_by,
    (jsonb_populate_record(NULL::internal_assessments, to_jsonb(o.*) ||
        CASE
            WHEN r.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', r.id, 'quarter_points', r.quarter_points, 'overall_comment', r.payload ->> 'overall'::text, 'recorded_at', r.finalized_at, 'finalized_at', r.finalized_at, 'member_names', r.payload -> 'members'::text, 'assessed_on', r.payload ->> 'assessedOn'::text, 'attestation', r.payload -> 'attestation'::text)
        END)).recorded_at AS recorded_at,
    (jsonb_populate_record(NULL::internal_assessments, to_jsonb(o.*) ||
        CASE
            WHEN r.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', r.id, 'quarter_points', r.quarter_points, 'overall_comment', r.payload ->> 'overall'::text, 'recorded_at', r.finalized_at, 'finalized_at', r.finalized_at, 'member_names', r.payload -> 'members'::text, 'assessed_on', r.payload ->> 'assessedOn'::text, 'attestation', r.payload -> 'attestation'::text)
        END)).finalized_at AS finalized_at,
    (jsonb_populate_record(NULL::internal_assessments, to_jsonb(o.*) ||
        CASE
            WHEN r.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', r.id, 'quarter_points', r.quarter_points, 'overall_comment', r.payload ->> 'overall'::text, 'recorded_at', r.finalized_at, 'finalized_at', r.finalized_at, 'member_names', r.payload -> 'members'::text, 'assessed_on', r.payload ->> 'assessedOn'::text, 'attestation', r.payload -> 'attestation'::text)
        END)).quarter_points AS quarter_points,
    (jsonb_populate_record(NULL::internal_assessments, to_jsonb(o.*) ||
        CASE
            WHEN r.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', r.id, 'quarter_points', r.quarter_points, 'overall_comment', r.payload ->> 'overall'::text, 'recorded_at', r.finalized_at, 'finalized_at', r.finalized_at, 'member_names', r.payload -> 'members'::text, 'assessed_on', r.payload ->> 'assessedOn'::text, 'attestation', r.payload -> 'attestation'::text)
        END)).overall_comment AS overall_comment,
    o.calibration_ack AS calibration_ack,
    (jsonb_populate_record(NULL::internal_assessments, to_jsonb(o.*) ||
        CASE
            WHEN r.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', r.id, 'quarter_points', r.quarter_points, 'overall_comment', r.payload ->> 'overall'::text, 'recorded_at', r.finalized_at, 'finalized_at', r.finalized_at, 'member_names', r.payload -> 'members'::text, 'assessed_on', r.payload ->> 'assessedOn'::text, 'attestation', r.payload -> 'attestation'::text)
        END)).member_names AS member_names,
    (jsonb_populate_record(NULL::internal_assessments, to_jsonb(o.*) ||
        CASE
            WHEN r.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', r.id, 'quarter_points', r.quarter_points, 'overall_comment', r.payload ->> 'overall'::text, 'recorded_at', r.finalized_at, 'finalized_at', r.finalized_at, 'member_names', r.payload -> 'members'::text, 'assessed_on', r.payload ->> 'assessedOn'::text, 'attestation', r.payload -> 'attestation'::text)
        END)).assessed_on AS assessed_on,
    (jsonb_populate_record(NULL::internal_assessments, to_jsonb(o.*) ||
        CASE
            WHEN r.id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('id', r.id, 'quarter_points', r.quarter_points, 'overall_comment', r.payload ->> 'overall'::text, 'recorded_at', r.finalized_at, 'finalized_at', r.finalized_at, 'member_names', r.payload -> 'members'::text, 'assessed_on', r.payload ->> 'assessedOn'::text, 'attestation', r.payload -> 'attestation'::text)
        END)).attestation AS attestation
   FROM internal_assessments o
     LEFT JOIN LATERAL ( SELECT assessment_revisions.id,
            assessment_revisions.logical_id,
            assessment_revisions.case_id,
            assessment_revisions.layer,
            assessment_revisions.supersedes_id,
            assessment_revisions.issue_id,
            assessment_revisions.revision,
            assessment_revisions.evaluator_id,
            assessment_revisions.rubric_code,
            assessment_revisions.rubric_hash,
            assessment_revisions.payload,
            assessment_revisions.quarter_points,
            assessment_revisions.finalized_at
           FROM assessment_revisions
          WHERE assessment_revisions.logical_id = o.id
          ORDER BY assessment_revisions.revision DESC
         LIMIT 1) r ON true
  WHERE NOT (EXISTS ( SELECT 1
           FROM assessment_invalidations
          WHERE assessment_invalidations.logical_id = o.id));