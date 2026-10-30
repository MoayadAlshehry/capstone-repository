ALTER TABLE app.file_reservations ADD CONSTRAINT reservation_transport_scope UNIQUE(university_id,project_id,version_id,uploader_id,id);
ALTER TABLE app.upload_sessions ADD CONSTRAINT upload_reservation_scope FOREIGN KEY(university_id,project_id,version_id,uploader_id,reservation_id) REFERENCES app.file_reservations(university_id,project_id,version_id,uploader_id,id);
CREATE INDEX uploads_project_owner ON app.upload_sessions(project_id,version_id,uploader_id);
CREATE FUNCTION app.upload_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.id,NEW.reservation_id,NEW.university_id,NEW.project_id,NEW.version_id,NEW.uploader_id,NEW.transfer_key,NEW.expected_bytes,NEW.fingerprint,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.reservation_id,OLD.university_id,OLD.project_id,OLD.version_id,OLD.uploader_id,OLD.transfer_key,OLD.expected_bytes,OLD.fingerprint,OLD.created_at) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable upload identity';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.file_reservations WHERE id=NEW.reservation_id AND expected_bytes=NEW.expected_bytes) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Reservation size mismatch';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER upload_identity BEFORE INSERT OR UPDATE ON app.upload_sessions FOR EACH ROW EXECUTE FUNCTION app.upload_identity_guard();
REVOKE ALL ON FUNCTION app.upload_identity_guard() FROM PUBLIC,capstone_runtime,capstone_jobs;
