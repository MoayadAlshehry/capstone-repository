-- Owner R08 prerequisite: retire the unreadable-evidence command end to end.
-- Historical no-score closures/audit rows remain immutable and readable.
DO $$ DECLARE signature text; d text; BEGIN
 FOR signature IN SELECT unnest(ARRAY[
  'app.external_command(uuid,uuid,uuid,text,integer,jsonb,uuid,boolean)',
  'app.external_command_r07(uuid,uuid,uuid,text,integer,jsonb,uuid,boolean)'
 ]) LOOP
  d:=pg_get_functiondef(signature::regprocedure);
  IF position(',''inability''' in d)=0 THEN RAISE EXCEPTION 'RETIREMENT_BASELINE_MISMATCH'; END IF;
  d:=replace(d,',''inability''','');
  IF position('inability' in d)>0 THEN RAISE EXCEPTION 'RETIRED_BRANCH_REMAINS'; END IF;
  IF signature LIKE 'app.external_command(%' THEN
   d:=replace(d,'BEGIN','BEGIN IF operation NOT IN (''accept'',''decline'',''withdraw'',''save'',''finalize'') OR operation IS NULL THEN RAISE EXCEPTION USING ERRCODE=''22023'',MESSAGE=''INVALID_COMMAND''; END IF;');
  END IF;
  EXECUTE d;
 END LOOP;
 d:=pg_get_functiondef('app.allocation_wakeup()'::regprocedure);
 IF position('|inability' in d)=0 THEN RAISE EXCEPTION 'SCHEDULER_BASELINE_MISMATCH'; END IF;
 EXECUTE replace(d,'|inability','');
END $$;

