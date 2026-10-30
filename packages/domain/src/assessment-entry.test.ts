import { describe, it, expect } from 'vitest';
import { assessmentIssues } from './evaluations.js';
import { externalFormIssues } from './external-reviews.js';
import { academicDraftSchema } from './academic.js';
import { uploadedLicenseFile } from './native-files.js';
import { assessmentEntryPayload } from './assessment-entry.js';
const supervisor = (level = 4) => ({
  inputContract: 'SCORES_ONLY_V3' as const,
  layer: 'supervisor' as const,
  criteria: Array.from({ length: 7 }, (_, i) => ({
    code: 'C' + (i + 1),
    level,
  })),
  members: [],
  assessedOn: null,
  attestation: false,
});
describe('SCORES_ONLY_V3 prospective entry contract', () => {
  it('accepts seven valid scores without any retired entry fields and does not fabricate acknowledgment', () => {
    const parsed = academicDraftSchema.parse(supervisor());
    expect(assessmentIssues(parsed as never, '2026-10-23')).toEqual([]);
    expect(parsed.calibration).toBe(false);
    expect(parsed.overall).toBe('');
    expect(
      parsed.criteria.every((c) => c.locators.length === 0 && c.comment === ''),
    ).toBe(true);
  });
  it('retains complete legacy validation and rejects unsupported or invalid score sets', () => {
    const old = {
      ...academicDraftSchema.parse(supervisor()),
      inputContract: undefined,
    };
    expect(assessmentIssues(old as never, '2026-10-23')).toContain(
      'CALIBRATION',
    );
    expect(
      assessmentIssues(
        { ...supervisor(), criteria: supervisor().criteria.slice(1) } as never,
        '2026-10-23',
      ),
    ).toContain('CRITERIA');
    expect(assessmentIssues(supervisor(4.5) as never, '2026-10-23')).toContain(
      'C1:LEVEL',
    );
    expect(
      assessmentIssues(
        { ...supervisor(), inputContract: 'UNKNOWN' } as never,
        '2026-10-23',
      ),
    ).toContain('ENTRY_CONTRACT');
  });
  it('accepts four independent scores while preserving exact evidence validation when real references are supplied', () => {
    const body = {
      inputContract: 'SCORES_ONLY_V3',
      criteria: ['E1', 'E2', 'E3', 'E4'].map((code) => ({ code, level: 0 })),
    };
    expect(externalFormIssues(body, [], true)).toEqual([]);
    expect(
      externalFormIssues(
        {
          ...body,
          criteria: [
            {
              ...body.criteria[0],
              locators: [{ file: 'outside', kind: 'section', reference: '1' }],
            },
            ...body.criteria.slice(1),
          ],
        },
        [],
        true,
      ),
    ).toContain('E1.evidence');
    expect(
      externalFormIssues(
        { ...body, criteria: body.criteria.slice(1) },
        [],
        true,
      ),
    ).toContain('criteria');
  });
  it('preserves authentic saved notes and references instead of replacing them with placeholders', () => {
    const body = {
      ...supervisor(),
      overall: 'My previously saved context',
      calibration: false,
      criteria: supervisor().criteria.map((c) => ({
        ...c,
        comment: 'Actual own note',
        locators: [],
      })),
    };
    expect(assessmentEntryPayload(body)).toEqual(body);
    expect(body.calibration).toBe(false);
  });
});
describe('permitted uploaded original selection', () => {
  it('prefers the canonical root original and excludes generated or unproven files', () => {
    expect(
      uploadedLicenseFile([
        { path: 'src/LICENSE.md', uploadedLicense: true },
        { path: 'LICENSE', uploadedLicense: true },
        { path: 'LICENSE.txt', uploadedLicense: false },
      ])?.path,
    ).toBe('LICENSE');
    expect(
      uploadedLicenseFile([
        { path: 'LICENSE' },
        { path: 'my-license.txt', uploadedLicense: true },
        { path: '../LICENSE', uploadedLicense: true },
      ]),
    ).toBeUndefined();
  });
});
