-- COMMITTEE_GUEST_V1. Additive identities: never create users or relabel old recorder forms.
CREATE TABLE app.committee_rounds (
 case_id uuid PRIMARY KEY REFERENCES app.evaluation_cases(id), submission_id uuid NOT NULL UNIQUE REFERENCES app.project_submissions(id),
 policy text NOT NULL DEFAULT 'COMMITTEE_GUEST_V1' CHECK(policy='COMMITTEE_GUEST_V1'), revision integer NOT NULL DEFAULT 0,
 roster_hash text, sealed_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app.committee_invitations (
 id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES app.committee_rounds(case_id), email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email)<=254 AND email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$'),
 display_name text NOT NULL CHECK(length(display_name)<=200), locale text NOT NULL CHECK(locale IN ('en','ar')),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), generation integer NOT NULL DEFAULT 1,
 invited_by uuid NOT NULL REFERENCES app.users(id), created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, verified_at timestamptz, submitted_at timestamptz, last_sent_at timestamptz NOT NULL,
 UNIQUE(id,case_id), UNIQUE(case_id,email)
);
CREATE TABLE app.committee_challenges (
 invite_id uuid PRIMARY KEY REFERENCES app.committee_invitations(id), code_hash text NOT NULL CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 generation integer NOT NULL, issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6), resend_after timestamptz NOT NULL
);
CREATE TABLE app.committee_guest_sessions (
 session_hash text PRIMARY KEY CHECK(session_hash ~ '^[a-f0-9]{64}$'), invite_id uuid NOT NULL REFERENCES app.committee_invitations(id),
 generation integer NOT NULL, verified_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE app.committee_member_drafts (
 invite_id uuid PRIMARY KEY REFERENCES app.committee_invitations(id), revision integer NOT NULL, payload jsonb NOT NULL, saved_at timestamptz NOT NULL
);
CREATE TABLE app.committee_member_assessments (
 id uuid PRIMARY KEY, invite_id uuid NOT NULL, case_id uuid NOT NULL, recipient_email_snapshot text NOT NULL,
 rubric_code text NOT NULL REFERENCES app.rubric_versions(code), rubric_hash text NOT NULL, payload jsonb NOT NULL,
 quarter_points integer NOT NULL CHECK(quarter_points BETWEEN 0 AND 400), submitted_at timestamptz NOT NULL,
 supersedes_id uuid UNIQUE REFERENCES app.committee_member_assessments(id), amendment_id uuid,
 UNIQUE(invite_id,id), FOREIGN KEY(invite_id,case_id) REFERENCES app.committee_invitations(id,case_id),
 CHECK((supersedes_id IS NULL)=(amendment_id IS NULL))
);
CREATE UNIQUE INDEX committee_member_first ON app.committee_member_assessments(invite_id) WHERE supersedes_id IS NULL;
CREATE TABLE app.committee_results (
 id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES app.committee_rounds(case_id), roster_hash text NOT NULL,
 member_ids jsonb NOT NULL, member_count integer NOT NULL CHECK(member_count>=2), sum_quarter_points integer NOT NULL,
 mean_quarter_points numeric NOT NULL, criterion_means jsonb NOT NULL, finalized_at timestamptz NOT NULL,
 supersedes_id uuid UNIQUE REFERENCES app.committee_results(id),
 CHECK(mean_quarter_points=sum_quarter_points::numeric/member_count)
);
CREATE UNIQUE INDEX committee_first_result ON app.committee_results(case_id) WHERE supersedes_id IS NULL;
CREATE TABLE app.committee_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES app.committee_rounds(case_id), invite_id uuid REFERENCES app.committee_invitations(id),
 actor_id uuid REFERENCES app.users(id), action text NOT NULL, reason text, detail jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE app.committee_mail_outbox (
 id uuid PRIMARY KEY, invite_id uuid NOT NULL REFERENCES app.committee_invitations(id), generation integer NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('COMMITTEE_INVITE','COMMITTEE_OTP')), recipient text NOT NULL, ciphertext text,
 key_id text NOT NULL, dedupe uuid NOT NULL UNIQUE, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','provider_accepted','mailpit_accepted','failed','unknown','expired')),
 attempts integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 lease uuid, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz, code text NOT NULL DEFAULT 'QUEUED'
);
CREATE TABLE app.committee_mail_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES app.committee_mail_outbox(id), attempt integer NOT NULL,
 state text NOT NULL, code text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(message_id,attempt)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['committee_rounds','committee_invitations','committee_challenges','committee_guest_sessions','committee_member_drafts','committee_member_assessments','committee_results','committee_events','committee_mail_outbox','committee_mail_attempts'] LOOP
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,capstone_runtime,capstone_jobs',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['committee_member_assessments','committee_results','committee_events','committee_mail_attempts'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_committee_record BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.immutable_record()',n);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION app.committee_init_round() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN
 INSERT INTO app.committee_rounds(case_id,submission_id) VALUES(NEW.id,NEW.submission_id);RETURN NEW;
END $$;
CREATE TRIGGER committee_init_round AFTER INSERT ON app.evaluation_cases FOR EACH ROW EXECUTE FUNCTION app.committee_init_round();
-- Existing finalized recorder records remain historical. Unfinished pending rounds adopt the new acquisition contract.
INSERT INTO app.committee_rounds(case_id,submission_id) SELECT c.id,c.submission_id FROM app.evaluation_cases c JOIN app.project_versions v ON v.id=c.version_id AND v.status='pending_review' WHERE NOT EXISTS(SELECT 1 FROM app.internal_assessments WHERE submission_id=c.submission_id AND layer='committee');
CREATE FUNCTION app.committee_validate(sub uuid,payload jsonb,final_value boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE cr jsonb;loc jsonb;seen text[]:='{}';q integer:=0;lv numeric;BEGIN
 IF jsonb_typeof(payload)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('criteria','overall','calibration')) OR jsonb_typeof(payload->'criteria') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'criteria')<>7 OR jsonb_typeof(payload->'overall') IS DISTINCT FROM 'string' OR length(payload->>'overall')>2000 OR final_value AND (length(btrim(payload->>'overall'))<50 OR payload->'calibration' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='COMPLETE_ASSESSMENT_REQUIRED';END IF;
 FOR cr IN SELECT value FROM jsonb_array_elements(payload->'criteria') LOOP
  IF jsonb_typeof(cr)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(cr) k WHERE k NOT IN ('code','level','comment','locators')) OR coalesce(cr->>'code','') !~ '^C[1-7]$' OR cr->>'code'=ANY(seen) OR jsonb_typeof(cr->'comment') IS DISTINCT FROM 'string' OR length(cr->>'comment')>1000 OR jsonb_typeof(cr->'locators') IS DISTINCT FROM 'array' OR jsonb_array_length(cr->'locators')>20 OR final_value AND jsonb_array_length(cr->'locators')=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CRITERION';END IF;
  seen:=array_append(seen,cr->>'code');
  IF cr->'level' IS DISTINCT FROM 'null'::jsonb THEN
   IF jsonb_typeof(cr->'level') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INTEGER_LEVEL_REQUIRED';END IF;
   lv:=(cr->>'level')::numeric;
   IF lv<0 OR lv>4 OR lv<>trunc(lv) OR final_value AND lv IN (0,4) AND length(btrim(cr->>'comment'))<20 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='LEVEL_REASON_REQUIRED';END IF;
   q:=q+(ARRAY[10,20,20,20,15,10,5])[(substring(cr->>'code' FROM 2))::integer]*lv::integer;
  ELSIF final_value THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SEVEN_SCORES_REQUIRED';END IF;
  FOR loc IN SELECT value FROM jsonb_array_elements(cr->'locators') LOOP
   IF jsonb_typeof(loc)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(loc) k WHERE k NOT IN ('file','kind','reference')) OR coalesce(loc->>'kind','') NOT IN ('page','section','figure','test','lines') OR jsonb_typeof(loc->'reference') IS DISTINCT FROM 'string' OR length(btrim(loc->>'reference')) NOT BETWEEN 1 AND 200 OR NOT EXISTS(SELECT 1 FROM app.submission_files WHERE submission_id=sub AND file_id=(loc->>'file')::uuid) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='EXACT_EVIDENCE_REQUIRED';END IF;
  END LOOP;
 END LOOP;
 RETURN q;
END $$;
CREATE VIEW app.current_committee_members AS SELECT a.* FROM app.committee_member_assessments a WHERE NOT EXISTS(SELECT 1 FROM app.committee_member_assessments n WHERE n.supersedes_id=a.id);
CREATE VIEW app.current_committee_results AS SELECT a.* FROM app.committee_results a WHERE NOT EXISTS(SELECT 1 FROM app.committee_results n WHERE n.supersedes_id=a.id);
CREATE FUNCTION app.committee_derive(cid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.committee_rounds;n integer;done integer;sumq integer;means jsonb;ids jsonb;t timestamptz:=app.governance_now();BEGIN
 SELECT * INTO r FROM app.committee_rounds WHERE case_id=cid FOR UPDATE;
 IF r.completed_at IS NOT NULL THEN RETURN;END IF;
 SELECT count(*),count(a.id),sum(a.quarter_points),jsonb_agg(a.id ORDER BY i.id) INTO n,done,sumq,ids FROM app.committee_invitations i LEFT JOIN app.current_committee_members a ON a.invite_id=i.id WHERE i.case_id=cid AND i.revoked_at IS NULL;
 IF r.sealed_at IS NULL OR n<2 OR done<>n THEN RETURN;END IF;
 SELECT jsonb_object_agg(code,level) INTO means FROM (SELECT cr->>'code' code,avg((cr->>'level')::numeric) level FROM app.current_committee_members a JOIN app.committee_invitations i ON i.id=a.invite_id AND i.revoked_at IS NULL CROSS JOIN LATERAL jsonb_array_elements(a.payload->'criteria') cr WHERE a.case_id=cid GROUP BY cr->>'code') m;
 INSERT INTO app.committee_results VALUES(gen_random_uuid(),cid,r.roster_hash,ids,n,sumq,sumq::numeric/n,means,t,NULL);
 UPDATE app.committee_rounds SET completed_at=t WHERE case_id=cid;
 PERFORM app.committee_event(cid,NULL,NULL,'aggregate_completed',NULL,jsonb_build_object('members',n));
END $$;
CREATE FUNCTION app.committee_guest_write(iid uuid,session_digest text,expected integer,payload jsonb,command uuid,final_value boolean,commit_value boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE i app.committee_invitations;r app.committee_rounds;old app.current_committee_members;draft app.committee_member_drafts;q integer;t timestamptz:=app.governance_now();BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(iid::text,101));i:=app.committee_guest(iid,session_digest);SELECT * INTO r FROM app.committee_rounds WHERE case_id=i.case_id FOR UPDATE;
 SELECT * INTO old FROM app.current_committee_members WHERE invite_id=iid;
 IF old.id IS NOT NULL THEN
  IF final_value AND old.id=command AND old.payload=payload THEN RETURN jsonb_build_object('receipt',jsonb_build_object('id',old.id,'total',old.quarter_points::numeric/4,'submittedAt',old.submitted_at));END IF;
  RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ALREADY_SUBMITTED';
 END IF;
 SELECT * INTO draft FROM app.committee_member_drafts WHERE invite_id=iid;
 IF coalesce(draft.revision,0)<>expected OR r.completed_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_DRAFT';END IF;
 q:=app.committee_validate(r.submission_id,payload,final_value);
 IF NOT final_value THEN
  INSERT INTO app.committee_member_drafts VALUES(iid,expected+1,payload,t) ON CONFLICT(invite_id) DO UPDATE SET revision=expected+1,payload=EXCLUDED.payload,saved_at=t;
  PERFORM app.committee_event(i.case_id,iid,NULL,'draft_saved');RETURN jsonb_build_object('revision',expected+1,'savedAt',t);
 END IF;
 IF r.sealed_at IS NULL OR (SELECT count(*) FROM app.committee_invitations WHERE case_id=i.case_id AND revoked_at IS NULL)<2 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='SEALED_ROSTER_REQUIRED';END IF;
 IF NOT commit_value THEN RETURN app.committee_file_scope(iid,session_digest);END IF;
 INSERT INTO app.committee_member_assessments(id,invite_id,case_id,recipient_email_snapshot,rubric_code,rubric_hash,payload,quarter_points,submitted_at) SELECT command,iid,i.case_id,i.email,'CORE_V1',config_hash,payload,q,t FROM app.rubric_versions WHERE code='CORE_V1' AND config_hash=encode(sha256(convert_to(config::text,'UTF8')),'hex');
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='RUBRIC_INTEGRITY';END IF;
 UPDATE app.committee_invitations SET submitted_at=t WHERE id=iid;
 PERFORM app.committee_event(i.case_id,iid,NULL,'member_submitted',NULL,jsonb_build_object('assessment',command));PERFORM app.committee_derive(i.case_id);
 RETURN jsonb_build_object('receipt',jsonb_build_object('id',command,'total',q::numeric/4,'submittedAt',t));
END $$;
--> statement-breakpoint
CREATE FUNCTION app.committee_event(cid uuid,iid uuid,who uuid,action_value text,reason_value text DEFAULT NULL,detail_value jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE ec app.evaluation_cases;ev uuid:=gen_random_uuid();BEGIN
 SELECT * INTO ec FROM app.evaluation_cases WHERE id=cid;
 INSERT INTO app.committee_events(id,case_id,invite_id,actor_id,action,reason,detail) VALUES(ev,cid,iid,who,action_value,reason_value,detail_value);
 INSERT INTO app.audit_logs(id,actor_id,actor_role,actor_kind,university_id,action,object_type,object_id,project_id,version_id,correlation_id,event_key,after_state,reason)
 VALUES(ev,who,CASE WHEN who IS NULL THEN NULL ELSE (SELECT role_code FROM app.users WHERE id=who) END,CASE WHEN who IS NULL THEN 'system' ELSE 'user' END,ec.university_id,'committee.'||action_value,'committee_round',cid,ec.project_id,ec.version_id,ev,ev,jsonb_build_object('scope',jsonb_build_object('invitation',iid,'action',action_value,'detail',detail_value)::text),reason_value);
 INSERT INTO app.outbox_events(event_id,kind) VALUES(ev,'core.audit.committed');
END $$;
CREATE FUNCTION app.committee_round_for(who uuid,sid uuid,sub uuid,mutable boolean DEFAULT false) RETURNS app.committee_rounds LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE p app.projects;c app.evaluation_cases;r app.committee_rounds;BEGIN
 p:=app.evaluation_actor(who,sid,sub,false);
 IF p.supervisor_id<>who OR (app.assignment_principal(who,sid)).role_code<>'faculty_supervisor' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ASSIGNED_SUPERVISOR_REQUIRED';END IF;
 SELECT * INTO c FROM app.evaluation_cases WHERE submission_id=sub;
 IF c.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='SUPERVISOR_ASSESSMENT_REQUIRED';END IF;
 SELECT * INTO r FROM app.committee_rounds WHERE case_id=c.id FOR UPDATE;
 IF r.case_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='HISTORICAL_COMMITTEE_READ_ONLY';END IF;
 IF mutable AND (r.completed_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app.project_versions v WHERE v.id=c.version_id AND v.status='pending_review') OR NOT EXISTS(SELECT 1 FROM app.project_submissions s WHERE s.id=sub AND s.id=(SELECT id FROM app.project_submissions WHERE version_id=c.version_id ORDER BY round_number DESC LIMIT 1)) OR NOT EXISTS(SELECT 1 FROM app.academic_final_admissions WHERE submission_id=sub AND outcome='accepted')) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='COMMITTEE_ROUND_CLOSED';END IF;
 RETURN r;
END $$;
CREATE FUNCTION app.committee_status(who uuid,sid uuid,sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.committee_rounds;BEGIN
 r:=app.committee_round_for(who,sid,sub);
 RETURN jsonb_build_object('submission',sub,'case',r.case_id,'revision',r.revision,'policy',r.policy,'sealedAt',r.sealed_at,'completedAt',r.completed_at,
 'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'name',i.display_name,'locale',i.locale,'expiresAt',i.expires_at,'revokedAt',i.revoked_at,'verifiedAt',i.verified_at,'submittedAt',i.submitted_at,'delivery',(SELECT jsonb_build_object('state',m.state,'attempts',m.attempts,'code',m.code,'finishedAt',m.finished_at) FROM app.committee_mail_outbox m WHERE m.invite_id=i.id AND m.purpose='COMMITTEE_INVITE' ORDER BY created_at DESC LIMIT 1)) ORDER BY i.created_at,i.id),'[]') FROM app.committee_invitations i WHERE i.case_id=r.case_id),
 'result',(SELECT jsonb_build_object('id',id,'total',mean_quarter_points/4,'members',member_count,'criterionMeans',criterion_means,'finalizedAt',finalized_at,'type','system_computed_aggregate') FROM app.committee_results WHERE case_id=r.case_id ORDER BY finalized_at DESC LIMIT 1));
END $$;
CREATE FUNCTION app.committee_manage(who uuid,sid uuid,sub uuid,expected integer,operation text,iid uuid,address text,name_value text,locale_value text,reason_value text,token_digest text,message_id uuid,encrypted text,key_version text,command uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE r app.committee_rounds;i app.committee_invitations;t timestamptz:=app.governance_now();BEGIN
 r:=app.committee_round_for(who,sid,sub,true);
 IF EXISTS(SELECT 1 FROM app.committee_mail_outbox m JOIN app.committee_invitations inv ON inv.id=m.invite_id WHERE m.dedupe=command AND inv.case_id=r.case_id) THEN RETURN app.committee_status(who,sid,sub);END IF;
 IF r.revision<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_ROSTER';END IF;
 IF operation NOT IN ('invite','resend','revoke') OR (r.sealed_at IS NOT NULL AND char_length(btrim(coalesce(reason_value,'')))<10) OR char_length(coalesce(reason_value,''))>1000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ROSTER_CHANGE_REASON_REQUIRED';END IF;
 IF operation='invite' THEN
  IF EXISTS(SELECT 1 FROM app.committee_invitations WHERE case_id=r.case_id AND email=address) OR (SELECT count(*) FROM app.committee_invitations WHERE case_id=r.case_id AND revoked_at IS NULL)>=20 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DUPLICATE_OR_LIMIT';END IF;
  IF token_digest !~ '^[a-f0-9]{64}$' OR length(encrypted)>40000 OR length(name_value)>200 OR locale_value NOT IN ('en','ar') OR address IS NULL OR address<>(lower(btrim(address))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_INPUT';END IF;
  INSERT INTO app.committee_invitations(id,case_id,email,display_name,locale,token_hash,invited_by,created_at,expires_at,last_sent_at) VALUES(iid,r.case_id,address,name_value,locale_value,token_digest,who,t,t+interval '14 days',t) RETURNING * INTO i;
 ELSE
  SELECT * INTO i FROM app.committee_invitations WHERE id=iid AND case_id=r.case_id FOR UPDATE;
  IF i.id IS NULL OR i.submitted_at IS NOT NULL OR i.revoked_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='INVITATION_CLOSED';END IF;
  IF operation='resend' AND i.last_sent_at>t-interval '60 seconds' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='RESEND_COOLDOWN';END IF;
  UPDATE app.committee_invitations SET generation=generation+1,token_hash=CASE WHEN operation='resend' THEN token_digest ELSE token_hash END,expires_at=CASE WHEN operation='resend' THEN t+interval '14 days' ELSE expires_at END,last_sent_at=CASE WHEN operation='resend' THEN t ELSE last_sent_at END,revoked_at=CASE WHEN operation='revoke' THEN t END WHERE id=iid RETURNING * INTO i;
  UPDATE app.committee_guest_sessions SET revoked_at=t WHERE invite_id=iid AND revoked_at IS NULL;
 END IF;
 IF operation<>'revoke' THEN INSERT INTO app.committee_mail_outbox(id,invite_id,generation,purpose,recipient,ciphertext,key_id,dedupe,next_at,expires_at) VALUES(message_id,i.id,i.generation,'COMMITTEE_INVITE',i.email,encrypted,key_version,command,t,i.expires_at);END IF;
 UPDATE app.committee_rounds SET revision=revision+1,sealed_at=CASE WHEN (SELECT count(*) FROM app.committee_invitations WHERE case_id=r.case_id AND revoked_at IS NULL)>=2 THEN t ELSE NULL END,roster_hash=(SELECT encode(sha256(convert_to(coalesce(string_agg(id::text,',' ORDER BY id),''),'UTF8')),'hex') FROM app.committee_invitations WHERE case_id=r.case_id AND revoked_at IS NULL) WHERE case_id=r.case_id;
 PERFORM app.committee_event(r.case_id,i.id,who,operation,reason_value);
 RETURN app.committee_status(who,sid,sub);
END $$;
--> statement-breakpoint
CREATE FUNCTION app.committee_live_invite(iid uuid) RETURNS app.committee_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE i app.committee_invitations;c app.evaluation_cases;p app.projects;BEGIN
 SELECT * INTO i FROM app.committee_invitations WHERE id=iid;
 SELECT ec.* INTO c FROM app.evaluation_cases ec WHERE ec.id=i.case_id;SELECT * INTO p FROM app.projects WHERE id=c.project_id;
 IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.expires_at<=app.governance_now() OR NOT EXISTS(SELECT 1 FROM app.universities WHERE id=c.university_id AND status='active') OR NOT EXISTS(SELECT 1 FROM app.users WHERE id=p.supervisor_id AND account_status='active') OR p.current_version_id<>c.version_id OR NOT EXISTS(SELECT 1 FROM app.project_submissions WHERE id=c.submission_id AND id=(SELECT id FROM app.project_submissions WHERE version_id=c.version_id ORDER BY round_number DESC LIMIT 1)) OR NOT EXISTS(SELECT 1 FROM app.project_versions WHERE id=c.version_id AND status='pending_review') THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='INVITATION_UNAVAILABLE';END IF;
 RETURN i;
END $$;
CREATE FUNCTION app.committee_challenge_issue(iid uuid,token_digest text,address text,code_digest text,message_id uuid,encrypted text,key_version text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE i app.committee_invitations;t timestamptz:=app.governance_now();ch app.committee_challenges;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(iid::text,101));i:=app.committee_live_invite(iid);
 IF i.token_hash IS DISTINCT FROM token_digest OR i.email IS DISTINCT FROM address OR i.submitted_at IS NOT NULL OR code_digest !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('accepted',true);END IF;
 SELECT * INTO ch FROM app.committee_challenges WHERE invite_id=iid;
 IF ch.resend_after>t THEN RETURN jsonb_build_object('accepted',true);END IF;
 INSERT INTO app.committee_challenges VALUES(iid,code_digest,i.generation,t,t+interval '10 minutes',NULL,0,t+interval '60 seconds') ON CONFLICT(invite_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,generation=EXCLUDED.generation,issued_at=t,expires_at=EXCLUDED.expires_at,consumed_at=NULL,attempts=0,resend_after=EXCLUDED.resend_after;
 INSERT INTO app.committee_mail_outbox(id,invite_id,generation,purpose,recipient,ciphertext,key_id,dedupe,next_at,expires_at) VALUES(message_id,iid,i.generation,'COMMITTEE_OTP',i.email,encrypted,key_version,message_id,t,t+interval '10 minutes');
 PERFORM app.committee_event(i.case_id,i.id,NULL,'verification_sent');RETURN jsonb_build_object('accepted',true);
END $$;
CREATE FUNCTION app.committee_verify(iid uuid,token_digest text,address text,code_digest text,session_digest text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE i app.committee_invitations;ch app.committee_challenges;t timestamptz:=app.governance_now();BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(iid::text,101));i:=app.committee_live_invite(iid);SELECT * INTO ch FROM app.committee_challenges WHERE invite_id=iid FOR UPDATE;
 IF i.token_hash IS DISTINCT FROM token_digest OR i.email IS DISTINCT FROM address OR ch.invite_id IS NULL OR ch.generation<>i.generation OR ch.consumed_at IS NOT NULL OR ch.expires_at<=t OR ch.attempts>=6 OR session_digest !~ '^[a-f0-9]{64}$' THEN RETURN false;END IF;
 UPDATE app.committee_challenges SET attempts=attempts+1 WHERE invite_id=iid;
 IF ch.code_hash IS DISTINCT FROM code_digest THEN PERFORM app.committee_event(i.case_id,i.id,NULL,'verification_failed');RETURN false;END IF;
 UPDATE app.committee_challenges SET consumed_at=t WHERE invite_id=iid;
 INSERT INTO app.committee_guest_sessions VALUES(session_digest,iid,i.generation,t,least(t+interval '2 hours',i.expires_at),NULL);
 UPDATE app.committee_invitations SET verified_at=coalesce(verified_at,t) WHERE id=iid;
 PERFORM app.committee_event(i.case_id,i.id,NULL,'verified');RETURN true;
END $$;
CREATE FUNCTION app.committee_guest(iid uuid,session_digest text) RETURNS app.committee_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE i app.committee_invitations;BEGIN
 i:=app.committee_live_invite(iid);
 IF NOT EXISTS(SELECT 1 FROM app.committee_guest_sessions WHERE session_hash=session_digest AND invite_id=iid AND generation=i.generation AND revoked_at IS NULL AND expires_at>app.governance_now()) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='INVITATION_UNAVAILABLE';END IF;
 RETURN i;
END $$;
CREATE FUNCTION app.committee_guest_read(iid uuid,session_digest text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE i app.committee_invitations;c app.evaluation_cases;s app.project_submissions;BEGIN
 i:=app.committee_guest(iid,session_digest);SELECT * INTO c FROM app.evaluation_cases WHERE id=i.case_id;SELECT * INTO s FROM app.project_submissions WHERE id=c.submission_id;
 RETURN jsonb_build_object('invitation',i.id,'project',c.project_id,'version',c.version_id,'submission',s.id,'round',s.round_number,'metadata',s.metadata_snapshot,'authors',(SELECT jsonb_agg(jsonb_build_object('name',x->>'name') ORDER BY n) FROM jsonb_array_elements(s.authors_snapshot) WITH ORDINALITY a(x,n)),
 'deadline',i.expires_at,'name',i.display_name,'email',i.email,'policy','COMMITTEE_GUEST_V1','rubric',(SELECT config||jsonb_build_object('hash',config_hash) FROM app.rubric_versions WHERE code='CORE_V1'),
 'files',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',file_id,'path',relative_path,'name',regexp_replace(relative_path,'^.*/',''),'size',size_at_submit,'mime',mime_at_submit,'extension',lower(regexp_replace(relative_path,'^.*[.]','')),'visibility','Restricted') ORDER BY relative_path),'[]') FROM app.submission_files WHERE submission_id=s.id),
 'draft',(SELECT jsonb_build_object('revision',revision,'payload',payload,'savedAt',saved_at) FROM app.committee_member_drafts WHERE invite_id=iid),
 'receipt',(SELECT jsonb_build_object('id',id,'total',quarter_points::numeric/4,'submittedAt',submitted_at,'payload',payload) FROM app.committee_member_assessments WHERE invite_id=iid ORDER BY submitted_at DESC LIMIT 1));
END $$;
CREATE FUNCTION app.committee_file_scope(iid uuid,session_digest text,fid uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE i app.committee_invitations;c app.evaluation_cases;files jsonb;BEGIN
 i:=app.committee_guest(iid,session_digest);IF i.submitted_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='ASSESSMENT_COMPLETE';END IF;
 SELECT * INTO c FROM app.evaluation_cases WHERE id=i.case_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',sf.file_id,'path',sf.relative_path,'name',regexp_replace(sf.relative_path,'^.*/',''),'size',sf.size_at_submit,'mime',sf.mime_at_submit,'sha256',sf.sha256_at_submit,'extension',lower(regexp_replace(sf.relative_path,'^.*[.]','')),'key',o.storage_key) ORDER BY sf.relative_path),'[]') INTO files FROM app.submission_files sf JOIN app.storage_objects o ON o.id=sf.storage_object_id AND o.project_id=sf.project_id AND o.university_id=sf.university_id WHERE sf.submission_id=c.submission_id AND (fid IS NULL OR sf.file_id=fid) AND (sf.size_at_submit,sf.sha256_at_submit)=(o.size_bytes,o.sha256);
 IF fid IS NOT NULL AND jsonb_array_length(files)<>1 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FILE_UNAVAILABLE';END IF;
 RETURN jsonb_build_object('project',c.project_id,'version',c.version_id,'submission',c.submission_id,'files',files);
END $$;
