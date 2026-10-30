-- The recipient's authorized original-evaluator matter is a correction task,
-- including an independent assessment of another institution's submission.
-- Its own frozen context does not admit that institution's project or bytes.
ALTER FUNCTION app.academic_flow_inbox(uuid,uuid) RENAME TO academic_flow_inbox_before_governance;
REVOKE ALL ON FUNCTION app.academic_flow_inbox_before_governance(uuid,uuid) FROM PUBLIC,capstone_runtime,capstone_jobs;
CREATE FUNCTION app.academic_flow_inbox(who uuid,sid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE a app.users;previous jsonb;items jsonb;
BEGIN
 previous:=app.academic_flow_inbox_before_governance(who,sid);
 a:=app.assignment_principal(who,sid);
 WITH governed AS (
  SELECT n.id,jsonb_build_object('id',n.id,'type',n.type,'created_at',n.created_at,'read_at',n.read_at,
   'project',c.project_id,'title',s.metadata_snapshot->>'title','route','/evaluation/corrections/'||i.id::text) value
  FROM app.notifications n
  JOIN app.assessment_issues i ON i.id::text=n.payload->'link'->>'id'
  JOIN app.assessment_heads h ON h.id=i.logical_id AND h.case_id=i.case_id
  JOIN app.evaluation_cases c ON c.id=i.case_id AND c.project_id=n.project_id AND c.university_id=n.university_id
  JOIN app.project_submissions s ON s.id=h.submission_id AND s.id=c.submission_id
  WHERE n.recipient_id=who AND n.type LIKE 'evaluation.governance.%'
   AND n.payload->'link'->>'kind'='evaluation-governance'
   AND a.role_code='faculty_supervisor' AND h.evaluator_id=who AND i.authorized_at IS NOT NULL
  ORDER BY n.created_at DESC,n.id LIMIT 50
 ), combined AS (
  SELECT g.value FROM governed g
  UNION ALL
  SELECT x.value FROM jsonb_array_elements(previous->'items') x
  WHERE NOT EXISTS(SELECT 1 FROM governed g WHERE g.id::text=x.value->>'id')
 ), bounded AS (
  SELECT value FROM combined ORDER BY (value->>'created_at')::timestamptz DESC,(value->>'id')::uuid LIMIT 50
 )
 SELECT coalesce(jsonb_agg(value ORDER BY (value->>'created_at')::timestamptz DESC,(value->>'id')::uuid),'[]'::jsonb) INTO items FROM bounded;
 RETURN jsonb_set(previous,'{items}',items);
END $$;
REVOKE ALL ON FUNCTION app.academic_flow_inbox(uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.academic_flow_inbox(uuid,uuid) TO capstone_runtime;
