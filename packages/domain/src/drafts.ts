import { computingDomains } from './administration.js';
export interface DraftFields {
  title: string;
  abstract: string;
  keywords: string[];
  academic_year: string;
  domain: string;
}
export interface MetadataIssue {
  field: string;
  code: string;
}
const fields = ['title', 'abstract', 'keywords', 'academic_year', 'domain'];
const unsafe =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
export const metadataEditable = (status: string) =>
  status === 'draft' || status === 'revision_required';
export function draftValidation(value: unknown, required = false) {
  const issues: MetadataIssue[] = [];
  const add = (field: string, code: string) => issues.push({ field, code });
  const normalized: DraftFields = {
    title: '',
    abstract: '',
    keywords: [],
    academic_year: '',
    domain: '',
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    add('form', 'SHAPE');
    return { fields: normalized, issues };
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 5 ||
    Object.keys(input).some((k) => !fields.includes(k))
  )
    add('form', 'SHAPE');
  for (const key of ['title', 'abstract', 'academic_year', 'domain'] as const) {
    if (typeof input[key] !== 'string') {
      add(key, 'TYPE');
      continue;
    }
    const raw = (input[key] as string).normalize('NFC');
    normalized[key] = raw.trim();
    if (unsafe.test(raw) || (key !== 'abstract' && /[\r\n\t]/.test(raw)))
      add(key, 'UNSAFE');
  }
  if ([...normalized.title].length > 200) add('title', 'MAX');
  if ([...normalized.abstract].length > 5000) add('abstract', 'MAX');
  if (
    !Array.isArray(input['keywords']) ||
    input['keywords'].some((k) => typeof k !== 'string')
  )
    add('keywords', 'TYPE');
  else {
    normalized.keywords = input['keywords'].map((k) =>
      (k as string).normalize('NFC').trim(),
    );
    if (normalized.keywords.length > 10) add('keywords', 'COUNT');
    if (
      normalized.keywords.some(
        (k) =>
          [...k].length < 2 ||
          [...k].length > 50 ||
          unsafe.test(k) ||
          /[\r\n\t]/.test(k),
      )
    )
      add('keywords', 'KEYWORD');
    if (
      new Set(normalized.keywords.map((k) => k.toLowerCase())).size !==
      normalized.keywords.length
    )
      add('keywords', 'DUPLICATE');
  }
  if (normalized.academic_year) {
    const match = /^(\d{4})[-–](\d{4})$/.exec(normalized.academic_year);
    if (!match || Number(match[2]) !== Number(match[1]) + 1)
      add('academic_year', 'YEAR');
    else normalized.academic_year = match[1] + '–' + match[2];
  }
  if (
    normalized.domain &&
    !computingDomains.some((d) => d.code === normalized.domain)
  )
    add('domain', 'DOMAIN');
  if (required) {
    if ([...normalized.title].length < 5) add('title', 'MIN');
    if ([...normalized.abstract].length < 50) add('abstract', 'MIN');
    if (!normalized.keywords.length) add('keywords', 'REQUIRED');
    if (!normalized.academic_year) add('academic_year', 'REQUIRED');
    if (!normalized.domain) add('domain', 'REQUIRED');
  }
  return { fields: normalized, issues };
}
export function metadataReadiness(
  fields: DraftFields,
  relationships: {
    scope: boolean;
    authors: boolean;
    lead: boolean;
    supervisor: boolean;
  },
) {
  const issues = draftValidation(fields, true).issues;
  for (const key of ['scope', 'authors', 'lead', 'supervisor'] as const)
    if (!relationships[key]) issues.push({ field: key, code: 'RELATIONSHIP' });
  return {
    metadataReady: issues.length === 0,
    issues,
    fileReadiness: 'NOT_IMPLEMENTED' as const,
    canSubmit: false as const,
  };
}
