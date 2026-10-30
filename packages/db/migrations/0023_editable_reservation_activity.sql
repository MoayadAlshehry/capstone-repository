-- Touch requires current editable workspace; cancellation/failure release stays available on locked own scope.
CREATE OR REPLACE FUNCTION app.file_end(reader uuid,sid uuid,rid uuid,operation text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.file_reservations;p app.projects;
BEGIN
 SELECT * INTO r FROM app.file_reservations WHERE id=rid AND uploader_id=reader;IF r.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 p:=app.file_actor(reader,sid,r.project_id,r.version_id,operation='touch');SELECT * INTO r FROM app.file_reservations WHERE id=rid FOR UPDATE;
 IF operation NOT IN ('cancelled','failed','touch') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_TRANSITION';END IF;
 IF r.status='active' THEN
 IF r.expires_at<=clock_timestamp() THEN UPDATE app.file_reservations SET status='expired' WHERE id=rid;
 ELSIF operation='touch' THEN UPDATE app.file_reservations SET activity_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' WHERE id=rid;
 ELSE UPDATE app.file_reservations SET status=operation WHERE id=rid;END IF;END IF;
 RETURN jsonb_build_object('id',rid,'status',(SELECT status FROM app.file_reservations WHERE id=rid));
END $$;
REVOKE ALL ON FUNCTION app.file_end(uuid,uuid,uuid,text) FROM PUBLIC,capstone_jobs;GRANT EXECUTE ON FUNCTION app.file_end(uuid,uuid,uuid,text) TO capstone_runtime;
