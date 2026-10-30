-- Identifying context for the existing authorized author-feedback response.
-- Read the frozen submission metadata after the original authorization succeeds;
-- working metadata revisions do not relabel an earlier assessed submission.
ALTER FUNCTION app.author_feedback(uuid,uuid,uuid) RENAME TO author_feedback_before_context;
REVOKE ALL ON FUNCTION app.author_feedback_before_context(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.author_feedback(who uuid,sid uuid,cid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb; context_value jsonb;
BEGIN
 result:=app.author_feedback_before_context(who,sid,cid);
 SELECT jsonb_build_object(
  'project',c.project_id,'version',c.version_id,'submission',c.submission_id,
  'title',s.metadata_snapshot->>'title','versionNumber',s.metadata_snapshot->'version'->'number'
 ) INTO context_value
 FROM app.evaluation_cases c JOIN app.project_submissions s ON s.id=c.submission_id
 WHERE c.id=cid;
 RETURN result||jsonb_build_object('context',context_value);
END $$;
REVOKE ALL ON FUNCTION app.author_feedback(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.author_feedback(uuid,uuid,uuid) TO capstone_runtime;
