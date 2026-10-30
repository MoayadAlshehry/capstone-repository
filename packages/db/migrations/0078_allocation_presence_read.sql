-- The worker's queue-presence check is a read, not an allocation/progression run.
-- Match the snapshot's case population without computing policy inputs, locking
-- reviewers, processing deadlines or writing audit/progression/outbox records.
CREATE FUNCTION app.allocation_has_cases() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.evaluation_cases c
    JOIN app.projects p ON p.id=c.project_id
    JOIN app.project_versions v ON v.id=c.version_id
  );
$$;
REVOKE ALL ON FUNCTION app.allocation_has_cases() FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.allocation_has_cases() TO capstone_jobs;
