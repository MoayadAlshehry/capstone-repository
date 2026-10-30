-- Recheck a live capability after acquiring the roster lock. A concurrent revoke
-- must not leave a stale pre-lock authorization usable for a finalized form.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_guest_write_original(uuid,text,integer,jsonb,uuid,boolean,boolean)'::regprocedure);
 d:=replace(d,'WHERE case_id=i.case_id FOR UPDATE;','WHERE case_id=i.case_id FOR UPDATE;i:=app.committee_guest(iid,session_digest);');EXECUTE d;
 d:=pg_get_functiondef('app.committee_guest_write(uuid,text,integer,jsonb,uuid,boolean,boolean)'::regprocedure);
 d:=replace(d,'WHERE case_id=i.case_id FOR UPDATE;','WHERE case_id=i.case_id FOR UPDATE;i:=app.committee_guest(iid,session_digest);au:=app.committee_open_amendment(iid);IF au.id IS NULL THEN RAISE EXCEPTION USING ERRCODE=''40001'',MESSAGE=''AMENDMENT_CLOSED'';END IF;');EXECUTE d;
 d:=pg_get_functiondef('app.committee_verify(uuid,text,text,text,text)'::regprocedure);
 d:=replace(d,'i:=app.committee_live_invite(iid);','PERFORM 1 FROM app.committee_invitations WHERE id=iid FOR UPDATE;i:=app.committee_live_invite(iid);');EXECUTE d;
END $$;
ALTER TABLE app.committee_invitations ADD COLUMN active_supervisor_id uuid REFERENCES app.users(id);
UPDATE app.committee_invitations SET active_supervisor_id=invited_by;
ALTER TABLE app.committee_invitations ALTER COLUMN active_supervisor_id SET NOT NULL;
CREATE FUNCTION app.committee_invitation_issuer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$ BEGIN NEW.active_supervisor_id:=NEW.invited_by;RETURN NEW;END $$;
CREATE TRIGGER committee_invitation_issuer BEFORE INSERT ON app.committee_invitations FOR EACH ROW EXECUTE FUNCTION app.committee_invitation_issuer();
REVOKE ALL ON FUNCTION app.committee_invitation_issuer() FROM PUBLIC,capstone_runtime,capstone_jobs;
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_manage(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid)'::regprocedure);d:=replace(d,'SET generation=generation+1,token_hash=','SET active_supervisor_id=who,generation=generation+1,token_hash=');EXECUTE d;
 d:=pg_get_functiondef('app.committee_authorize_amendment(uuid,uuid,uuid,uuid,text,uuid,text,uuid,text,text)'::regprocedure);d:=replace(d,'SET token_hash=token_digest,generation=generation+1','SET active_supervisor_id=(SELECT supervisor_id FROM app.projects WHERE id=c.project_id),token_hash=token_digest,generation=generation+1');EXECUTE d;
 d:=pg_get_functiondef('app.committee_live_invite(uuid)'::regprocedure);d:=replace(d,'IF i.id IS NULL OR','IF i.active_supervisor_id IS DISTINCT FROM p.supervisor_id OR i.id IS NULL OR');EXECUTE d;
END $$;
