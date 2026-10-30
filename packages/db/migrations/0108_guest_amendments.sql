-- Original guest identity remains the only scoring authority. Institutional
-- authorization records a reason and opens a bounded amendment, never substitute marks.
CREATE TABLE app.committee_amendment_authorizations (
 id uuid PRIMARY KEY,invite_id uuid NOT NULL REFERENCES app.committee_invitations(id),assessment_id uuid NOT NULL REFERENCES app.committee_member_assessments(id),
 authorized_by uuid NOT NULL REFERENCES app.users(id),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 20 AND 2000),
 authorized_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,UNIQUE(id,invite_id)
);
CREATE TABLE app.committee_amendment_completions (
 authorization_id uuid PRIMARY KEY REFERENCES app.committee_amendment_authorizations(id),assessment_id uuid NOT NULL UNIQUE REFERENCES app.committee_member_assessments(id),completed_at timestamptz NOT NULL
);
CREATE TABLE app.committee_discrepancy_explanations (
 id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES app.committee_rounds(case_id),supervisor_head uuid NOT NULL,committee_head uuid NOT NULL REFERENCES app.committee_results(id),
 recorded_by uuid NOT NULL REFERENCES app.users(id),reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 20 AND 2000),recorded_at timestamptz NOT NULL,UNIQUE(case_id,supervisor_head,committee_head)
);
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['committee_amendment_authorizations','committee_amendment_completions','committee_discrepancy_explanations'] LOOP EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,capstone_runtime,capstone_jobs',n);EXECUTE format('CREATE TRIGGER immutable_committee_governance BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.immutable_record()',n);END LOOP;END $$;
CREATE FUNCTION app.committee_open_amendment(iid uuid) RETURNS app.committee_amendment_authorizations LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT a.* FROM app.committee_amendment_authorizations a JOIN app.current_committee_members m ON m.id=a.assessment_id AND m.invite_id=a.invite_id WHERE a.invite_id=iid AND a.expires_at>app.governance_now() AND NOT EXISTS(SELECT 1 FROM app.committee_amendment_completions c WHERE c.authorization_id=a.id) ORDER BY a.authorized_at DESC LIMIT 1
$$;
CREATE FUNCTION app.committee_institution(who uuid,sid uuid,cid uuid) RETURNS app.evaluation_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.users;c app.evaluation_cases;BEGIN u:=app.assignment_principal(who,sid);SELECT * INTO c FROM app.evaluation_cases WHERE id=cid;
 IF u.role_code<>'university_admin' OR u.university_id IS DISTINCT FROM c.university_id THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;RETURN c;
END $$;
CREATE FUNCTION app.committee_governance_read(who uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE u app.users;BEGIN u:=app.assignment_principal(who,sid);IF u.role_code<>'university_admin' THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='NOT_FOUND';END IF;
 RETURN jsonb_build_object('cases',(SELECT coalesce(jsonb_agg(jsonb_build_object('case',ec.id,'project',ec.project_id,'submission',ec.submission_id,'title',v.title,'result',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'total',r.mean_quarter_points/4,'members',r.member_count) END,'discrepancy',EXISTS(SELECT 1 FROM app.effective_internal_disagreements WHERE case_id=ec.id),'explanation',(SELECT reason FROM app.committee_discrepancy_explanations WHERE case_id=ec.id AND committee_head=r.id ORDER BY recorded_at DESC LIMIT 1),
 'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('invitation',i.id,'name',i.display_name,'email',i.email,'assessment',a.id,'total',a.quarter_points::numeric/4,'submittedAt',a.submitted_at,'amendment',(SELECT jsonb_build_object('id',au.id,'reason',au.reason,'expiresAt',au.expires_at) FROM app.committee_open_amendment(i.id) au WHERE au.id IS NOT NULL)) ORDER BY i.id),'[]') FROM app.committee_invitations i LEFT JOIN app.current_committee_members a ON a.invite_id=i.id WHERE i.case_id=ec.id AND i.revoked_at IS NULL)) ORDER BY ec.created_at DESC),'[]') FROM app.committee_rounds cr JOIN app.evaluation_cases ec ON ec.id=cr.case_id JOIN app.project_versions v ON v.id=ec.version_id LEFT JOIN app.current_committee_results r ON r.case_id=ec.id WHERE ec.university_id=u.university_id));
END $$;
CREATE FUNCTION app.committee_authorize_amendment(who uuid,sid uuid,iid uuid,expected_head uuid,reason_value text,command uuid,token_digest text,message_id uuid,encrypted text,key_version text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE i app.committee_invitations;c app.evaluation_cases;old app.current_committee_members;t timestamptz:=app.governance_now();BEGIN
 SELECT * INTO i FROM app.committee_invitations WHERE id=iid FOR UPDATE;c:=app.committee_institution(who,sid,i.case_id);SELECT * INTO old FROM app.current_committee_members WHERE invite_id=iid;
 IF EXISTS(SELECT 1 FROM app.committee_amendment_authorizations WHERE id=command AND invite_id=iid AND authorized_by=who AND assessment_id=expected_head AND reason=reason_value) THEN RETURN jsonb_build_object('authorized',true);END IF;
 IF old.id IS NULL OR old.id IS DISTINCT FROM expected_head OR i.revoked_at IS NOT NULL OR (app.committee_open_amendment(iid)).id IS NOT NULL OR length(btrim(reason_value)) NOT BETWEEN 20 AND 2000 OR token_digest !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='AMENDMENT_UNAVAILABLE';END IF;
 INSERT INTO app.committee_amendment_authorizations VALUES(command,iid,old.id,who,reason_value,t,t+interval '72 hours');
 UPDATE app.committee_invitations SET token_hash=token_digest,generation=generation+1,expires_at=t+interval '72 hours',last_sent_at=t WHERE id=iid RETURNING * INTO i;
 UPDATE app.committee_guest_sessions SET revoked_at=t WHERE invite_id=iid AND revoked_at IS NULL;
 INSERT INTO app.committee_mail_outbox(id,invite_id,generation,purpose,recipient,ciphertext,key_id,dedupe,next_at,expires_at) VALUES(message_id,iid,i.generation,'COMMITTEE_INVITE',i.email,encrypted,key_version,command,t,i.expires_at);
 PERFORM app.committee_event(i.case_id,iid,who,'amendment_authorized',reason_value,jsonb_build_object('authorization',command,'expectedHead',expected_head));RETURN jsonb_build_object('authorized',true);
END $$;
CREATE FUNCTION app.committee_explain(who uuid,sid uuid,cid uuid,expected_result uuid,reason_value text,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.evaluation_cases;s uuid;r app.current_committee_results;BEGIN
 c:=app.committee_institution(who,sid,cid);PERFORM 1 FROM app.committee_rounds WHERE case_id=cid FOR UPDATE;SELECT * INTO r FROM app.current_committee_results WHERE case_id=cid;SELECT id INTO s FROM app.current_internal_assessments WHERE case_id=cid AND layer='supervisor';
 IF r.id IS NULL OR r.id IS DISTINCT FROM expected_result OR length(btrim(reason_value)) NOT BETWEEN 20 AND 2000 OR NOT EXISTS(SELECT 1 FROM app.effective_internal_disagreements WHERE case_id=cid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='EXPLANATION_UNAVAILABLE';END IF;
 INSERT INTO app.committee_discrepancy_explanations VALUES(command,cid,s,r.id,who,reason_value,app.governance_now()) ON CONFLICT(case_id,supervisor_head,committee_head) DO NOTHING;
 PERFORM app.committee_event(cid,NULL,who,'discrepancy_explained',reason_value);PERFORM app.governance_refresh(cid);INSERT INTO app.evaluation_wake_events(kind) VALUES('committee.discrepancy_explained');PERFORM pg_notify('capstone_evaluation_eligible','changed');RETURN jsonb_build_object('explained',true);
END $$;
--> statement-breakpoint
CREATE FUNCTION app.committee_rederive(cid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE old app.current_committee_results;r app.committee_rounds;n integer;done integer;sumq integer;means jsonb;ids jsonb;BEGIN
 SELECT * INTO r FROM app.committee_rounds WHERE case_id=cid FOR UPDATE;SELECT * INTO old FROM app.current_committee_results WHERE case_id=cid;
 IF old.id IS NULL THEN PERFORM app.committee_derive(cid);RETURN;END IF;
 SELECT count(*),count(a.id),sum(a.quarter_points),jsonb_agg(a.id ORDER BY i.id) INTO n,done,sumq,ids FROM app.committee_invitations i LEFT JOIN app.current_committee_members a ON a.invite_id=i.id WHERE i.case_id=cid AND i.revoked_at IS NULL;
 IF n<>done OR n<2 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='SEALED_ROSTER_REQUIRED';END IF;
 SELECT jsonb_object_agg(code,level) INTO means FROM (SELECT cr->>'code' code,avg((cr->>'level')::numeric) level FROM app.current_committee_members a JOIN app.committee_invitations i ON i.id=a.invite_id AND i.revoked_at IS NULL CROSS JOIN LATERAL jsonb_array_elements(a.payload->'criteria') cr WHERE a.case_id=cid GROUP BY cr->>'code') m;
 INSERT INTO app.committee_results VALUES(gen_random_uuid(),cid,r.roster_hash,ids,n,sumq,sumq::numeric/n,means,app.governance_now(),old.id);
END $$;
ALTER FUNCTION app.committee_guest_write(uuid,text,integer,jsonb,uuid,boolean,boolean) RENAME TO committee_guest_write_original;
CREATE FUNCTION app.committee_guest_write(iid uuid,session_digest text,expected integer,payload jsonb,command uuid,final_value boolean,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE au app.committee_amendment_authorizations;i app.committee_invitations;r app.committee_rounds;d app.committee_member_drafts;q integer;t timestamptz:=app.governance_now();BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(iid::text,101));au:=app.committee_open_amendment(iid);
 IF au.id IS NULL THEN RETURN app.committee_guest_write_original(iid,session_digest,expected,payload,command,final_value,commit_value);END IF;
 i:=app.committee_guest(iid,session_digest);SELECT * INTO r FROM app.committee_rounds WHERE case_id=i.case_id FOR UPDATE;
 SELECT * INTO d FROM app.committee_member_drafts WHERE invite_id=iid;
 IF coalesce(d.revision,0)<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_DRAFT';END IF;
 q:=app.committee_validate(r.submission_id,payload,final_value);
 IF NOT final_value THEN INSERT INTO app.committee_member_drafts VALUES(iid,expected+1,payload,t) ON CONFLICT(invite_id) DO UPDATE SET revision=expected+1,payload=EXCLUDED.payload,saved_at=t;PERFORM app.committee_event(i.case_id,iid,NULL,'amendment_draft_saved');RETURN jsonb_build_object('revision',expected+1,'savedAt',t);END IF;
 IF NOT commit_value THEN RETURN app.committee_file_scope(iid,session_digest);END IF;
 INSERT INTO app.committee_member_assessments(id,invite_id,case_id,recipient_email_snapshot,rubric_code,rubric_hash,payload,quarter_points,submitted_at,supersedes_id,amendment_id) SELECT command,iid,i.case_id,i.email,'CORE_V1',config_hash,payload,q,t,au.assessment_id,au.id FROM app.rubric_versions WHERE code='CORE_V1';
 INSERT INTO app.committee_amendment_completions VALUES(au.id,command,t);PERFORM app.committee_event(i.case_id,iid,NULL,'amendment_submitted',au.reason,jsonb_build_object('authorization',au.id,'supersedes',au.assessment_id,'assessment',command));PERFORM app.committee_rederive(i.case_id);
 RETURN jsonb_build_object('receipt',jsonb_build_object('id',command,'total',q::numeric/4,'submittedAt',t));
END $$;
-- Live identity and exact-round checks remain unchanged. Only an authorized original invitee may reopen its evidence.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_file_scope(uuid,text,uuid)'::regprocedure);d:=replace(d,'IF i.submitted_at IS NOT NULL THEN','IF i.submitted_at IS NOT NULL AND (app.committee_open_amendment(iid)).id IS NULL THEN');EXECUTE d;
 d:=pg_get_functiondef('app.committee_challenge_issue(uuid,text,text,text,uuid,text,text)'::regprocedure);d:=replace(d,'OR i.submitted_at IS NOT NULL OR','OR (i.submitted_at IS NOT NULL AND (app.committee_open_amendment(iid)).id IS NULL) OR');EXECUTE d;
 d:=pg_get_functiondef('app.committee_guest_read(uuid,text)'::regprocedure);d:=replace(d,$find$'receipt',(SELECT$find$,$replace$'amendment',(SELECT jsonb_build_object('id',a.id,'reason',a.reason,'expectedHead',a.assessment_id) FROM app.committee_open_amendment(iid) a WHERE a.id IS NOT NULL),'receipt',CASE WHEN (app.committee_open_amendment(iid)).id IS NOT NULL THEN NULL ELSE (SELECT$replace$);d:=replace(d,'ORDER BY submitted_at DESC LIMIT 1));','ORDER BY submitted_at DESC LIMIT 1) END);');EXECUTE d;
 d:=pg_get_functiondef('app.first_pair_reasons(uuid)'::regprocedure);d:=replace(d,'AND NOT EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id)','AND NOT EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id) AND NOT EXISTS(SELECT 1 FROM app.committee_discrepancy_explanations WHERE case_id=cid AND supervisor_head=s.id AND committee_head=cm.id)');EXECUTE d;
END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('committee_open_amendment','committee_institution','committee_governance_read','committee_authorize_amendment','committee_explain','committee_rederive','committee_guest_write_original','committee_guest_write') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,capstone_runtime,capstone_jobs',f.sig);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION app.committee_governance_read(uuid,uuid),app.committee_authorize_amendment(uuid,uuid,uuid,uuid,text,uuid,text,uuid,text,text),app.committee_explain(uuid,uuid,uuid,uuid,text,uuid),app.committee_guest_write(uuid,text,integer,jsonb,uuid,boolean,boolean) TO capstone_runtime;
