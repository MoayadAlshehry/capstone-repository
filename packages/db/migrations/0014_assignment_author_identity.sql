-- Project attribution cannot be moved to another project through a row update.
-- Pre-submission corrections use the finite replacement command; submitted
-- membership/order remain immutable even in controlled migration-role fixtures.
CREATE OR REPLACE FUNCTION app.assignment_roster_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE p app.projects; old_project app.projects; pid uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  SELECT * INTO old_project FROM app.projects WHERE id=OLD.project_id FOR UPDATE;
  IF old_project.assignment_managed AND (NEW.project_id,NEW.university_id) IS DISTINCT FROM (OLD.project_id,OLD.university_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='IMMUTABLE_AUTHOR_PROJECT'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN pid:=OLD.project_id; ELSE pid:=NEW.project_id; END IF;
 SELECT * INTO p FROM app.projects WHERE id=pid FOR UPDATE;
 IF p.assignment_managed THEN
  IF TG_OP IN ('INSERT','DELETE') THEN
   IF EXISTS(SELECT 1 FROM app.project_submissions WHERE project_id=pid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHOR_LOCKED'; END IF;
  ELSIF EXISTS(SELECT 1 FROM app.project_submissions WHERE project_id=pid) AND (NEW.user_id,NEW.author_order,NEW.project_id,NEW.university_id) IS DISTINCT FROM (OLD.user_id,OLD.author_order,OLD.project_id,OLD.university_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHOR_LOCKED'; END IF;
  IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM app.users WHERE id=NEW.user_id AND university_id=p.university_id AND department_id=p.department_id AND role_code='student') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='INVALID_AUTHOR'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION app.assignment_roster_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
