-- Known identity tokens remain literal matches, now insensitive to case.
-- Original assessment text, authority and release rules do not change.
CREATE FUNCTION app.feedback_replace_identity(value text,token text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE escaped text:='';ch text;
BEGIN
 IF value IS NULL OR token IS NULL OR token='' THEN RETURN value;END IF;
 FOR ch IN SELECT regexp_split_to_table(token,'') LOOP
  escaped:=escaped||CASE WHEN ch=ANY(ARRAY['.','[',']','(',')','{','}','*','+','?','^','$','|',chr(92)]) THEN chr(92)||ch ELSE ch END;
 END LOOP;
 RETURN regexp_replace(value,escaped,'[…]','gi');
END $$;
REVOKE ALL ON FUNCTION app.feedback_replace_identity(text,text) FROM PUBLIC,capstone_runtime,capstone_jobs;
DO $$ DECLARE d text;needle text;
BEGIN
 d:=pg_get_functiondef('app.feedback_redact(text,uuid)'::regprocedure);
 needle:=$n$s:=replace(s,token,'[…]');$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'FEEDBACK_IDENTITY_DEFINITION_MISMATCH';END IF;
 d:=replace(d,needle,$n$s:=app.feedback_replace_identity(s,token);$n$);
 needle:=$n$s:=replace(s,r.member,'[…]');$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'FEEDBACK_IDENTITY_DEFINITION_MISMATCH';END IF;
 EXECUTE replace(d,needle,$n$s:=app.feedback_replace_identity(s,r.member);$n$);
END $$;
