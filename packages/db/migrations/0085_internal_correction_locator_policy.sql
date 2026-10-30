-- The later R06 owner decision retired manual internal locators. Amendments
-- retain that same recorded UX V2 policy; referenced originals retain theirs.
DO $$ DECLARE d text;needle text;replacement text;
BEGIN
 d:=pg_get_functiondef('app.correction_form(jsonb,uuid)'::regprocedure);
 needle:=$n$modern:=app.original_correction_policy(logical)='ASSESSMENT_UX_V2';$n$;
 replacement:=needle||$n$
 IF modern AND o.layer<>'external' AND EXISTS(SELECT 1 FROM jsonb_array_elements(body->'criteria') criterion WHERE jsonb_typeof(criterion->'locators')='array' AND jsonb_array_length(criterion->'locators')>0) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='MANUAL_LOCATORS_RETIRED';END IF;$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'INTERNAL_CORRECTION_POLICY_DEFINITION_MISMATCH';END IF;
 EXECUTE replace(d,needle,replacement);
END $$;
