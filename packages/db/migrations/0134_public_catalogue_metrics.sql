-- Public engagement is an operational aggregate, never an academic score or eligibility input.
CREATE TABLE app.public_project_daily_views (
 project_id uuid NOT NULL REFERENCES app.projects(id),version_id uuid NOT NULL REFERENCES app.project_versions(id),view_day date NOT NULL,views bigint NOT NULL CHECK(views>=0),PRIMARY KEY(project_id,version_id,view_day)
);
CREATE INDEX public_project_views_window ON app.public_project_daily_views(view_day,project_id,version_id) INCLUDE(views);
CREATE TABLE app.public_view_dedup (
 project_id uuid NOT NULL REFERENCES app.projects(id),version_id uuid NOT NULL REFERENCES app.project_versions(id),view_day date NOT NULL,visitor_digest text NOT NULL CHECK(visitor_digest ~ '^[a-f0-9]{64}$'),PRIMARY KEY(project_id,version_id,view_day,visitor_digest)
);
CREATE TABLE app.public_view_limits (
 network_digest text NOT NULL CHECK(network_digest ~ '^[a-f0-9]{64}$'),view_hour timestamptz NOT NULL,views integer NOT NULL CHECK(views BETWEEN 0 AND 120),PRIMARY KEY(network_digest,view_hour)
);
REVOKE ALL ON app.public_project_daily_views,app.public_view_dedup,app.public_view_limits FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.public_view_record(pid uuid,vid uuid,visitor text,network text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET TimeZone='UTC' AS $view$
DECLARE day_value date:=(clock_timestamp() AT TIME ZONE 'UTC')::date;hour_value timestamptz:=date_trunc('hour',clock_timestamp());n integer;inserted uuid;
BEGIN
 IF visitor !~ '^[a-f0-9]{64}$' OR network !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_VIEW';END IF;
 IF NOT EXISTS(SELECT 1 FROM app.projects p JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id AND v.university_id=p.university_id JOIN app.project_submissions s ON s.id=v.approved_submission_id AND s.project_id=p.id AND s.version_id=v.id WHERE p.id=pid AND v.id=vid AND p.assignment_managed AND v.status='archived' AND EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=s.id AND decision='archived') AND (SELECT count(*) FROM app.effective_internal_assessments WHERE submission_id=s.id AND rubric_code='CORE_V1')=2) THEN RETURN false;END IF;
 INSERT INTO app.public_view_limits(network_digest,view_hour,views) VALUES(network,hour_value,0) ON CONFLICT DO NOTHING;
 SELECT views INTO n FROM app.public_view_limits WHERE network_digest=network AND view_hour=hour_value FOR UPDATE;
 IF n>=120 THEN RETURN false;END IF;
 INSERT INTO app.public_view_dedup(project_id,version_id,view_day,visitor_digest) VALUES(pid,vid,day_value,visitor) ON CONFLICT DO NOTHING RETURNING project_id INTO inserted;
 IF inserted IS NULL THEN RETURN false;END IF;
 UPDATE app.public_view_limits SET views=views+1 WHERE network_digest=network AND view_hour=hour_value;
 INSERT INTO app.public_project_daily_views(project_id,version_id,view_day,views) VALUES(pid,vid,day_value,1) ON CONFLICT(project_id,version_id,view_day) DO UPDATE SET views=app.public_project_daily_views.views+1;
 RETURN true;
END $view$;
REVOKE ALL ON FUNCTION app.public_view_record(uuid,uuid,text,text) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.public_view_record(uuid,uuid,text,text) TO capstone_runtime;
--> statement-breakpoint
CREATE FUNCTION app.public_views_expire() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET TimeZone='UTC' AS $expire$
BEGIN
 DELETE FROM app.public_view_dedup WHERE view_day<(clock_timestamp() AT TIME ZONE 'UTC')::date-1;
 DELETE FROM app.public_view_limits WHERE view_hour<clock_timestamp()-interval'24 hours';
 DELETE FROM app.public_project_daily_views WHERE view_day<(clock_timestamp() AT TIME ZONE 'UTC')::date-34;
END $expire$;
REVOKE ALL ON FUNCTION app.public_views_expire() FROM PUBLIC,capstone_runtime;
GRANT EXECUTE ON FUNCTION app.public_views_expire() TO capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.catalogue_sort_metrics(who uuid,sid uuid) RETURNS TABLE(project uuid,version uuid,rating_tier integer,rating numeric,views bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app SET TimeZone='UTC' AS $metrics$
BEGIN
 IF who IS NOT NULL THEN PERFORM app.partner_access_principal(who,sid);ELSIF sid IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INVALID_READER';END IF;
 RETURN QUERY
 WITH allowed AS MATERIALIZED(SELECT (item->>'project')::uuid pid FROM jsonb_array_elements(app.catalogue_routes()) item),
 hidden AS MATERIALIZED(SELECT (item->>'version')::uuid vid FROM jsonb_array_elements(CASE WHEN who IS NULL THEN '[]'::jsonb ELSE app.external_concealed(who,sid) END) item),
 totals AS MATERIALIZED(SELECT e.case_id,count(*) n,sum(e.quarter_points) points,bool_and(e.rubric_code='EXTERNAL_V1' AND e.rubric_hash=(SELECT config_hash FROM app.rubric_versions WHERE code='EXTERNAL_V1')) compatible FROM app.current_external_assessments e GROUP BY e.case_id),
 popularity AS MATERIALIZED(SELECT d.project_id,d.version_id,sum(d.views)::bigint views FROM app.public_project_daily_views d WHERE d.view_day>=(clock_timestamp() AT TIME ZONE 'UTC')::date-29 GROUP BY d.project_id,d.version_id),
 scores AS(
 SELECT p.id pid,v.id vid,coalesce(pop.views,0)::bigint measured_views,
 CASE WHEN s.id IS NOT NULL AND cm.id IS NOT NULL THEN (2*s.quarter_points+3*cm.quarter_points)::numeric/20 END internal_score,
 CASE WHEN t.n>=2 AND t.compatible THEN t.points::numeric/(4*t.n) END external_score,
 NOT EXISTS(SELECT 1 FROM hidden h WHERE h.vid=v.id) AND s.id IS NOT NULL AND cm.id IS NOT NULL AND s.rubric_code='CORE_V1' AND cm.rubric_code='CORE_V1' AND s.rubric_hash=(SELECT config_hash FROM app.rubric_versions WHERE code='CORE_V1') AND cm.rubric_hash=s.rubric_hash
 AND NOT EXISTS(SELECT 1 FROM app.evaluation_holds h WHERE h.case_id=c.id AND h.state='open')
 AND NOT coalesce((SELECT legacy_hold FROM app.evaluation_allocation_prerequisites WHERE case_id=c.id),false)
 AND NOT(EXISTS(SELECT 1 FROM app.effective_internal_disagreements WHERE case_id=c.id) AND NOT EXISTS(SELECT 1 FROM app.evaluation_discrepancy_explanations WHERE case_id=c.id AND supervisor_head=s.id AND committee_head=cm.id)) rankable
 FROM allowed a JOIN app.projects p ON p.id=a.pid JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id
 JOIN app.evaluation_cases c ON c.submission_id=v.approved_submission_id AND c.project_id=p.id AND c.version_id=v.id
 LEFT JOIN app.effective_internal_assessments s ON s.case_id=c.id AND s.layer='supervisor'
 LEFT JOIN app.effective_internal_assessments cm ON cm.case_id=c.id AND cm.layer='committee'
 LEFT JOIN totals t ON t.case_id=c.id LEFT JOIN popularity pop ON pop.project_id=p.id AND pop.version_id=v.id
 ) SELECT pid,vid,CASE WHEN rankable AND external_score IS NOT NULL THEN 0 WHEN rankable AND internal_score IS NOT NULL THEN 1 ELSE 2 END,
 CASE WHEN rankable THEN coalesce(external_score,internal_score) END,measured_views FROM scores;
END $metrics$;
REVOKE ALL ON FUNCTION app.catalogue_sort_metrics(uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.catalogue_sort_metrics(uuid,uuid) TO capstone_runtime;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.catalogue_query_for(filters jsonb,who uuid,sid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $function$
DECLARE page integer:=coalesce((filters->>'page')::integer,1);size integer:=coalesce((filters->>'pageSize')::integer,20);q text:=app.discovery_normalize(coalesce(filters->>'q',''));k text;filter_value text;result jsonb;facets jsonb;total bigint;public_count bigint;pattern text;
BEGIN
 IF who IS NOT NULL THEN PERFORM app.partner_access_principal(who,sid);ELSIF sid IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='INVALID_READER';END IF;
 IF jsonb_typeof(filters) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(filters) key WHERE key NOT IN ('q','university','department','academicYear','domain','author','supervisor','page','pageSize','sort')) OR page NOT BETWEEN 1 AND 100000 OR size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 FOREACH k IN ARRAY ARRAY['q','university','department','academicYear','domain','author','supervisor'] LOOP
  IF filters ? k AND (jsonb_typeof(filters->k)<>'string' OR char_length(filters->>k)>200 OR filters->>k ~ '[[:cntrl:]‪-‮⁦-⁩]') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 END LOOP;
 IF coalesce(filters->>'department','') NOT IN ('','CS','IS','CE') OR coalesce(filters->>'domain','') NOT IN ('','software','data','hardware') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 filter_value:=coalesce(filters->>'academicYear','');IF filter_value<>'' AND (filter_value !~ '^[0-9]{4}–[0-9]{4}$' OR right(filter_value,4)::int<>left(filter_value,4)::int+1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 IF coalesce(filters->>'sort','') NOT IN ('','newest','highest','popular') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 pattern:='%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%';
 WITH public AS NOT MATERIALIZED (
  SELECT p.id project,v.id version,v.archived_at,s.metadata_snapshot metadata,s.authors_snapshot authors,s.discovery_text,s.discovery_vector
  FROM app.projects p JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id AND v.university_id=p.university_id AND v.status='archived'
  JOIN app.project_submissions s ON s.id=v.approved_submission_id AND s.version_id=v.id AND s.project_id=p.id AND s.university_id=p.university_id
  WHERE p.assignment_managed AND EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=s.id AND decision='archived') AND (SELECT count(*) FROM app.effective_internal_assessments WHERE submission_id=s.id AND rubric_code='CORE_V1')=2
 ), metrics AS MATERIALIZED(SELECT * FROM app.catalogue_sort_metrics(who,sid) WHERE coalesce(filters->>'sort','newest') IN('highest','popular')), matching AS (
  SELECT r.*,m.rating_tier,m.rating,m.views
  FROM public r LEFT JOIN metrics m ON m.project=r.project AND m.version=r.version WHERE (q='' OR discovery_vector @@ plainto_tsquery('simple',q) OR discovery_text LIKE pattern ESCAPE '\' OR discovery_text OPERATOR(public.%) q)
   AND (coalesce(filters->>'university','')='' OR app.discovery_normalize(metadata->'university'->>'nameEn')=app.discovery_normalize(filters->>'university'))
   AND (coalesce(filters->>'department','')='' OR metadata->'department'->>'code'=filters->>'department')
   AND (coalesce(filters->>'academicYear','')='' OR metadata->>'academicYear'=filters->>'academicYear')
   AND (coalesce(filters->>'domain','')='' OR metadata->>'domain'=filters->>'domain')
   AND (coalesce(filters->>'author','')='' OR EXISTS(SELECT 1 FROM jsonb_array_elements(authors) x WHERE app.discovery_normalize(x->>'name')=app.discovery_normalize(filters->>'author')))
   AND (coalesce(filters->>'supervisor','')='' OR app.discovery_normalize(metadata->'supervisor'->>'name')=app.discovery_normalize(filters->>'supervisor'))
 ), selected AS (
  SELECT * FROM matching ORDER BY CASE WHEN filters->>'sort'='highest' THEN rating_tier END ASC NULLS LAST,CASE WHEN filters->>'sort'='highest' THEN rating END DESC NULLS LAST,CASE WHEN filters->>'sort'='popular' THEN views END DESC NULLS LAST,archived_at DESC,project,version LIMIT size OFFSET (page-1)::bigint*size
 )
 SELECT (SELECT count(*) FROM public),(SELECT count(*) FROM matching),
 (SELECT coalesce(jsonb_agg(app.external_projection(project,who,sid) ORDER BY CASE WHEN filters->>'sort'='highest' THEN rating_tier END ASC NULLS LAST,CASE WHEN filters->>'sort'='highest' THEN rating END DESC NULLS LAST,CASE WHEN filters->>'sort'='popular' THEN views END DESC NULLS LAST,archived_at DESC,project,version),'[]') FROM selected),
 jsonb_build_object('universities',(SELECT coalesce(jsonb_agg(value ORDER BY value->>'nameEn'),'[]') FROM (SELECT DISTINCT (metadata->'university')-'id' value FROM public) u),
  'departments',(SELECT coalesce(jsonb_agg(value ORDER BY value->>'code'),'[]') FROM (SELECT DISTINCT (metadata->'department')-'id' value FROM public WHERE coalesce(filters->>'university','')='' OR app.discovery_normalize(metadata->'university'->>'nameEn')=app.discovery_normalize(filters->>'university')) d),
  'academicYears',(SELECT coalesce(jsonb_agg(value ORDER BY value DESC),'[]') FROM (SELECT DISTINCT metadata->>'academicYear' value FROM public) y),
  'domains',(SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM (SELECT DISTINCT metadata->>'domain' value FROM public) d),
  'authors',(SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM (SELECT DISTINCT x->>'name' value FROM public r CROSS JOIN LATERAL jsonb_array_elements(r.authors) x) a),
  'supervisors',(SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM (SELECT DISTINCT metadata->'supervisor'->>'name' value FROM public) s))
 INTO public_count,total,result,facets;
 RETURN jsonb_build_object('items',result,'total',total,'publicCount',public_count,'page',page,'pageSize',size,'facets',facets);
END $function$;

REVOKE ALL ON FUNCTION app.catalogue_query_for(jsonb,uuid,uuid) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.catalogue_query_for(jsonb,uuid,uuid) TO capstone_runtime;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.catalogue_query(filters jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$ SELECT app.catalogue_query_for(filters,NULL,NULL) $$;
CREATE OR REPLACE FUNCTION app.external_catalogue(input jsonb,who uuid,sid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$ SELECT app.catalogue_query_for(input,who,sid) $$;
