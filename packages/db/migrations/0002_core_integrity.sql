-- Core invariant tightening. 0001 is already applied locally and remains immutable.
CREATE FUNCTION app.file_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (NEW.storage_object_id,NEW.sha256,NEW.size_bytes,NEW.relative_path,NEW.original_name,NEW.extension,NEW.detected_mime,NEW.uploaded_by,NEW.uploaded_at,NEW.university_id,NEW.project_id,NEW.version_id) IS DISTINCT FROM (OLD.storage_object_id,OLD.sha256,OLD.size_bytes,OLD.relative_path,OLD.original_name,OLD.extension,OLD.detected_mime,OLD.uploaded_by,OLD.uploaded_at,OLD.university_id,OLD.project_id,OLD.version_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable file identity'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_file_identity BEFORE UPDATE OR DELETE ON app.project_files FOR EACH ROW EXECUTE FUNCTION app.file_identity_guard();
CREATE FUNCTION app.archived_access_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.project_versions WHERE university_id=NEW.university_id AND project_id=NEW.project_id AND id=NEW.version_id AND status='archived') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Archived edition required'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER archived_request BEFORE INSERT ON app.access_requests FOR EACH ROW EXECUTE FUNCTION app.archived_access_guard();
CREATE TRIGGER archived_grant BEFORE INSERT ON app.access_grants FOR EACH ROW EXECUTE FUNCTION app.archived_access_guard();
CREATE FUNCTION app.submission_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.project_authors WHERE university_id=NEW.university_id AND project_id=NEW.project_id AND user_id=NEW.submitted_by AND is_team_lead) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Lead attribution required'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER submission_scope BEFORE INSERT ON app.project_submissions FOR EACH ROW EXECUTE FUNCTION app.submission_scope_guard();
CREATE FUNCTION app.manifest_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.project_files WHERE university_id=NEW.university_id AND project_id=NEW.project_id AND version_id=NEW.version_id AND id=NEW.file_id AND relative_path=NEW.relative_path AND sha256=NEW.sha256_at_submit AND visibility=NEW.visibility_at_submit AND processing_status='ready') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ready immutable object required'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER manifest_identity BEFORE INSERT ON app.submission_files FOR EACH ROW EXECUTE FUNCTION app.manifest_identity_guard();
REVOKE ALL ON FUNCTION app.file_identity_guard(),app.archived_access_guard(),app.submission_scope_guard(),app.manifest_identity_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.file_identity_guard(),app.archived_access_guard(),app.submission_scope_guard(),app.manifest_identity_guard() TO capstone_runtime;
ALTER TABLE app.access_grants DROP CONSTRAINT access_grants_university_id_revoked_by_fkey;
ALTER TABLE app.access_grants ADD FOREIGN KEY(revoked_by) REFERENCES app.users(id);
CREATE UNIQUE INDEX one_pending_request ON app.access_requests(version_id,requester_id) WHERE status='pending';
