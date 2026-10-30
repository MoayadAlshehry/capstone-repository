-- Current lead is governed membership authority; frozen submitted attribution stays locked.
-- Only the existing assignment command can write these rows for runtime callers.
DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('app.round_author_lock()'::regprocedure);
 IF position('IF state IN' in d)=0 THEN RAISE EXCEPTION 'AUTHOR_LOCK_BASELINE_MISMATCH'; END IF;
 d:=replace(d,'IF state IN','IF TG_OP=''UPDATE'' AND (to_jsonb(NEW)-''is_team_lead'') IS NOT DISTINCT FROM (to_jsonb(OLD)-''is_team_lead'') THEN RETURN NEW; END IF; IF state IN');
 EXECUTE d;
END $$;
