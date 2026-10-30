import type { PublicationProjection } from './publications.js';
export interface DiscoveryInput {
  q: string;
  university: string;
  department: string;
  academicYear: string;
  domain: string;
  author: string;
  supervisor: string;
  page: number;
  pageSize: number;
  sort?: 'newest' | 'highest' | 'popular';
}
export interface DiscoveryResult {
  items: PublicationProjection[];
  total: number;
  publicCount: number;
  page: number;
  pageSize: number;
  facets: {
    universities: PublicationProjection['university'][];
    departments: PublicationProjection['department'][];
    academicYears: string[];
    domains: string[];
    authors: string[];
    supervisors: string[];
  };
}
export const discoveryKeys = [
  'q',
  'university',
  'department',
  'academicYear',
  'domain',
  'author',
  'supervisor',
  'page',
  'pageSize',
  'sort',
] as const;
export function normalizeDiscoveryText(value: string) {
  return value
    .normalize('NFC')
    .replace(/[\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}
export function parseDiscovery(params: URLSearchParams): DiscoveryInput {
  for (const key of params.keys())
    if (
      !discoveryKeys.includes(key as (typeof discoveryKeys)[number]) ||
      params.getAll(key).length !== 1
    )
      throw Error('INVALID_SEARCH');
  const output: DiscoveryInput = {
    q: '',
    university: '',
    department: '',
    academicYear: '',
    domain: '',
    author: '',
    supervisor: '',
    page: 1,
    pageSize: 20,
  };
  const sort = params.get('sort');
  if (sort !== null) {
    if (!['newest', 'highest', 'popular'].includes(sort))
      throw Error('INVALID_SEARCH');
    output.sort = sort as 'newest' | 'highest' | 'popular';
  }
  for (const key of [
    'q',
    'university',
    'department',
    'academicYear',
    'domain',
    'author',
    'supervisor',
  ] as const) {
    const value = params.get(key) ?? '';
    // The public composer supports line breaks. Preserve its original q;
    // lexical normalization already treats them as whitespace. Facet values
    // and all other controls/bidi overrides keep their existing restrictions.
    const inspected = key === 'q' ? value.replace(/[\r\n]/g, '') : value;
    if (
      value.length > 200 ||
      /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(inspected)
    )
      throw Error('INVALID_SEARCH');
    output[key] = value.trim();
  }
  for (const key of ['page', 'pageSize'] as const) {
    const value = params.get(key);
    if (value !== null) {
      if (!/^[1-9]\d{0,5}$/.test(value)) throw Error('INVALID_SEARCH');
      output[key] = Number(value);
    }
  }
  if (
    output.page > 100000 ||
    output.pageSize > 50 ||
    !['', 'CS', 'IS', 'CE'].includes(output.department) ||
    !['', 'software', 'data', 'hardware'].includes(output.domain)
  )
    throw Error('INVALID_SEARCH');
  output.academicYear = output.academicYear.replace('-', '–');
  if (
    output.academicYear &&
    (!/^\d{4}–\d{4}$/.test(output.academicYear) ||
      Number(output.academicYear.slice(5)) !==
        Number(output.academicYear.slice(0, 4)) + 1)
  )
    throw Error('INVALID_SEARCH');
  return output;
}
export function discoveryUrl(
  locale: string,
  input: DiscoveryInput,
  changes: Partial<DiscoveryInput> = {},
) {
  const values = { ...input, ...changes },
    p = new URLSearchParams();
  for (const key of discoveryKeys) {
    const value = values[key];
    if (
      value !== undefined &&
      value !== '' &&
      !(key === 'page' && value === 1) &&
      !(key === 'pageSize' && value === 20)
    )
      p.set(key, String(value));
  }
  return `/${locale}/catalogue${p.size ? '?' + p.toString() : ''}`;
}
