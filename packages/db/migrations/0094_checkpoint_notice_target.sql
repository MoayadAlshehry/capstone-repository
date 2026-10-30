-- Existing semester notices identify their immutable checkpoint through its
-- transactional audit binding. Notification history never grants current access.
ALTER FUNCTION app.notice_link(app.notifications) RENAME TO notice_link_before_checkpoint;
REVOKE ALL ON FUNCTION app.notice_link_before_checkpoint(app.notifications) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.notice_link(n app.notifications) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE sub uuid;
BEGIN
 IF n.type='checkpoint.sent' THEN
  SELECT r.submission_id INTO sub FROM app.audit_logs a JOIN app.checkpoint_rounds r ON r.submission_id=a.object_id
  WHERE a.id=n.event_id AND a.action='checkpoint.send' AND a.object_type='checkpoint_round'
   AND r.project_id=n.project_id AND r.university_id=n.university_id;
 ELSIF n.type IN ('checkpoint.changes','checkpoint.accept') THEN
  SELECT d.submission_id INTO sub FROM app.audit_logs a JOIN app.checkpoint_decisions d ON d.id=a.object_id
  WHERE a.id=n.event_id AND a.action=n.type AND a.object_type='checkpoint_decision'
   AND d.project_id=n.project_id AND d.university_id=n.university_id;
 END IF;
 IF sub IS NOT NULL THEN RETURN jsonb_build_object('kind','checkpoint','id',sub,'project',n.project_id);END IF;
 RETURN app.notice_link_before_checkpoint(n);
END $$;
REVOKE ALL ON FUNCTION app.notice_link(app.notifications) FROM PUBLIC,capstone_runtime,capstone_jobs;
ALTER FUNCTION app.notice_target(uuid,uuid,uuid) RENAME TO notice_target_before_checkpoint;
REVOKE ALL ON FUNCTION app.notice_target_before_checkpoint(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.notice_target(reader uuid,sid uuid,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE n app.notifications;l jsonb;
BEGIN
 PERFORM app.partner_access_principal(reader,sid);
 SELECT * INTO n FROM app.notifications WHERE id=target AND recipient_id=reader;
 IF n.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 l:=app.notice_link(n);
 IF l->>'kind'='checkpoint' THEN
  PERFORM app.checkpoint_read(reader,sid,(l->>'id')::uuid);RETURN l;
 END IF;
 RETURN app.notice_target_before_checkpoint(reader,sid,target);
END $$;
REVOKE ALL ON FUNCTION app.notice_target(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.notice_target(uuid,uuid,uuid) TO capstone_runtime;
ALTER FUNCTION app.notice_context(uuid,uuid,uuid) RENAME TO notice_context_before_checkpoint;
REVOKE ALL ON FUNCTION app.notice_context_before_checkpoint(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.notice_context(reader uuid,sid uuid,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;checkpoint jsonb;
BEGIN
 result:=app.notice_context_before_checkpoint(reader,sid,target);
 IF result->'link'->>'kind'='checkpoint' THEN
  BEGIN
   checkpoint:=app.checkpoint_read(reader,sid,(result->'link'->>'id')::uuid);
   result:=jsonb_set(result,'{context}',coalesce(checkpoint->'metadata'->'title','null'::jsonb));
  EXCEPTION WHEN insufficient_privilege OR no_data_found THEN
   result:=jsonb_set(result,'{context}','null'::jsonb);
  END;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION app.notice_context(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.notice_context(uuid,uuid,uuid) TO capstone_runtime;
