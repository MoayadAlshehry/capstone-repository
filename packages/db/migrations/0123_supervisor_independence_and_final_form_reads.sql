-- Creating the case early enables real lead consent; it must not accidentally
-- remove the original supervisor-before-committee independence prerequisite.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.committee_round_for(uuid,uuid,uuid,boolean)'::regprocedure);
 d:=replace(d,'IF mutable AND (','IF mutable AND (NOT EXISTS(SELECT 1 FROM app.current_internal_assessments WHERE submission_id=sub AND layer=''supervisor'') OR ');EXECUTE d;
 -- Finalized forms are available to the assigned supervisor and owning institution.
 -- The read models never query private member drafts or verification/session secrets.
 d:=pg_get_functiondef('app.committee_status(uuid,uuid,uuid)'::regprocedure);
 d:=replace(d,'''submittedAt'',i.submitted_at,','''submittedAt'',i.submitted_at,''finalAssessment'',(SELECT jsonb_build_object(''id'',a.id,''total'',a.quarter_points::numeric/4,''payload'',a.payload,''submittedAt'',a.submitted_at) FROM app.current_committee_members a WHERE a.invite_id=i.id),');EXECUTE d;
 d:=pg_get_functiondef('app.committee_governance_read(uuid,uuid)'::regprocedure);
 d:=replace(d,'''submittedAt'',a.submitted_at,','''submittedAt'',a.submitted_at,''payload'',a.payload,');EXECUTE d;
END $$;
