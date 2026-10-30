-- P5.3: preserve all existing policy and authority. The R07 outer live-scope
-- adapter locked an assignment before taking the reviewer's capacity lock in
-- external_command_r07. The allocator takes reviewer locks before assignment
-- rows; an accept/finalize/read could therefore deadlock with a real worker.
-- Take the same reviewer lock before the adapter's first assignment-row read.
-- This also covers native evidence and view paths using the same live predicate.
DO $lock_order$
DECLARE definition text;needle text;
BEGIN
 definition:=pg_get_functiondef('app.external_live(uuid,uuid,uuid,text)'::regprocedure);
 needle:='BEGIN t:=app.external_live_r07(who,sid,aid,required_status);';
 IF strpos(definition,needle)=0 OR strpos(definition,'pg_advisory_xact_lock')>0 THEN
  RAISE EXCEPTION 'P53_EXTERNAL_LIVE_BASELINE_MISMATCH';
 END IF;
 definition:=replace(definition,needle,
  'BEGIN PERFORM pg_advisory_xact_lock(hashtextextended(who::text,29)); t:=app.external_live_r07(who,sid,aid,required_status);');
 EXECUTE definition;
END $lock_order$;
