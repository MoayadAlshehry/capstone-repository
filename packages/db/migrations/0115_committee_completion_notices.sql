CREATE OR REPLACE FUNCTION app.committee_result_refresh() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.evaluation_cases;ev uuid:=gen_random_uuid();BEGIN
 SELECT * INTO c FROM app.evaluation_cases WHERE id=NEW.case_id;
 INSERT INTO app.audit_logs(id,actor_kind,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,after_state)
 VALUES(ev,'system',c.university_id,'system.committee.result','committee_result',NEW.id,c.project_id,c.version_id,ev,ev,jsonb_build_object('scope',jsonb_build_object('result',NEW.id,'policy','COMMITTEE_GUEST_V1','members',NEW.member_count)::text));
 INSERT INTO app.notifications(event_id,recipient_id,university_id,project_id,type,payload)
 SELECT ev,recipient,c.university_id,c.project_id,'evaluation.finalized',jsonb_build_object('route','/submissions/'||c.submission_id::text,'message_key','evaluation.finalized') FROM
 (SELECT (a->>'id')::uuid recipient FROM app.project_submissions s CROSS JOIN LATERAL jsonb_array_elements(s.authors_snapshot) a WHERE s.id=c.submission_id UNION SELECT supervisor_id FROM app.projects WHERE id=c.project_id) recipients;
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
 PERFORM app.governance_refresh(NEW.case_id);INSERT INTO app.evaluation_wake_events(kind) VALUES('committee.result');PERFORM pg_notify('capstone_evaluation_eligible','changed');RETURN NEW;
END $$;
