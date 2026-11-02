import { describe, expect, it } from 'vitest';
import {
  rankMetadata,
  safeAlternatives,
  type MetadataRecord,
  type SoftGroup,
} from '../../apps/web/ai/metadata-ranking';
const row = (
  project: string,
  title: string,
  abstract: string,
): MetadataRecord => ({
  project,
  version: project + '-v1',
  title,
  abstract,
  keywords: [],
});
const orchard = row(
  'orchard',
  'Controlled Study of Orchard Scheduling',
  'A controlled study compares fixed schedules for irrigation.',
);
const apparatus = row(
  'apparatus',
  'Laboratory Apparatus Demonstrator',
  'Prototype deployment and functional demonstration are documented. Fabrication and testing use synthetic cases.',
);
const clinical = row(
  'clinical',
  'Randomized Clinical Trial of Retinal Implants',
  'A randomized clinical trial evaluates retinal implants with documented patient outcomes.',
);
const irrigation = row(
  'irrigation',
  'Watering Controller',
  'A watering controller records measured soil moisture and bounded water use.',
);
const rank = (records: MetadataRecord[], groups: SoftGroup[], strict = false) =>
  rankMetadata(
    records,
    groups,
    records.map((r) => ({ id: r.project, score: 1 })),
    Object.fromEntries(records.map((r) => [r.project, 0.5])),
    [],
    strict,
  ).selected.map((r) => r.id);
describe('qualified metadata interests retain their subject', () => {
  it('does not broaden a clinical trial into a generic controlled study', () => {
    const g = {
      text: 'randomized clinical trial',
      alternatives: ['controlled study', 'clinical trial'],
    };
    expect(rank([orchard, clinical], [g])).toEqual(['clinical']);
  });
  it('does not admit subject-free operations when the requested technology is absent', () => {
    expect(
      rank(
        [apparatus],
        [
          {
            text: 'neutrino detector',
            alternatives: ['neutrino detection instrument'],
          },
          {
            text: 'experimental operation',
            alternatives: ['prototype deployment', 'functional demonstration'],
          },
          {
            text: 'construction and operation',
            alternatives: ['fabrication and testing'],
          },
        ],
      ),
    ).toEqual([]);
  });
  it('retains a source-supported substantive paraphrase', () => {
    expect(
      rank(
        [irrigation],
        [
          {
            text: 'irrigation controller',
            alternatives: ['watering controller'],
          },
        ],
      ),
    ).toEqual(['irrigation']);
  });
  it('retains qualified Arabic alternatives and rejects only generic procedures', () => {
    const g = {
      text: 'clinical trial',
      alternatives: ['دراسة تجريبية', 'تجربة سريرية'],
    };
    expect(safeAlternatives(g, [clinical])).toContain('تجربة سريرية');
    expect(safeAlternatives(g, [clinical])).not.toContain('دراسة تجريبية');
  });
  it('retains explicit generic-only discovery', () => {
    expect(
      rank(
        [apparatus],
        [
          {
            text: 'experimental operation',
            alternatives: ['prototype deployment'],
          },
        ],
      ),
    ).toEqual(['apparatus']);
  });
  it('keeps strict conjunction and hard source requirements', () => {
    expect(
      rank(
        [clinical],
        [
          { text: 'clinical trial', alternatives: [] },
          { text: 'neutrino detector', alternatives: [] },
        ],
        true,
      ),
    ).toEqual([]);
  });
});
