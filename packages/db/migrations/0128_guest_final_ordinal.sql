-- P5: checkpoints and assessed FINAL attempts have separate user-facing
-- ordinals. Keep the exact authorized submission identity; only correct its
-- read-only guest display number. Legacy finals retain their existing number.
DO $repair$
DECLARE f record;d text;needle text:='''round'',s.round_number';changed integer:=0;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='app' AND p.proname LIKE 'committee_guest_read%'
 LOOP
  d:=pg_get_functiondef(f.oid);
  IF strpos(d,needle)>0 THEN
   d:=replace(d,needle,
    '''round'',coalesce((SELECT number FROM app.academic_finals WHERE submission_id=s.id),s.round_number)');
   EXECUTE d;changed:=changed+1;
  END IF;
 END LOOP;
 IF changed<>1 THEN RAISE EXCEPTION 'P5_GUEST_FINAL_ORDINAL_SOURCE_DRIFT';END IF;
END $repair$;
