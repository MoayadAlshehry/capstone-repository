import {
  parseDiscovery,
  normalizeDiscoveryText,
} from '@capstone/domain/discovery';
import { readSearchOverrides } from '../ai/search-contract.ts';
export const publicPersonKeys = ['authorKey', 'supervisorKey'] as const;
export function parsePublicCatalogue(params: URLSearchParams) {
  const base = new URLSearchParams(params);
  if (
    base.getAll('assistance').length > 1 ||
    (base.has('assistance') &&
      !['semantic', 'ordinary'].includes(base.get('assistance')!))
  )
    throw Error('INVALID_SEARCH');
  base.delete('assistance');
  if (base.getAll('aiDrop').length > 1 || base.getAll('aiPick').length > 1)
    throw Error('INVALID_SEARCH');
  readSearchOverrides(base);
  base.delete('aiDrop');
  base.delete('aiPick');
  const keys = { authorKey: '', supervisorKey: '' };
  for (const key of publicPersonKeys) {
    const value = base.get(key) ?? '';
    if (base.getAll(key).length > 1 || (value && !/^[a-f0-9]{64}$/.test(value)))
      throw Error('INVALID_SEARCH');
    keys[key] = value;
    base.delete(key);
  }
  const view = base.get('view');
  if (
    base.getAll('view').length > 1 ||
    (view !== null && !['grid', 'list'].includes(view))
  )
    throw Error('INVALID_SEARCH');
  base.delete('view');
  return { ...parseDiscovery(base), ...keys };
}
export type PublicCatalogueInput = ReturnType<typeof parsePublicCatalogue>;
export function parsePeopleQuery(params: URLSearchParams) {
  const allowed = ['kind', 'q', 'key', 'university', 'department', 'limit'];
  for (const key of params.keys())
    if (!allowed.includes(key) || params.getAll(key).length !== 1)
      throw Error('INVALID_LOOKUP');
  const kind = params.get('kind'),
    q = params.get('q') ?? '',
    key = params.get('key') ?? '',
    university = params.get('university') ?? '',
    department = params.get('department') ?? '',
    limit = params.get('limit') ?? '10';
  if (
    !['author', 'supervisor'].includes(kind ?? '') ||
    !/^([1-9]|10)$/.test(limit)
  )
    throw Error('INVALID_LOOKUP');
  if (key && (!/^[a-f0-9]{64}$/.test(key) || params.has('q')))
    throw Error('INVALID_LOOKUP');
  if (
    !key &&
    ([...q.trim()].length < 2 ||
      [...q].length > 80 ||
      /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(q))
  )
    throw Error('INVALID_LOOKUP');
  parseDiscovery(new URLSearchParams({ university, department }));
  const normalized = normalizeDiscoveryText(q);
  if (!key && [...normalized].length < 2) throw Error('INVALID_LOOKUP');
  return {
    kind: kind as 'author' | 'supervisor',
    q: normalized,
    key,
    university,
    department,
    limit: key ? 1 : Number(limit),
  };
}
export type PublicPerson = {
  key: string;
  name: string;
  university: { nameEn: string; nameAr: string };
  department: string;
};
