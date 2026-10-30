-- A duplicate request is an authorized read of current state, not a new command.
-- Existing idempotency conflicts remain rejected. No duplicate audit or grant.
CREATE FUNCTION app.partner_access_existing(who uuid,sid uuid,cid uuid,pid uuid,vid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb; BEGIN
 PERFORM app.partner_access_principal(who,sid);
 PERFORM app.require_approved_partner(who,sid);
 IF NOT app.partner_archive_eligible(pid,vid) OR EXISTS(SELECT 1 FROM app.command_receipts WHERE actor_id=who AND command_id=cid) THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('scope',id::text,'row_version',revision,'noop',true) INTO result FROM app.access_requests WHERE requester_id=who AND project_id=pid AND version_id=vid AND status='pending';
 IF result IS NULL THEN SELECT jsonb_build_object('scope',id::text,'row_version',revision,'noop',true) INTO result FROM app.access_grants WHERE granted_to=who AND project_id=pid AND version_id=vid AND revoked_at IS NULL AND expires_at>app.partner_access_now() ORDER BY granted_at DESC LIMIT 1; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.partner_access_existing(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.partner_access_existing(uuid,uuid,uuid,uuid,uuid) TO capstone_runtime;
