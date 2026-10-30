-- A faculty-published archive with a verified derived committee result is a real
-- assessed archive. Do not require a fabricated legacy recorder row to make it discoverable.
DO $$ DECLARE f record;d text;BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('partner_archive_eligible','catalogue_query','catalogue_routes') LOOP
  d:=pg_get_functiondef(f.oid);d:=replace(d,'app.internal_assessments','app.effective_internal_assessments');EXECUTE d;
 END LOOP;
END $$;
-- Compatibility is based on actual original lead authorization, never supervisor provenance.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.first_pair_reasons(uuid)'::regprocedure);
 d:=replace(d,'JOIN app.full_final_packet_consents co ON co.packet_id=ap.id','LEFT JOIN app.full_final_packet_consents co ON co.packet_id=ap.id');
 d:=replace(d,'WHERE ap.id=packet AND','WHERE ap.id=packet AND (co.packet_id IS NOT NULL OR ap.manifest->>''schema''=''ACADEMIC_PACKET_V1'' AND EXISTS(SELECT 1 FROM app.users u WHERE u.id=ap.authorized_by AND u.role_code=''student'')) AND');EXECUTE d;
END $$;
-- PostgreSQL grants PUBLIC execute to new functions by default. Explicitly close
-- every new account entry point and internal candidate predicate again after replacement.
REVOKE ALL ON FUNCTION app.evaluation_prepare(uuid,uuid,uuid,integer,integer,jsonb,uuid,text),app.academic_draft_save(uuid,uuid,uuid,integer,integer,integer,jsonb,uuid,text),app.academic_decision_prepare(uuid,uuid,uuid,integer,integer,text,text,text,uuid,text),app.full_final_packet_state(uuid,uuid,uuid,uuid),app.full_final_packet_authorize(uuid,uuid,uuid,uuid,integer,text,boolean,uuid,boolean),app.evaluation_read(uuid,uuid,uuid),app.academic_round_read(uuid,uuid,uuid),app.academic_flow_state(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
REVOKE ALL ON FUNCTION app.external_candidate(uuid,uuid,boolean) FROM PUBLIC,capstone_runtime,capstone_jobs;
INSERT INTO app.evaluation_wake_events(kind) VALUES('derived_archive.compatibility');
