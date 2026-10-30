import { it, expect } from 'vitest';
import {
  normalizeDiscoveryText,
  parseDiscovery,
  discoveryUrl,
} from './discovery.js';
it('normalizes separate Arabic search text without modifying the original', () => {
  const original = '  إِدَارَةُ الـمَعْلُومَاتِ  ';
  expect(normalizeDiscoveryText(original)).toBe('ادارة المعلومات');
  expect(original).toBe('  إِدَارَةُ الـمَعْلُومَاتِ  ');
});
it('English case/whitespace normalization and punctuation preserve query meaning', () => {
  expect(normalizeDiscoveryText('  Clear\u00a0 DATA  ')).toBe('clear data');
  expect(normalizeDiscoveryText('C++ & C#')).toBe('c++ & c#');
});
it('default20 and bounded50 with bookmarkable preserved filters', () => {
  const input = parseDiscovery(
    new URLSearchParams('q=Data&department=CS&academicYear=2025-2026'),
  );
  expect(input).toMatchObject({
    page: 1,
    pageSize: 20,
    academicYear: '2025–2026',
  });
  const url = discoveryUrl('ar', input, { page: 2 });
  expect(
    parseDiscovery(new URL(url, 'http://localhost').searchParams),
  ).toMatchObject({ ...input, page: 2 });
  expect(parseDiscovery(new URLSearchParams('pageSize=50')).pageSize).toBe(50);
});
it.each([
  'page=0',
  'page=-1',
  'page=1.5',
  'page=100001',
  'pageSize=51',
  'pageSize=5000',
  'pageSize=0',
  'page=1&page=2',
  'role=admin',
  'domain=unknown',
  'department=MED',
  'academicYear=2025-2027',
  'q=' + encodeURIComponent('\u202eHidden'),
])('rejects invalid settings %s', (input) => {
  expect(() => parseDiscovery(new URLSearchParams(input))).toThrow(
    'INVALID_SEARCH',
  );
});

it('preserves line breaks only in the search query while keeping facet and control-character guards', () => {
  const q = 'Projects about water\nfrom a named university';
  expect(parseDiscovery(new URLSearchParams({ q })).q).toBe(q);
  expect(() =>
    parseDiscovery(new URLSearchParams({ university: 'One\nTwo' })),
  ).toThrow('INVALID_SEARCH');
  expect(() =>
    parseDiscovery(new URLSearchParams({ q: 'water\tprojects' })),
  ).toThrow('INVALID_SEARCH');
  expect(() =>
    parseDiscovery(new URLSearchParams({ q: 'water\u202eprojects' })),
  ).toThrow('INVALID_SEARCH');
  expect(() =>
    parseDiscovery(new URLSearchParams({ q: 'x'.repeat(201) })),
  ).toThrow('INVALID_SEARCH');
});
