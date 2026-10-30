-- Preserve the existing read authority and body. Add only immutable logical
-- identity and current head revision for commands bound to the displayed head.
ALTER FUNCTION app.evaluation_read(uuid,uuid,uuid) RENAME TO evaluation_read_before_head_context;
REVOKE ALL ON FUNCTION app.evaluation_read_before_head_context(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.evaluation_read(reader uuid,sid uuid,sub uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;assessments jsonb;
BEGIN
 result:=app.evaluation_read_before_head_context(reader,sid,sub);
 SELECT coalesce(jsonb_agg(entry.value||jsonb_build_object('logical',h.id,'headRevision',h.revision) ORDER BY entry.ordinality),'[]'::jsonb)
 INTO assessments FROM jsonb_array_elements(result->'assessments') WITH ORDINALITY entry(value,ordinality)
 JOIN app.assessment_heads h ON h.head_id=(entry.value->>'id')::uuid AND h.layer<>'external' AND h.submission_id=sub;
 RETURN jsonb_set(result,'{assessments}',assessments);
END $$;
REVOKE ALL ON FUNCTION app.evaluation_read(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.evaluation_read(uuid,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
ALTER FUNCTION app.external_view(uuid,uuid,uuid) RENAME TO external_view_before_head_context;
REVOKE ALL ON FUNCTION app.external_view_before_head_context(uuid,uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.external_view(who uuid,sid uuid,aid uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result jsonb;x jsonb;items jsonb:='[]';h app.assessment_heads;
BEGIN
 result:=app.external_view_before_head_context(who,sid,aid);
 FOR x IN SELECT value FROM jsonb_array_elements(CASE WHEN aid IS NULL THEN result->'items' ELSE jsonb_build_array(result) END) LOOP
  IF jsonb_typeof(x->'assessment')='object' THEN
   SELECT * INTO h FROM app.assessment_heads WHERE head_id=(x->'assessment'->>'id')::uuid AND layer='external' AND evaluator_id=who AND assignment_id=(x->>'id')::uuid;
   IF h.id IS NOT NULL THEN x:=jsonb_set(x,'{assessment}',x->'assessment'||jsonb_build_object('logical',h.id,'headRevision',h.revision));END IF;
  END IF;
  items:=items||jsonb_build_array(x);
 END LOOP;
 RETURN CASE WHEN aid IS NULL THEN result||jsonb_build_object('items',items) ELSE items->0 END;
END $$;
REVOKE ALL ON FUNCTION app.external_view(uuid,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.external_view(uuid,uuid,uuid) TO capstone_runtime;
