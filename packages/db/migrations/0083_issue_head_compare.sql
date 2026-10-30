-- New issue composers supply the head/revision they displayed. Old admitted
-- callers without either field retain their explicit historical behavior.
-- Exact receipt replay remains before this compare and all issue mutations.
DO $$ DECLARE d text;needle text;replacement text;
BEGIN
 d:=pg_get_functiondef('app.governance_command(uuid,uuid,text,jsonb,uuid,boolean)'::regprocedure);
 needle:=$n$IF operation<>'issue' AND (i.revision IS DISTINCT FROM (body->>'expectedRevision')::integer OR h.head_id IS DISTINCT FROM (body->>'expectedHead')::uuid) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_GOVERNANCE';END IF;$n$;
 replacement:=needle||$n$
 IF operation='issue' AND (body ? 'expectedHead' OR body ? 'expectedRevision') THEN
  IF jsonb_typeof(body->'expectedHead') IS DISTINCT FROM 'string' OR jsonb_typeof(body->'expectedRevision') IS DISTINCT FROM 'number' OR (body->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  IF h.head_id IS DISTINCT FROM (body->>'expectedHead')::uuid OR h.revision IS DISTINCT FROM (body->>'expectedRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='STALE_GOVERNANCE';END IF;
 END IF;$n$;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'ISSUE_CAS_DEFINITION_MISMATCH';END IF;
 EXECUTE replace(d,needle,replacement);
END $$;
