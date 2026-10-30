-- Recipient event history is not authorization to its current target.
CREATE FUNCTION app.notice_context(reader uuid,sid uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE n app.notifications;l app.audit_logs;BEGIN
 PERFORM app.partner_access_principal(reader,sid);
 SELECT * INTO n FROM app.notifications WHERE id=target AND recipient_id=reader;
 IF n.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 SELECT * INTO l FROM app.audit_logs WHERE id=n.event_id;
 RETURN jsonb_build_object('link',app.notice_link(n),'project',n.project_id,'request',CASE WHEN n.type='partner-access.request' AND l.object_type='access_request' THEN l.object_id ELSE NULL END,'context',CASE WHEN n.project_id IS NOT NULL THEN (SELECT coalesce(s.metadata_snapshot->>'title',v.title) FROM app.project_versions v LEFT JOIN app.project_submissions s ON s.id=v.approved_submission_id WHERE v.id=l.version_id AND v.project_id=n.project_id) ELSE (SELECT organization_name FROM app.users WHERE id=l.object_id AND role_code='partner') END);
END $$;
REVOKE ALL ON FUNCTION app.notice_context(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.notice_context(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
-- Enrich only rows already admitted by the original scoped audit command.
ALTER FUNCTION app.governance_audit(uuid,uuid,jsonb,uuid,text,uuid) RENAME TO governance_audit_pre_r08_context;
CREATE FUNCTION app.governance_audit(reader uuid,sid uuid,filters jsonb,oversight uuid DEFAULT NULL,reason_value text DEFAULT NULL,command uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;x jsonb;items jsonb:='[]';context text;BEGIN
 result:=app.governance_audit_pre_r08_context(reader,sid,filters,oversight,reason_value,command);
 FOR x IN SELECT value FROM jsonb_array_elements(result->'items') LOOP
  SELECT CASE WHEN l.project_id IS NOT NULL THEN (SELECT coalesce(s.metadata_snapshot->>'title',v.title) FROM app.project_versions v LEFT JOIN app.project_submissions s ON s.id=v.approved_submission_id WHERE v.id=l.version_id AND v.project_id=l.project_id) ELSE (SELECT organization_name FROM app.users WHERE id=l.object_id AND role_code='partner') END INTO context FROM app.audit_logs l WHERE l.id=(x->>'id')::uuid;
  items:=items||jsonb_build_array(x||jsonb_build_object('context',context));
 END LOOP;
 RETURN result||jsonb_build_object('items',items);
END $$;
REVOKE ALL ON FUNCTION app.governance_audit_pre_r08_context(uuid,uuid,jsonb,uuid,text,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.governance_audit(uuid,uuid,jsonb,uuid,text,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_audit(uuid,uuid,jsonb,uuid,text,uuid) TO capstone_runtime;
