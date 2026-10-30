-- P5: the frozen FINAL reader advertises the same permitted ZIP as its
-- checkpoint sibling. Reuse exact-submission authorization, not the legacy
-- archived-working-edition ZIP path. No public, grant or reviewer rule changes.
DO $repair$
DECLARE d text;needle text;
BEGIN
 d:=pg_get_functiondef('app.file_delivery_read(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid)'::regprocedure);
 needle:='WHERE id=sub AND purpose=''CHECKPOINT''';
 IF strpos(d,needle)=0 THEN RAISE EXCEPTION 'P5_FINAL_ZIP_SOURCE_DRIFT';END IF;
 d:=replace(d,needle,
  'WHERE id=sub AND (purpose=''CHECKPOINT'' OR purpose=''FINAL'' AND EXISTS(SELECT 1 FROM app.academic_finals af WHERE af.submission_id=sub))');
 EXECUTE d;
END $repair$;
