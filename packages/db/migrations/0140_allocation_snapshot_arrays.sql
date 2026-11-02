-- Reduce allocation snapshot construction while retaining the authoritative
-- reviewer facts, capacity locks, case/reviewer order and lead-consent boundary.
-- Workloads are aggregated only after all existing reviewer capacity locks are held.
-- No policy thresholds, permissions or statement timeouts change.
CREATE OR REPLACE FUNCTION app.allocation_snapshot_before_lead_consent()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE c record;r record;facts jsonb;packet jsonb;reviewers jsonb;case_items jsonb[]:='{}';reviewer_items jsonb[];loads jsonb;prereq app.evaluation_allocation_prerequisites;rel app.evaluation_reviewer_relations;cur app.evaluation_allocation_cursor;
BEGIN
 PERFORM app.progression_tick();
 PERFORM pg_advisory_xact_lock(4630);
 SELECT * INTO cur FROM app.evaluation_allocation_cursor WHERE policy_code='EVAL_POLICY_V1' FOR UPDATE;
 -- Same authoritative Phase29 capacity locks, acquired before project locks.
 FOR r IN SELECT user_id FROM app.reviewer_profiles ORDER BY user_id LOOP PERFORM pg_advisory_xact_lock(hashtextextended(r.user_id::text,29));END LOOP;
 SELECT coalesce(jsonb_object_agg(stats.reviewer_id::text,jsonb_build_object('workload',stats.workload,'lastAssignedAt',stats.last_assigned)),'{}'::jsonb) INTO loads
 FROM (SELECT reviewer_id,count(*) FILTER(WHERE status IN ('offered','accepted')) workload,max(offered_at) last_assigned FROM app.external_review_assignments GROUP BY reviewer_id) stats;
 FOR c IN SELECT ec.*,v.domain,v.academic_year,v.keywords,v.archived_at,v.status,v.approved_submission_id,p.published_version_id,a.lane,a.admitted_at,a.waiting_since,w.current_packet_id FROM app.evaluation_cases ec JOIN app.projects p ON p.id=ec.project_id JOIN app.project_versions v ON v.id=ec.version_id LEFT JOIN app.evaluation_case_admissions a ON a.case_id=ec.id LEFT JOIN app.academic_packet_workspaces w ON w.case_id=ec.id ORDER BY ec.id LOOP
  SELECT * INTO prereq FROM app.evaluation_allocation_prerequisites WHERE case_id=c.id;
  packet:=NULL;
  IF c.current_packet_id IS NOT NULL THEN BEGIN packet:=app.external_packet(c.current_packet_id);IF packet->'manifest'->>'schema' IS DISTINCT FROM 'FULL_FINAL_ARTIFACTS_V2' THEN packet:=NULL;END IF;EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE '23514' THEN packet:=NULL;END;END IF;
  reviewer_items:='{}';
  FOR r IN SELECT rp.user_id,rp.expertise_tags FROM app.reviewer_profiles rp ORDER BY rp.user_id LOOP
   facts:=app.reviewer_candidate_facts(r.user_id,c.project_id);SELECT * INTO rel FROM app.evaluation_reviewer_relations WHERE case_id=c.id AND reviewer_id=r.user_id;
   reviewer_items:=array_append(reviewer_items,facts||jsonb_build_object('id',r.user_id,'tags',r.expertise_tags,'workload',coalesce(loads->(r.user_id::text)->'workload','0'::jsonb),'lastAssignedAt',loads->(r.user_id::text)->'lastAssignedAt','conflict',coalesce(rel.conflict,false),'committeeConflict',coalesce(rel.committee_conflict,false),'committeeNameMatch',coalesce(facts->'committeeNameOriginalMatch',facts->'committeeNameMatch'),'committeeNameResolved',coalesce(rel.committee_name_resolved,false),'participated',EXISTS(SELECT 1 FROM app.external_review_assignments WHERE reviewer_id=r.user_id AND case_id=c.id)));
  END LOOP;
  reviewers:=to_jsonb(reviewer_items);
  case_items:=array_append(case_items,jsonb_build_object('id',c.id,'project',c.project_id,'version',c.version_id,'university',c.university_id,'domain',c.domain,'academicYear',c.academic_year,'publishedAt',coalesce(c.archived_at,c.created_at),'waitingSince',coalesce(c.waiting_since,c.archived_at,c.created_at),'current',c.published_version_id=c.version_id,'archived',c.status='archived','approved',c.approved_submission_id=c.submission_id,'compatible',c.rubric_code='CORE_V1','supervisor',(SELECT jsonb_build_object('quarterPoints',ia.quarter_points,'levels',(SELECT jsonb_object_agg(code,level) FROM app.effective_internal_criterion_scores WHERE assessment_id=ia.id)) FROM app.effective_internal_assessments ia WHERE case_id=c.id AND layer='supervisor'),'committee',(SELECT jsonb_build_object('quarterPoints',ia.quarter_points,'levels',(SELECT jsonb_object_agg(code,level) FROM app.effective_internal_criterion_scores WHERE assessment_id=ia.id)) FROM app.effective_internal_assessments ia WHERE case_id=c.id AND layer='committee'),'packet',c.current_packet_id,'packetReadable',packet IS NOT NULL,'hold',coalesce(prereq.hold,false),'discrepancy',EXISTS(SELECT 1 FROM app.effective_internal_disagreements WHERE case_id=c.id),'explained',prereq.explanation IS NOT NULL,'tags',c.keywords,'languages',coalesce(packet->'manifest'->'languages','[]'),'admittedAt',c.admitted_at,'lane',c.lane,'completed',(SELECT count(*) FROM app.current_external_assessments WHERE case_id=c.id),'initialHistory',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND slot<=2),'active',(SELECT count(*) FROM app.external_review_assignments WHERE case_id=c.id AND status IN ('offered','accepted')),'progression',(SELECT jsonb_build_object('state',pr.state,'n',pr.n,'sumQuarterPoints',pr.sum_quarter_points,'rangeQuarterPoints',pr.max_quarter_points-pr.min_quarter_points,'threshold',pr.threshold,'activeInitial',pr.active_initial,'activeExpansion',pr.active_expansion,'reasons',pr.reasons,'run',pr.last_decision) FROM app.evaluation_progression pr WHERE pr.case_id=c.id),'nextSlot',(SELECT next_slot FROM app.evaluation_progression WHERE case_id=c.id),'expansionActive',EXISTS(SELECT 1 FROM app.external_review_assignments WHERE case_id=c.id AND slot>2 AND status IN ('offered','accepted')),'expansionReady',coalesce(prereq.expansion_ready,false),'files',coalesce(packet->'files','[]'),'reviewers',reviewers,'represented',(SELECT coalesce(jsonb_agg(DISTINCT institution_id),'[]') FROM app.external_review_assignments WHERE case_id=c.id AND (status IN ('offered','accepted') OR EXISTS(SELECT 1 FROM app.current_external_assessments ca WHERE ca.assignment_id=app.external_review_assignments.id)))));
 END LOOP;
 RETURN jsonb_build_object('policy',(SELECT to_jsonb(p) FROM app.evaluation_policies p WHERE code='EVAL_POLICY_V1'),'revision',cur.revision,'cursor',jsonb_build_object('lane',cur.lane,'domains',cur.domains,'universities',cur.universities),'cases',to_jsonb(case_items),'now',app.governance_now());
END $function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.allocation_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE value jsonb;item jsonb;items jsonb[]:='{}';
BEGIN
 value:=app.allocation_snapshot_before_lead_consent();
 FOR item IN SELECT x FROM jsonb_array_elements(value->'cases') x LOOP
  IF EXISTS(SELECT 1 FROM app.academic_review_packets p WHERE p.id=(item->>'packet')::uuid AND p.manifest->>'schema'='FULL_FINAL_ARTIFACTS_V2' AND NOT EXISTS(SELECT 1 FROM app.full_final_packet_consents f WHERE f.packet_id=p.id)) THEN item:=item||jsonb_build_object('packetReadable',false);END IF;
  items:=array_append(items,item);
 END LOOP;
 RETURN value||jsonb_build_object('cases',to_jsonb(items));
END $function$;
