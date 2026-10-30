-- R07 native reader requires a nonempty verified integrity set.
-- V2 requests carry exactly the selected immutable object; legacy sets stay unchanged.
DO $$ DECLARE d text;BEGIN
 d:=pg_get_functiondef('app.file_delivery_read_before_checkpoint(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure);
 IF position($n$THEN '[]'::jsonb ELSE prepared->'files'$n$ IN d)=0 THEN RAISE EXCEPTION 'R07_NATIVE_PROJECTION_DEFINITION_MISMATCH';END IF;
 d:=replace(d,$n$THEN '[]'::jsonb ELSE prepared->'files'$n$,$r$THEN (SELECT coalesce(jsonb_agg(object),'[]') FROM jsonb_array_elements(prepared->'files') object WHERE object->>'key'=(result->0->>'key')) ELSE prepared->'files'$r$);
 EXECUTE d;
END $$;
