-- Search values are separate from immutable display snapshots. No public files.
CREATE FUNCTION app.discovery_normalize(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,app AS $$
 SELECT btrim(regexp_replace(lower(translate(regexp_replace(normalize(value,NFC),'[ـً-ٰٟۖ-ۭ]','','g'),'أإآٱ','اااا')),'[[:space:] ]+',' ','g'));
$$;
CREATE FUNCTION app.discovery_terms(snapshot jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,app AS $$
 SELECT app.discovery_normalize(coalesce(snapshot->>'title','')||' '||coalesce((SELECT string_agg(value,' ') FROM jsonb_array_elements_text(snapshot->'keywords')),''));
$$;
ALTER TABLE app.project_submissions ADD COLUMN discovery_text text GENERATED ALWAYS AS (app.discovery_terms(metadata_snapshot)) STORED,
 ADD COLUMN discovery_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig,app.discovery_terms(metadata_snapshot))) STORED;
CREATE INDEX discovery_full_text ON app.project_submissions USING gin(discovery_vector);
CREATE INDEX discovery_trigram ON app.project_submissions USING gin(discovery_text public.gin_trgm_ops);
CREATE INDEX discovery_published_pointer ON app.projects(published_version_id,id) WHERE published_version_id IS NOT NULL AND assignment_managed;
REVOKE ALL ON FUNCTION app.discovery_normalize(text),app.discovery_terms(jsonb) FROM PUBLIC,capstone_runtime,capstone_jobs;
--> statement-breakpoint
CREATE FUNCTION app.catalogue_query(filters jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE page integer:=coalesce((filters->>'page')::integer,1);size integer:=coalesce((filters->>'pageSize')::integer,20);q text:=app.discovery_normalize(coalesce(filters->>'q',''));k text;filter_value text;result jsonb;facets jsonb;total bigint;public_count bigint;pattern text;
BEGIN
 IF jsonb_typeof(filters) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(filters) key WHERE key NOT IN ('q','university','department','academicYear','domain','author','supervisor','page','pageSize')) OR page NOT BETWEEN 1 AND 100000 OR size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 FOREACH k IN ARRAY ARRAY['q','university','department','academicYear','domain','author','supervisor'] LOOP
  IF filters ? k AND (jsonb_typeof(filters->k)<>'string' OR char_length(filters->>k)>200 OR filters->>k ~ '[[:cntrl:]‪-‮⁦-⁩]') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 END LOOP;
 IF coalesce(filters->>'department','') NOT IN ('','CS','IS','CE') OR coalesce(filters->>'domain','') NOT IN ('','software','data','hardware') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 filter_value:=coalesce(filters->>'academicYear','');IF filter_value<>'' AND (filter_value !~ '^[0-9]{4}–[0-9]{4}$' OR right(filter_value,4)::int<>left(filter_value,4)::int+1) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_SEARCH';END IF;
 pattern:='%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%';
 WITH public AS NOT MATERIALIZED (
  SELECT p.id project,v.id version,v.archived_at,s.metadata_snapshot metadata,s.authors_snapshot authors,s.discovery_text,s.discovery_vector
  FROM app.projects p JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id AND v.university_id=p.university_id AND v.status='archived'
  JOIN app.project_submissions s ON s.id=v.approved_submission_id AND s.version_id=v.id AND s.project_id=p.id AND s.university_id=p.university_id
  WHERE p.assignment_managed AND EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=s.id AND decision='archived') AND (SELECT count(*) FROM app.internal_assessments WHERE submission_id=s.id AND rubric_code='CORE_V1')=2
 ), matching AS (
  SELECT *,CASE WHEN q='' THEN 0 ELSE ts_rank_cd(discovery_vector,plainto_tsquery('simple',q))::numeric+public.similarity(discovery_text,q)::numeric END relevance
  FROM public r WHERE (q='' OR discovery_vector @@ plainto_tsquery('simple',q) OR discovery_text LIKE pattern ESCAPE '\' OR discovery_text OPERATOR(public.%) q)
   AND (coalesce(filters->>'university','')='' OR app.discovery_normalize(metadata->'university'->>'nameEn')=app.discovery_normalize(filters->>'university'))
   AND (coalesce(filters->>'department','')='' OR metadata->'department'->>'code'=filters->>'department')
   AND (coalesce(filters->>'academicYear','')='' OR metadata->>'academicYear'=filters->>'academicYear')
   AND (coalesce(filters->>'domain','')='' OR metadata->>'domain'=filters->>'domain')
   AND (coalesce(filters->>'author','')='' OR EXISTS(SELECT 1 FROM jsonb_array_elements(authors) x WHERE app.discovery_normalize(x->>'name')=app.discovery_normalize(filters->>'author')))
   AND (coalesce(filters->>'supervisor','')='' OR app.discovery_normalize(metadata->'supervisor'->>'name')=app.discovery_normalize(filters->>'supervisor'))
 ), selected AS (
  SELECT * FROM matching ORDER BY relevance DESC,CASE WHEN q='' THEN archived_at END DESC,project,version LIMIT size OFFSET (page-1)::bigint*size
 )
 SELECT (SELECT count(*) FROM public),(SELECT count(*) FROM matching),
 (SELECT coalesce(jsonb_agg(app.publication_projection(project) ORDER BY relevance DESC,CASE WHEN q='' THEN archived_at END DESC,project,version),'[]') FROM selected),
 jsonb_build_object('universities',(SELECT coalesce(jsonb_agg(value ORDER BY value->>'nameEn'),'[]') FROM (SELECT DISTINCT (metadata->'university')-'id' value FROM public) u),
  'departments',(SELECT coalesce(jsonb_agg(value ORDER BY value->>'code'),'[]') FROM (SELECT DISTINCT (metadata->'department')-'id' value FROM public WHERE coalesce(filters->>'university','')='' OR app.discovery_normalize(metadata->'university'->>'nameEn')=app.discovery_normalize(filters->>'university')) d),
  'academicYears',(SELECT coalesce(jsonb_agg(value ORDER BY value DESC),'[]') FROM (SELECT DISTINCT metadata->>'academicYear' value FROM public) y),
  'domains',(SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM (SELECT DISTINCT metadata->>'domain' value FROM public) d),
  'authors',(SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM (SELECT DISTINCT x->>'name' value FROM public r CROSS JOIN LATERAL jsonb_array_elements(r.authors) x) a),
  'supervisors',(SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM (SELECT DISTINCT metadata->'supervisor'->>'name' value FROM public) s))
 INTO public_count,total,result,facets;
 RETURN jsonb_build_object('items',result,'total',total,'publicCount',public_count,'page',page,'pageSize',size,'facets',facets);
END $$;
REVOKE ALL ON FUNCTION app.catalogue_query(jsonb) FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.catalogue_query(jsonb) TO capstone_runtime;
CREATE FUNCTION app.catalogue_routes() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('project',p.id,'publishedAt',v.archived_at) ORDER BY p.id),'[]') FROM app.projects p JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id AND v.university_id=p.university_id AND v.status='archived' JOIN app.project_submissions s ON s.id=v.approved_submission_id AND s.version_id=v.id AND s.project_id=p.id WHERE p.assignment_managed AND EXISTS(SELECT 1 FROM app.review_records WHERE submission_id=s.id AND decision='archived') AND (SELECT count(*) FROM app.internal_assessments WHERE submission_id=s.id AND rubric_code='CORE_V1')=2;
$$;
REVOKE ALL ON FUNCTION app.catalogue_routes() FROM PUBLIC,capstone_jobs;
GRANT EXECUTE ON FUNCTION app.catalogue_routes() TO capstone_runtime;
