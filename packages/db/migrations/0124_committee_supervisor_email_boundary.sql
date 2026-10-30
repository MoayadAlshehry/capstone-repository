-- P5: mailbox verification does not make the supervisor an independent member.
-- No historical invitations, forms or receipts are rewritten.
CREATE FUNCTION app.committee_supervisor_email_conflict(cid uuid,address text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(
  SELECT 1 FROM app.evaluation_cases c
  JOIN app.projects p ON p.id=c.project_id
  JOIN app.users u ON u.id=p.supervisor_id
  WHERE c.id=cid AND lower(btrim(u.email))=lower(btrim(address))
 ) OR EXISTS(
  SELECT 1 FROM app.internal_assessments a
  JOIN app.users u ON u.id=a.recorded_by
  WHERE a.case_id=cid AND a.layer='supervisor'
    AND lower(btrim(u.email))=lower(btrim(address))
 ) OR EXISTS(
  SELECT 1 FROM app.committee_invitations i
  JOIN app.users u ON u.id=i.invited_by
  WHERE i.case_id=cid AND i.email=lower(btrim(address))
    AND lower(btrim(u.email))=lower(btrim(address))
 );
$$;
REVOKE ALL ON FUNCTION app.committee_supervisor_email_conflict(uuid,text)
 FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
DO $repair$
DECLARE d text;needle text;
BEGIN
 d:=pg_get_functiondef('app.committee_manage(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,uuid,text,text,uuid)'::regprocedure);
 needle:='IF r.revision<>expected THEN';
 IF strpos(d,needle)=0 OR strpos(d,'COMMITTEE_SUPERVISOR_CONFLICT')>0 THEN
  RAISE EXCEPTION 'P5_COMMITTEE_MANAGE_SOURCE_DRIFT';
 END IF;
 d:=replace(d,needle,
  'IF operation<>''revoke'' AND app.committee_supervisor_email_conflict(r.case_id,CASE WHEN operation=''invite'' THEN address ELSE (SELECT email FROM app.committee_invitations WHERE id=iid AND case_id=r.case_id) END) THEN RAISE EXCEPTION USING ERRCODE=''22023'',MESSAGE=''COMMITTEE_SUPERVISOR_CONFLICT'';END IF; '||needle);
 EXECUTE d;
 d:=pg_get_functiondef('app.committee_live_invite(uuid)'::regprocedure);
 needle:='IF i.active_supervisor_id IS DISTINCT FROM p.supervisor_id OR ';
 IF strpos(d,needle)=0 OR strpos(d,'committee_supervisor_email_conflict')>0 THEN
  RAISE EXCEPTION 'P5_COMMITTEE_INVITE_SOURCE_DRIFT';
 END IF;
 d:=replace(d,needle,
  'IF app.committee_supervisor_email_conflict(i.case_id,i.email) OR i.active_supervisor_id IS DISTINCT FROM p.supervisor_id OR ');
 EXECUTE d;
END $repair$;
