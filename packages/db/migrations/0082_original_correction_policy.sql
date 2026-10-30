-- Dispatch amendments from immutable original assessment provenance. Packet
-- shape is not an interaction-policy discriminator: existing curated tasks
-- could also be finalized under SIMPLE_EXTERNAL_V2 after R07.
CREATE FUNCTION app.original_correction_policy(logical uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM app.academic_assessment_provenance WHERE assessment_id=logical AND contract='ACADEMIC_FINAL_V1')
 OR EXISTS(SELECT 1 FROM app.external_assessments WHERE id=logical AND interaction_policy='SIMPLE_EXTERNAL_V2')
 THEN 'ASSESSMENT_UX_V2' ELSE 'REFERENCED_ASSESSMENT_V1' END
$$;
REVOKE ALL ON FUNCTION app.original_correction_policy(uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
-- Preserve the installed validator, rubric, locator membership/ranges, committee
-- provenance, text limits and control checks; relax only recorded UX V2 inputs.
DO $$ DECLARE d text; needle text; replacement text;
BEGIN
 d:=pg_get_functiondef('app.correction_form(jsonb,uuid)'::regprocedure);
 needle:=$n$packet uuid;$n$;replacement:=$n$packet uuid;modern boolean;$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'CORRECTION_POLICY_DEFINITION_MISMATCH';END IF;d:=replace(d,needle,replacement);
 needle:=$n$IF o.id IS NULL THEN RAISE EXCEPTION 'ASSESSMENT_NOT_FOUND';END IF;$n$;
 replacement:=needle||$n$ modern:=app.original_correction_policy(logical)='ASSESSMENT_UX_V2';$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'CORRECTION_POLICY_DEFINITION_MISMATCH';END IF;d:=replace(d,needle,replacement);
 needle:=$n$RETURN app.external_form(body,packet,true);$n$;
 replacement:=$n$IF modern THEN RETURN app.external_form(body,packet,true);ELSE RETURN app.external_form_legacy_r07(body,packet,true);END IF;$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'CORRECTION_POLICY_DEFINITION_MISMATCH';END IF;d:=replace(d,needle,replacement);
 needle:=$n$body->'calibration' IS DISTINCT FROM 'true'::jsonb$n$;
 replacement:=$n$(jsonb_typeof(body->'calibration') IS DISTINCT FROM 'boolean' OR NOT modern AND body->'calibration' IS DISTINCT FROM 'true'::jsonb)$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'CORRECTION_POLICY_DEFINITION_MISMATCH';END IF;d:=replace(d,needle,replacement);
 needle:=$n$NOT BETWEEN 50 AND 2000$n$;replacement:=$n$NOT BETWEEN (CASE WHEN modern THEN 0 ELSE 50 END) AND 2000$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'CORRECTION_POLICY_DEFINITION_MISMATCH';END IF;d:=replace(d,needle,replacement);
 needle:=$n$jsonb_array_length(c->'locators')<1$n$;replacement:=$n$(NOT modern AND jsonb_array_length(c->'locators')<1)$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'CORRECTION_POLICY_DEFINITION_MISMATCH';END IF;d:=replace(d,needle,replacement);
 needle:=$n$lev IN (0,4) AND$n$;replacement:=$n$NOT modern AND lev IN (0,4) AND$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'CORRECTION_POLICY_DEFINITION_MISMATCH';END IF;d:=replace(d,needle,replacement);
 EXECUTE d;
END $$;
--> statement-breakpoint
-- Verify the immutable original scope even when the optional locator set is
-- empty. This is server integrity verification, not a new human byte grant.
DO $$ DECLARE d text;needle text;replacement text;
BEGIN
 d:=pg_get_functiondef('app.governance_command(uuid,uuid,text,jsonb,uuid,boolean)'::regprocedure);
 needle:=$n$WHERE sf.submission_id=h.submission_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'form'->'criteria') criterion CROSS JOIN LATERAL jsonb_array_elements(criterion->'locators') locator WHERE locator->>'file'=sf.file_id::text);$n$;
 replacement:=$n$WHERE sf.submission_id=h.submission_id AND (
   app.original_correction_policy(h.id)='ASSESSMENT_UX_V2' AND (
     h.layer<>'external' OR EXISTS(SELECT 1 FROM app.external_review_assignments t JOIN app.academic_review_packets ap ON ap.id=t.packet_id CROSS JOIN LATERAL jsonb_array_elements(ap.manifest->'entries') entry WHERE t.id=h.assignment_id AND ap.submission_id=sf.submission_id AND entry->>'id'=sf.file_id::text)
   ) OR app.original_correction_policy(h.id)='REFERENCED_ASSESSMENT_V1' AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'form'->'criteria') criterion CROSS JOIN LATERAL jsonb_array_elements(criterion->'locators') locator WHERE locator->>'file'=sf.file_id::text)
 );
 IF files IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='EVIDENCE_UNAVAILABLE';END IF;$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'CORRECTION_EVIDENCE_DEFINITION_MISMATCH';END IF;
 EXECUTE replace(d,needle,replacement);
END $$;
--> statement-breakpoint
ALTER FUNCTION app.governance_view(uuid,uuid,uuid,uuid) RENAME TO governance_view_before_correction_policy;
REVOKE ALL ON FUNCTION app.governance_view_before_correction_policy(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.governance_view(who uuid,sid uuid,case_value uuid DEFAULT NULL,issue_value uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;assessments jsonb;
BEGIN
 result:=app.governance_view_before_correction_policy(who,sid,case_value,issue_value);
 SELECT coalesce(jsonb_agg(entry.value||jsonb_build_object('correctionPolicy',app.original_correction_policy((entry.value->>'logical')::uuid)) ORDER BY entry.ordinality),'[]'::jsonb)
 INTO assessments FROM jsonb_array_elements(result->'assessments') WITH ORDINALITY entry(value,ordinality);
 RETURN jsonb_set(result,'{assessments}',assessments);
END $$;
REVOKE ALL ON FUNCTION app.governance_view(uuid,uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.governance_view(uuid,uuid,uuid,uuid) TO capstone_runtime;
