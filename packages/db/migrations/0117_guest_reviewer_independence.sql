-- Verified guest email is a separate identity, never a faculty account. Nevertheless,
-- a faculty account with that email cannot independently review the same project.
ALTER FUNCTION app.reviewer_candidate_facts(uuid,uuid) RENAME TO reviewer_candidate_facts_before_guest_identity;
CREATE FUNCTION app.reviewer_candidate_facts(reviewer uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE facts jsonb;matched boolean;resolved boolean;cid uuid;BEGIN
 facts:=app.reviewer_candidate_facts_before_guest_identity(reviewer,pid);IF facts IS NULL THEN RETURN NULL;END IF;
 SELECT c.id INTO cid FROM app.evaluation_cases c JOIN app.projects p ON p.published_version_id=c.version_id AND p.id=c.project_id WHERE p.id=pid;
 matched:=coalesce((facts->>'committeeNameOriginalMatch')::boolean,(facts->>'committeeNameMatch')::boolean,false) OR EXISTS(SELECT 1 FROM app.committee_invitations i JOIN app.evaluation_cases c ON c.id=i.case_id JOIN app.users u ON u.id=reviewer WHERE c.project_id=pid AND char_length(btrim(i.display_name))>=3 AND lower(normalize(btrim(i.display_name),NFC))=lower(normalize(btrim(u.full_name),NFC)));
 resolved:=coalesce((SELECT committee_name_resolved FROM app.evaluation_reviewer_relations WHERE case_id=cid AND reviewer_id=reviewer),false);
 RETURN facts||jsonb_build_object('committeeNameOriginalMatch',matched,'committeeNameMatch',matched AND NOT resolved,'committeeEmailConflict',EXISTS(SELECT 1 FROM app.committee_invitations i JOIN app.evaluation_cases c ON c.id=i.case_id JOIN app.users u ON u.id=reviewer AND lower(u.email)=i.email WHERE c.project_id=pid));
END $$;
REVOKE ALL ON FUNCTION app.reviewer_candidate_facts_before_guest_identity(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
REVOKE ALL ON FUNCTION app.reviewer_candidate_facts(uuid,uuid) FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.reviewer_candidate_facts(uuid,uuid) TO capstone_jobs;
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.external_candidate(uuid,uuid,boolean)'::regprocedure);
 d:=replace(d,'FROM app.committee_invitations i JOIN app.users u ON lower(u.email)=i.email WHERE i.case_id=cid','FROM app.committee_invitations i JOIN app.evaluation_cases guest_case ON guest_case.id=i.case_id JOIN app.academic_review_packets target ON target.case_id=cid AND target.project_id=guest_case.project_id JOIN app.users u ON lower(u.email)=i.email WHERE true');EXECUTE d;
 d:=pg_get_functiondef('app.first_pair_snapshot(boolean)'::regprocedure);
 d:=replace(d,'FROM app.committee_invitations i JOIN app.users u ON lower(u.email)=i.email WHERE i.case_id=(x->>''id'')::uuid','FROM app.committee_invitations i JOIN app.evaluation_cases guest_case ON guest_case.id=i.case_id JOIN app.users u ON lower(u.email)=i.email WHERE guest_case.project_id=(x->>''project'')::uuid');EXECUTE d;
END $$;
INSERT INTO app.evaluation_wake_events(kind) VALUES('verified_guest.independence');
