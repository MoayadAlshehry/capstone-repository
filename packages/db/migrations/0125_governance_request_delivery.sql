-- P5: a saved assessment issue must reach its responsible administrator.
-- Scope, authorization and scores are unchanged. The notice shares the existing
-- transaction/audit event; command replay does not emit another event.
CREATE OR REPLACE FUNCTION app.governance_event(who uuid,c app.evaluation_cases,operation text,object uuid,cid uuid,state_value text,recipient uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE ev uuid:=gen_random_uuid();role_value text;
BEGIN
 SELECT role_code INTO role_value FROM app.users WHERE id=who;
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,project_id,version_id,action,object_type,object_id,after_state,correlation_id,event_key,occurred_at)
 VALUES(ev,who,role_value,CASE WHEN who IS NULL THEN 'system' ELSE 'user' END,c.university_id,c.project_id,c.version_id,CASE WHEN who IS NULL THEN 'system.evaluation.governance.' ELSE 'evaluation.governance.' END||operation,'evaluation_issue',object,jsonb_build_object('scope',jsonb_build_object('case',c.id,'state',state_value)::text),cid,ev,clock_timestamp());
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 IF recipient IS NOT NULL THEN
  INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload)
  VALUES(ev,recipient,c.university_id,c.project_id,'evaluation.governance.'||operation,jsonb_build_object('message_key','evaluation.governance.'||operation,'link',jsonb_build_object('kind','evaluation-governance','id',object)));
 END IF;
 IF operation='issue' THEN
  INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload)
  SELECT ev,u.id,c.university_id,c.project_id,'evaluation.governance.issue',
   jsonb_build_object('message_key','evaluation.governance.issue','link',jsonb_build_object('kind','evaluation-governance','id',object))
  FROM app.users u JOIN app.assessment_issues i ON i.id=object
  WHERE u.account_status='active' AND u.id IS DISTINCT FROM recipient
   AND (i.layer='external' AND u.role_code='platform_admin'
     OR i.layer<>'external' AND u.role_code='university_admin' AND u.university_id=c.university_id);
 END IF;
 RETURN ev;
END $$;
REVOKE ALL ON FUNCTION app.governance_event(uuid,app.evaluation_cases,text,uuid,uuid,text,uuid)
 FROM PUBLIC,capstone_runtime,capstone_jobs;
