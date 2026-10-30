-- Persisted, scoped lifecycle metadata; never expose digests or plaintext values.
CREATE FUNCTION app.lifecycle_administration_state(reader uuid, session_id uuid, tenant uuid)
RETURNS TABLE(user_id uuid,purpose text,state text,issued_at timestamptz,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;
BEGIN
 SELECT * INTO a FROM app.users WHERE id=reader;
 IF a.id IS NULL OR a.account_status<>'active' OR a.role_code NOT IN ('platform_admin','university_admin') OR NOT EXISTS(SELECT 1 FROM app.auth_sessions s WHERE s.id=session_id AND s.user_id=reader AND s.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF a.role_code='university_admin' AND (a.university_id<>tenant OR NOT EXISTS(SELECT 1 FROM app.universities v WHERE v.id=tenant AND v.status='active')) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 RETURN QUERY SELECT DISTINCT ON (l.user_id,l.purpose) l.user_id,l.purpose,
 CASE WHEN l.revoked_at IS NOT NULL THEN 'revoked' WHEN l.consumed_at IS NOT NULL THEN 'consumed' WHEN l.expires_at<=app.lifecycle_now() THEN 'expired' ELSE 'issued' END,
 l.issued_at,l.expires_at
 FROM app.account_lifecycle l JOIN app.users u ON u.id=l.user_id AND u.university_id=l.university_id
 WHERE l.university_id=tenant AND ((a.role_code='platform_admin' AND u.role_code='university_admin') OR (a.role_code='university_admin' AND u.role_code IN ('student','faculty_supervisor')))
 ORDER BY l.user_id,l.purpose,(l.consumed_at IS NULL AND l.revoked_at IS NULL) DESC,coalesce(l.consumed_at,l.revoked_at,l.issued_at) DESC,l.issued_at DESC,l.id DESC;
END $$;
REVOKE ALL ON FUNCTION app.lifecycle_administration_state(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.lifecycle_administration_state(uuid,uuid,uuid) TO capstone_runtime;
