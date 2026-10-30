import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { auditActionPresentation } from './audit-presentation.js';

it('every finite assignment command has an exact bilingual audit outcome', () => {
  const sql = readFileSync(
    new URL(
      '../../db/migrations/0012_project_assignments.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const operationList = /IF operation NOT IN \(([^)]+)\)/.exec(sql)![1]!;
  const operations = [...operationList.matchAll(/'([^']+)'/g)].map(
    (match) => match[1]!,
  );
  expect(operations).toContain('authors');
  for (const operation of operations) {
    const label = auditActionPresentation('assignment.' + operation);
    expect(label).not.toBeNull();
    expect(label!.en).not.toBe('Other recorded action');
    expect(label!.ar.length).toBeGreaterThan(5);
  }
});

it('both authorizing and replacing a legacy evidence packet have distinct exact actions', () => {
  const sql = readFileSync(
    new URL('../../db/migrations/0044_academic_packets.sql', import.meta.url),
    'utf8',
  );
  const event =
    /CASE WHEN supersedes IS NULL THEN '([^']+)' ELSE '([^']+)' END,cid/.exec(
      sql,
    )!;
  const first = auditActionPresentation('academic-packet.' + event[1]!);
  const replacement = auditActionPresentation('academic-packet.' + event[2]!);
  expect(first).not.toBeNull();
  expect(replacement).not.toBeNull();
  expect(replacement!.en).not.toBe(first!.en);
  expect(replacement!.ar).not.toBe(first!.ar);
});
