-- Context for assessments already returned by the existing authorized view.
-- Original evaluators receive immutable identifying metadata for their own
-- assessment. This neither includes another assessment nor authorizes bytes.
ALTER FUNCTION app.governance_view(uuid,uuid,uuid,uuid) RENAME TO governance_view_before_context;
REVOKE ALL ON FUNCTION app.governance_view_before_context(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.governance_view(who uuid,sid uuid,case_value uuid DEFAULT NULL,issue_value uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb; assessments jsonb;
BEGIN
  result:=app.governance_view_before_context(who,sid,case_value,issue_value);
  SELECT coalesce(jsonb_agg(entry.value || jsonb_build_object('context',jsonb_build_object(
    'project',h.project_id,'version',h.version_id,'submission',h.submission_id,
    'title',s.metadata_snapshot->>'title','versionNumber',s.metadata_snapshot->'version'->'number'
  )) ORDER BY entry.ordinality),'[]'::jsonb) INTO assessments
  FROM jsonb_array_elements(result->'assessments') WITH ORDINALITY entry(value,ordinality)
  JOIN (SELECT ah.*,c.project_id,c.version_id FROM app.assessment_heads ah JOIN app.evaluation_cases c ON c.id=ah.case_id) h ON h.id=(entry.value->>'logical')::uuid
  JOIN app.project_submissions s ON s.id=h.submission_id;
  RETURN jsonb_set(result,'{assessments}',assessments);
END $$;
REVOKE ALL ON FUNCTION app.governance_view(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_view(uuid,uuid,uuid,uuid) TO capstone_runtime;
