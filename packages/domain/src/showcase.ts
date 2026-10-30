import type { PublicationProjection } from './publications.js';
import type { EvaluationSummary } from './evaluation-summary.js';
export type { EvaluationSummary } from './evaluation-summary.js';
export interface ShowcaseCandidate {
  publication: PublicationProjection;
  summary: EvaluationSummary | null;
  rankEligible: boolean;
  compatible: boolean;
  universityKey: string;
  concealed: boolean;
}
export interface ShowcaseFilters {
  domain?: string;
  university?: string;
  academicYear?: string;
}
export interface ShowcaseCard {
  publication: PublicationProjection;
  summary?: EvaluationSummary;
  tier?: 'external' | 'internal';
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const recentOrder = (a: ShowcaseCandidate, b: ShowcaseCandidate) =>
  cmp(b.publication.publishedAt, a.publication.publishedAt) ||
  cmp(a.publication.project, b.publication.project);
function ratio(a: bigint, ad: bigint, b: bigint, bd: bigint) {
  const delta = a * bd - b * ad;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
export function stabilizedRank(summary: EvaluationSummary) {
  if (!summary.external || summary.n < 2) throw Error('INCOMPLETE_EXTERNAL');
  return {
    numerator: summary.external.numerator + 560,
    denominator: 4 * (summary.n + 2),
  };
}
export function compareExternal(a: ShowcaseCandidate, b: ShowcaseCandidate) {
  const ar = stabilizedRank(a.summary!),
    br = stabilizedRank(b.summary!),
    ae = a.summary!.external!,
    be = b.summary!.external!;
  return (
    -ratio(
      BigInt(ar.numerator),
      BigInt(ar.denominator),
      BigInt(br.numerator),
      BigInt(br.denominator),
    ) ||
    -ratio(
      BigInt(ae.numerator),
      BigInt(ae.denominator),
      BigInt(be.numerator),
      BigInt(be.denominator),
    ) ||
    b.summary!.n - a.summary!.n ||
    recentOrder(a, b)
  );
}
function compareInternal(a: ShowcaseCandidate, b: ShowcaseCandidate) {
  return (
    b.summary!.internal!.numerator - a.summary!.internal!.numerator ||
    recentOrder(a, b)
  );
}
function selectTier(rows: ShowcaseCandidate[], limit: number) {
  const selected: ShowcaseCandidate[] = [],
    deferred: ShowcaseCandidate[] = [],
    counts = new Map<string, number>();
  for (const row of rows) {
    const count = counts.get(row.universityKey) ?? 0;
    if (count < 3 && selected.length < limit) {
      selected.push(row);
      counts.set(row.universityKey, count + 1);
    } else deferred.push(row);
  }
  for (const row of deferred) if (selected.length < limit) selected.push(row);
  return selected;
}
export function selectShowcase(
  snapshot: readonly ShowcaseCandidate[],
  filters: ShowcaseFilters = {},
) {
  const ids = new Set<string>();
  for (const c of snapshot) {
    if (
      ids.has(c.publication.project) ||
      (!c.concealed &&
        (!c.summary ||
          !Number.isInteger(c.summary!.n) ||
          c.summary!.n < 0 ||
          c.summary!.n > 10 ||
          (c.summary!.external &&
            c.summary!.external.denominator !== 4 * c.summary!.n)))
    )
      throw Error('INVALID_PUBLIC_SNAPSHOT');
    ids.add(c.publication.project);
  }
  const rows = snapshot.filter(
    (c) =>
      (!filters.domain || c.publication.domain === filters.domain) &&
      (!filters.university ||
        c.publication.university.nameEn === filters.university) &&
      (!filters.academicYear ||
        c.publication.academicYear === filters.academicYear),
  );
  const concealed = rows.some((c) => c.concealed),
    safe = (
      c: ShowcaseCandidate,
      tier?: ShowcaseCard['tier'],
    ): ShowcaseCard => {
      const allowed = [
        'project',
        'version',
        'versionNumber',
        'title',
        'abstract',
        'keywords',
        'university',
        'department',
        'academicYear',
        'domain',
        'authors',
        'supervisor',
        'publishedAt',
        'license',
        ...(c.concealed ? [] : ['internal', 'rubric']),
      ];
      const publication = Object.fromEntries(
        Object.entries(c.publication).filter(([key]) => allowed.includes(key)),
      ) as unknown as PublicationProjection;
      return c.concealed
        ? { publication }
        : { publication, summary: c.summary!, ...(tier ? { tier } : {}) };
    };
  if (concealed) {
    const ordered = [...rows].sort(recentOrder);
    return {
      mode: 'publication-order' as const,
      main: ordered.slice(0, 12).map((c) => safe(c)),
      recent: ordered.slice(12, 18).map((c) => safe(c)),
      total: rows.length,
    };
  }
  const eligible = rows.filter((c) => c.rankEligible && c.compatible),
    external = selectTier(
      eligible
        .filter((c) => c.summary!.n >= 2 && c.summary!.external)
        .sort(compareExternal),
      12,
    ),
    internal = selectTier(
      eligible
        .filter((c) => c.summary!.n < 2 && c.summary!.internal)
        .sort(compareInternal),
      12 - external.length,
    ),
    main = [
      ...external.map((c) => safe(c, 'external')),
      ...internal.map((c) => safe(c, 'internal')),
    ],
    selected = new Set(main.map((c) => c.publication.project)),
    recent = rows
      .filter((c) => !selected.has(c.publication.project))
      .sort(recentOrder)
      .slice(0, 6)
      .map((c) => safe(c));
  return { mode: 'ranked' as const, main, recent, total: rows.length };
}
export function parseShowcase(params: URLSearchParams): ShowcaseFilters {
  if (
    [...params.keys()].some(
      (k) => !['domain', 'university', 'academicYear'].includes(k),
    ) ||
    [...new Set(params.keys())].some((k) => params.getAll(k).length !== 1)
  )
    throw Error('INVALID_FILTER');
  const f = Object.fromEntries([...params].filter(([, v]) => v));
  if (
    Object.values(f).some(
      (v) =>
        v.length > 200 ||
        /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v),
    )
  )
    throw Error('INVALID_FILTER');
  if (f['domain'] && !['software', 'data', 'hardware'].includes(f['domain']))
    throw Error('INVALID_FILTER');
  if (
    f['academicYear'] &&
    (!/^\d{4}–\d{4}$/.test(f['academicYear']) ||
      Number(f['academicYear'].slice(5)) !==
        Number(f['academicYear'].slice(0, 4)) + 1)
  )
    throw Error('INVALID_FILTER');
  return f;
}

export interface ShowcaseResult {
  mode: 'ranked' | 'publication-order';
  main: ShowcaseCard[];
  recent: ShowcaseCard[];
  total: number;
  filters: ShowcaseFilters;
  facets: {
    universities: { nameEn: string; nameAr: string }[];
    academicYears: string[];
    domains: string[];
  };
}
