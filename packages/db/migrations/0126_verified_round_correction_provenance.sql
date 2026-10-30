-- P5: permanent verified-member rounds restored required supervisor evidence.
-- Their amendments must retain that immutable original contract. Earlier R06
-- UX V2 originals and external task policies keep their installed semantics.
CREATE OR REPLACE FUNCTION app.original_correction_policy(logical uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM app.internal_assessments a
    JOIN app.committee_rounds r ON r.case_id=a.case_id
    WHERE a.id=logical AND a.layer='supervisor')
   THEN 'REFERENCED_ASSESSMENT_V1'
  WHEN EXISTS(SELECT 1 FROM app.academic_assessment_provenance
    WHERE assessment_id=logical AND contract='ACADEMIC_FINAL_V1')
   OR EXISTS(SELECT 1 FROM app.external_assessments
    WHERE id=logical AND interaction_policy='SIMPLE_EXTERNAL_V2')
   THEN 'ASSESSMENT_UX_V2'
  ELSE 'REFERENCED_ASSESSMENT_V1' END
$$;
REVOKE ALL ON FUNCTION app.original_correction_policy(uuid)
 FROM PUBLIC,capstone_runtime,capstone_jobs;
