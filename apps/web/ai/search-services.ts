import 'server-only';
import type { AccountView } from '@capstone/db/auth';
import {
  publicCatalogue,
  publicCatalogueSnapshot,
  publicPeople,
} from '../public-adoption/discovery-server';
import { publicView } from '../public-adoption/server';
import { AIError } from './types';
import { assertCurrentGeneration } from './generation';
import { digest } from './core';
import { explicitFacetOperator } from './facet-negation';
import {
  queryIdentity,
  mergeConstraints,
  satisfiesFacets,
  type SearchIntent,
  type SearchOverrides,
  type ResolvedMention,
  type SearchChoice,
  type Constraints,
} from './search-contract';
type Row = Awaited<ReturnType<typeof publicCatalogue>>['items'][number];
export type SearchSnapshot = {
  items: Row[];
  facets: Awaited<ReturnType<typeof publicCatalogue>>['facets'];
  revision: string;
  resolverRevision: string;
  bounded: boolean;
};
export async function searchSnapshot(
  account: AccountView | null,
  sort = 'newest',
): Promise<SearchSnapshot> {
  await assertCurrentGeneration();
  const catalogue = await publicCatalogueSnapshot(account, sort);
  const items = catalogue.items.filter(
    (p) => !account || Object.hasOwn(p, 'evaluation'),
  );
  const bounded = false;
  const content = items
    .map((p) => [
      p.project,
      p.version,
      p.title,
      p.abstract,
      p.keywords,
      p.university,
      p.department,
      p.academicYear,
      p.domain,
      p.authors,
      p.supervisor,
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  await assertCurrentGeneration();
  return {
    items,
    facets: catalogue.facets,
    revision: digest(content),
    resolverRevision: digest(catalogue.facets),
    bounded,
  };
}
export function getSearchFacets(snapshot: SearchSnapshot) {
  return {
    university: snapshot.facets.universities.map((u) => ({
      value: u.nameEn,
      label: u.nameEn,
      aliases: [
        u.nameEn,
        u.nameAr,
        u.nameEn
          .split(/\s+/)
          .map((w) => w[0])
          .join(''),
        u.nameEn.replace(/\bUniversity\b/gi, '').trim(),
      ],
    })),
    department: snapshot.facets.departments.map((d) => ({
      value: d.code,
      label: d.nameEn,
      aliases: [d.code, d.nameEn, d.nameAr],
    })),
    academicYear: snapshot.facets.academicYears.map((y) => ({
      value: y,
      label: y,
      aliases: [y, y.replace(/[–—]/g, '-')],
    })),
    domain: snapshot.facets.domains.map((value) => ({
      value,
      label: value,
      aliases: [
        value,
        ...({
          software: ['برمجيات', 'البرمجيات'],
          hardware: ['عتاد', 'العتاد'],
          data: ['بيانات', 'البيانات'],
        }[value] ?? []),
      ],
    })),
  };
}
export function knownMentions(
  query: string,
  snapshot: SearchSnapshot,
): SearchIntent['mentions'] {
  const text = queryIdentity(query),
    result: SearchIntent['mentions'] = [],
    facets = getSearchFacets(snapshot);
  for (const facet of [
    'university',
    'department',
    'academicYear',
    'domain',
  ] as const)
    for (const option of facets[facet]) {
      const matches = option.aliases
        .filter((alias) => {
          if (
            facet === 'department' &&
            alias === option.value &&
            alias.length === 2
          )
            return new RegExp('\\b' + alias + '\\b').test(query);
          if (
            facet === 'domain' &&
            option.value === 'data' &&
            !/domain|مجال/iu.test(query)
          )
            return false;
          return alias.length >= 3 && text.includes(queryIdentity(alias));
        })
        .sort((a, b) => b.length - a.length);
      if (matches[0]) {
        const alias = matches[0],
          at = text.indexOf(queryIdentity(alias)),
          prefix = text.slice(Math.max(0, at - 45), at);
        const operator = explicitFacetOperator(prefix) ?? 'include';
        result.push({ facet, text: alias, operator, join: 'any' });
      }
    }
  return result;
}
export const mentionId = (mention: SearchIntent['mentions'][number]) =>
  digest([mention.facet, queryIdentity(mention.text), mention.operator]);
export async function resolveSearchIntent(
  intent: SearchIntent,
  snapshot: SearchSnapshot,
  manual: Record<string, string>,
  overrides: SearchOverrides,
  account: AccountView | null = null,
) {
  const options = getSearchFacets(snapshot),
    resolved: ResolvedMention[] = [],
    choices: SearchChoice[] = [];
  const sorted = [...intent.mentions].sort(
    (a, b) =>
      Number(['author', 'supervisor'].includes(a.facet)) -
      Number(['author', 'supervisor'].includes(b.facet)),
  );
  for (const mention of sorted) {
    const id = mentionId(mention);
    if (overrides.drop.includes(id)) continue;
    let candidates: { value: string; label: string }[] = [];
    if (mention.facet === 'author' || mention.facet === 'supervisor') {
      const universities = [
          ...new Set(
            resolved
              .filter(
                (m) => m.facet === 'university' && m.operator === 'include',
              )
              .flatMap((m) => m.values),
          ),
        ],
        departments = [
          ...new Set(
            resolved
              .filter(
                (m) => m.facet === 'department' && m.operator === 'include',
              )
              .flatMap((m) => m.values),
          ),
        ];
      const university =
          manual.university ||
          (universities.length === 1 ? universities[0]! : ''),
        department =
          manual.department ||
          (departments.length === 1 ? departments[0]! : '');
      const rows = await publicPeople(
        new URLSearchParams({
          kind: mention.facet,
          q: mention.text.slice(0, 80),
          university,
          department,
          limit: '10',
        }),
      );
      const exact = rows.filter(
        (row) => queryIdentity(row.name) === queryIdentity(mention.text),
      );
      candidates = (exact.length ? exact : rows).map((row) => ({
        value: row.key,
        label: row.name + ' · ' + row.university.nameEn,
      }));
    } else
      candidates = options[mention.facet]
        .filter((option) =>
          option.aliases.some(
            (alias) => queryIdentity(alias) === queryIdentity(mention.text),
          ),
        )
        .map((option) => ({ value: option.value, label: option.label }));
    const selected = overrides.pick[id];
    if (selected) {
      candidates = candidates.filter((option) => option.value === selected);
      if (!candidates.length) throw new AIError('INVALID_SEARCH_CHOICE', 400);
    }
    if (candidates.length !== 1) {
      choices.push({
        id,
        facet: mention.facet,
        text: mention.text,
        options: candidates,
        reason: candidates.length ? 'ambiguous' : 'unresolved',
      });
      continue;
    }
    resolved.push({
      ...mention,
      id,
      values: [candidates[0]!.value],
      labels: [candidates[0]!.label],
    });
  }
  // Plain person-name manual filters are resolved using the same public registry,
  // rather than comparing an author label to an unrelated identity key.
  const canonicalManual = { ...manual };
  for (const kind of ['author', 'supervisor'] as const)
    if (manual[kind] && !manual[kind + 'Key']) {
      const people = await publicPeople(
        new URLSearchParams({
          kind,
          q: manual[kind]!,
          university: manual.university ?? '',
          department: manual.department ?? '',
          limit: '10',
        }),
      );
      const exact = people.filter(
        (p) => queryIdentity(p.name) === queryIdentity(manual[kind]!),
      );
      if (exact.length === 1) canonicalManual[kind + 'Key'] = exact[0]!.key;
      else
        choices.push({
          id: digest(['manual', kind, manual[kind]]),
          facet: kind,
          text: manual[kind]!,
          options: exact.map((p) => ({
            value: p.key,
            label: p.name + ' · ' + p.university.nameEn,
          })),
          reason: 'ambiguous-manual-person',
        });
    }
  const merged = mergeConstraints(resolved, canonicalManual);
  const ignored = intent.mentions
    .filter((m) => overrides.drop.includes(mentionId(m)))
    .map((m) => ({ id: mentionId(m), facet: m.facet, text: m.text }));
  const relations: Record<string, string[]> = {};
  for (const kind of ['author', 'supervisor'] as const) {
    const rule = merged.effective[kind];
    for (const key of [
      ...new Set([
        ...(rule?.include ?? []),
        ...(rule?.required ?? []),
        ...(rule?.exclude ?? []),
      ]),
    ]) {
      relations[key] = [];
      for (let page = 1; ; page++) {
        const batch = await publicCatalogue(
          new URLSearchParams({
            [kind + 'Key']: key,
            pageSize: '50',
            page: String(page),
          }),
          account,
        );
        relations[key]!.push(...batch.items.map((p) => p.project));
        if (page * 50 >= batch.total) break;
      }
    }
  }
  return { resolved, choices, ignored, relations, ...merged };
}
export function matchesConstraints(
  row: Row,
  effective: Constraints,
  relations: Record<string, string[]> = {},
) {
  return satisfiesFacets(
    {
      university: [row.university.nameEn],
      department: [row.department.code],
      academicYear: [row.academicYear],
      domain: [row.domain],
      author: [
        ...new Set([
          ...(effective.author?.include ?? []),
          ...(effective.author?.required ?? []),
          ...(effective.author?.exclude ?? []),
        ]),
      ].filter((key) => relations[key]?.includes(row.project)),
      supervisor: [
        ...new Set([
          ...(effective.supervisor?.include ?? []),
          ...(effective.supervisor?.required ?? []),
          ...(effective.supervisor?.exclude ?? []),
        ]),
      ].filter((key) => relations[key]?.includes(row.project)),
    },
    effective,
  );
}
export function publicSearchRows(items: Row[]) {
  return items.map(publicView);
}
