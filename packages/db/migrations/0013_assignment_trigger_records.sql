-- A constraint trigger serves two different row types. Select fields only after
-- branching on the relation, rather than resolving both records in one CASE.
CREATE OR REPLACE FUNCTION app.assignment_lead_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE pid uuid; n integer; leads integer; mx integer;
BEGIN
 IF TG_TABLE_NAME='projects' THEN pid:=NEW.id;
 ELSIF TG_OP='DELETE' THEN pid:=OLD.project_id;
 ELSE pid:=NEW.project_id; END IF;
 IF EXISTS(SELECT 1 FROM app.projects WHERE id=pid AND assignment_managed) THEN
  SELECT count(*),count(*) FILTER(WHERE is_team_lead),max(author_order) INTO n,leads,mx FROM app.project_authors WHERE project_id=pid;
  IF n<1 OR leads<>1 OR mx<>n THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='ONE_LEAD_CONSECUTIVE_AUTHORS'; END IF;
 END IF;RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.assignment_lead_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
