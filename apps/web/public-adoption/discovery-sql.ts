import type { AccountView } from '@capstone/db/auth';
import { normalizeDiscoveryText } from '@capstone/domain/discovery';
import { parsePublicCatalogue } from './discovery-query.ts';
/** Delegate the complete existing publication predicate to the authorized public-route function. */
export const publicRows = `
SELECT p.id project,v.id version,v.archived_at,s.metadata_snapshot metadata,s.authors_snapshot authors,s.discovery_text,s.discovery_vector
FROM app.projects p
JOIN jsonb_array_elements(app.catalogue_routes()) allowed ON (allowed->>'project')::uuid=p.id
JOIN app.project_versions v ON v.id=p.published_version_id AND v.project_id=p.id AND v.university_id=p.university_id AND v.status='archived'
JOIN app.project_submissions s ON s.id=v.approved_submission_id AND s.version_id=v.id AND s.project_id=p.id AND s.university_id=p.university_id
WHERE p.assignment_managed`;
// Same NFC/diacritic/tatweel/alef/whitespace matching as discovery_normalize; display values never change.
export const normalized = (column: string) =>
  `btrim(regexp_replace(lower(translate(regexp_replace(normalize(${column},NFC),'[ـً-ٰٟۖ-ۭ]','','g'),'أإآٱ','اااا')),'[[:space:] ]+',' ','g'))`;
export const personKey = (kind: 'author' | 'supervisor', id: string) =>
  `encode(sha256(convert_to('capstone-public-${kind}-v1:'||(${id}),'UTF8')),'hex')`;
const escapeLike = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
export const catalogueSql = `WITH public_rows AS MATERIALIZED (${publicRows}) , metrics AS MATERIALIZED (SELECT * FROM app.catalogue_sort_metrics($15::uuid,$16::uuid) WHERE $11 IN('highest','popular')), matching AS (
  SELECT r.*,m.rating_tier,m.rating,m.views FROM public_rows r LEFT JOIN metrics m ON m.project=r.project AND m.version=r.version WHERE ($1='' OR discovery_vector @@ plainto_tsquery('simple',$1) OR discovery_text LIKE $2 ESCAPE '\\' OR discovery_text OPERATOR(public.%) $1)
  AND ($3='' OR ${normalized("metadata->'university'->>'nameEn'")}=$3)
  AND ($4='' OR metadata->'department'->>'code'=$4) AND ($5='' OR metadata->>'academicYear'=$5) AND ($6='' OR metadata->>'domain'=$6)
  AND ($9<>'' OR $7='' OR EXISTS(SELECT 1 FROM jsonb_array_elements(authors) a WHERE ${normalized("a->>'name'")}=$7))
  AND ($10<>'' OR $8='' OR ${normalized("metadata->'supervisor'->>'name'")}=$8)
  AND ($9='' OR EXISTS(SELECT 1 FROM jsonb_array_elements(authors) a WHERE ${personKey('author', "a->>'id'")}=$9))
  AND ($10='' OR ${personKey('supervisor', "metadata->'supervisor'->>'id'")}=$10)
), selected AS (
 SELECT * FROM matching ORDER BY CASE WHEN $11='highest' THEN rating_tier END ASC NULLS LAST,CASE WHEN $11='highest' THEN rating END DESC NULLS LAST,CASE WHEN $11='popular' THEN views END DESC NULLS LAST,archived_at DESC,project,version LIMIT $12 OFFSET $13
)
SELECT jsonb_build_object(
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('project',project,'version',version) ORDER BY CASE WHEN $11='highest' THEN rating_tier END ASC NULLS LAST,CASE WHEN $11='highest' THEN rating END DESC NULLS LAST,CASE WHEN $11='popular' THEN views END DESC NULLS LAST,archived_at DESC,project,version),'[]') FROM selected),
 'total',(SELECT count(*) FROM matching),'publicCount',(SELECT count(*) FROM public_rows),'page',$14::int,'pageSize',$12::int,
 'facets',jsonb_build_object(
  'universities',(SELECT coalesce(jsonb_agg(value ORDER BY value->>'nameEn'),'[]') FROM (SELECT DISTINCT (metadata->'university')-'id' value FROM public_rows) u),
  'departments',(SELECT coalesce(jsonb_agg(value ORDER BY value->>'code'),'[]') FROM (SELECT DISTINCT (metadata->'department')-'id' value FROM public_rows WHERE $3='' OR ${normalized("metadata->'university'->>'nameEn'")}=$3) d),
  'academicYears',(SELECT coalesce(jsonb_agg(value ORDER BY value DESC),'[]') FROM (SELECT DISTINCT metadata->>'academicYear' value FROM public_rows) y),
  'domains',(SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM (SELECT DISTINCT metadata->>'domain' value FROM public_rows) d),'authors','[]'::jsonb,'supervisors','[]'::jsonb),
 'departmentsByUniversity',(SELECT coalesce(jsonb_object_agg(university,departments),'{}') FROM (SELECT metadata->'university'->>'nameEn' university,jsonb_agg(DISTINCT metadata->'department'->>'code') departments FROM public_rows GROUP BY metadata->'university'->>'nameEn') u)
) value`;
export function catalogueValues(
  params: URLSearchParams,
  account: AccountView | null,
) {
  const v = parsePublicCatalogue(params),
    q = normalizeDiscoveryText(v.q);
  return [
    q,
    '%' + escapeLike(q) + '%',
    normalizeDiscoveryText(v.university),
    v.department,
    v.academicYear,
    v.domain,
    normalizeDiscoveryText(v.author),
    normalizeDiscoveryText(v.supervisor),
    v.authorKey,
    v.supervisorKey,
    v.sort ?? 'newest',
    v.pageSize,
    (v.page - 1) * v.pageSize,
    v.page,
    account?.id ?? null,
    account?.sessionId ?? null,
  ];
}
