import { z } from 'zod';
export const facetNames = [
  'university',
  'department',
  'academicYear',
  'domain',
  'author',
  'supervisor',
] as const;
export type SearchFacet = (typeof facetNames)[number];
export const intentSchema = z
  .object({
    topic: z
      .object({
        relation: z.enum(['related', 'uses']).default('related'),
        must: z.array(z.string().min(2).max(100)).max(4),
        anyOf: z.array(z.string().min(2).max(100)).max(4),
        exclude: z.array(z.string().min(2).max(100)).max(4),
      })
      .strict(),
    mentions: z
      .array(
        z
          .object({
            facet: z.enum(facetNames),
            text: z.string().min(2).max(100),
            operator: z.enum(['include', 'exclude']),
            join: z.enum(['any', 'all']),
          })
          .strict(),
      )
      .max(12),
    sort: z.enum(['newest', 'highest', 'popular']).nullable(),
    clarification: z.string().max(200).nullable(),
  })
  .strict();
export type SearchIntent = z.infer<typeof intentSchema>;
export const overridesSchema = z
  .object({
    drop: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .max(16)
      .default([]),
    pick: z
      .record(z.string().regex(/^[a-f0-9]{64}$/), z.string().min(1).max(200))
      .refine((v) => Object.keys(v).length <= 12)
      .default({}),
  })
  .strict();
export type SearchOverrides = z.infer<typeof overridesSchema>;
export function queryIdentity(query: string) {
  return query
    .normalize('NFKC')
    .replace(/[\u0640\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[–—]/g, '-');
}
export function searchIdentity(query: string) {
  return query.normalize('NFC').trim();
}
export type ResolvedMention = {
  id: string;
  facet: SearchFacet;
  text: string;
  operator: 'include' | 'exclude';
  join: 'any' | 'all';
  values: string[];
  labels: string[];
};
export type SearchChoice = {
  id: string;
  facet: SearchFacet;
  text: string;
  options: { value: string; label: string }[];
  reason: string;
};
export type Constraints = Partial<
  Record<
    SearchFacet,
    { include: string[]; required: string[]; exclude: string[] }
  >
>;
export function mergeConstraints(
  mentions: ResolvedMention[],
  manual: Record<string, string>,
) {
  const effective: Constraints = {},
    conflicts: SearchFacet[] = [];
  for (const facet of facetNames) {
    const selected = mentions.filter((m) => m.facet === facet),
      include = [
        ...new Set(
          selected
            .filter((m) => m.operator === 'include' && m.join === 'any')
            .flatMap((m) => m.values),
        ),
      ],
      required = [
        ...new Set(
          selected
            .filter((m) => m.operator === 'include' && m.join === 'all')
            .flatMap((m) => m.values),
        ),
      ],
      exclude = [
        ...new Set(
          selected
            .filter((m) => m.operator === 'exclude')
            .flatMap((m) => m.values),
        ),
      ];
    const value =
      manual[
        facet === 'author' || facet === 'supervisor' ? facet + 'Key' : facet
      ] ||
      manual[facet] ||
      '';
    const allowed = include.filter((v) => !exclude.includes(v));
    if (value) required.push(value);
    if (
      (include.length && !allowed.length) ||
      required.some((v) => exclude.includes(v)) ||
      (!['author', 'supervisor'].includes(facet) &&
        (new Set(required).size > 1 ||
          required.some((v) => include.length && !allowed.includes(v))))
    )
      conflicts.push(facet);
    effective[facet] = {
      include: allowed,
      required: [...new Set(required)],
      exclude,
    };
  }
  return { effective, conflicts };
}
export function satisfiesFacets(
  values: Record<SearchFacet, string[]>,
  effective: Constraints,
) {
  return facetNames.every((facet) => {
    const rule = effective[facet];
    return (
      !rule ||
      ((!rule.include.length ||
        rule.include.some((v) => values[facet].includes(v))) &&
        rule.required.every((v) => values[facet].includes(v)) &&
        !rule.exclude.some((v) => values[facet].includes(v)))
    );
  });
}
export function sortMembership<T extends { project: string }>(
  items: T[],
  order: string[],
) {
  const positions = new Map(order.map((id, i) => [id, i]));
  return [...items].sort(
    (a, b) =>
      (positions.get(a.project) ?? Infinity) -
        (positions.get(b.project) ?? Infinity) ||
      a.project.localeCompare(b.project),
  );
}
export function readSearchOverrides(params: URLSearchParams): SearchOverrides {
  return overridesSchema.parse({
    drop: (params.get('aiDrop') ?? '').split(',').filter(Boolean),
    pick: JSON.parse(params.get('aiPick') ?? '{}'),
  });
}
