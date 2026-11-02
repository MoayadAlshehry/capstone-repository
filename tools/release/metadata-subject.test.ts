import { describe, expect, it } from 'vitest';
import {
  rankMetadata,
  sourceSupport,
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

describe('postposed negative capability statements', () => {
  const negative = row(
    'negative',
    'Heat Pump Prototype',
    'Heat recovery is not implemented. Temperature measurement is implemented.',
  );
  const affirmative = row(
    'affirmative',
    'Heat Recovery Prototype',
    'The prototype implements heat recovery.',
  );
  it('does not use a not-implemented clause as positive subject evidence', () => {
    expect(sourceSupport(negative, 'heat recovery')).toEqual([]);
    expect(
      sourceSupport(negative, 'temperature measurement').length,
    ).toBeGreaterThan(0);
    expect(
      rank(
        [negative, affirmative],
        [{ text: 'heat recovery', alternatives: [] }],
      ),
    ).toEqual(['affirmative']);
  });
  it('retains a specific not-implemented clause as explicit absence evidence', () => {
    expect(sourceSupport(negative, 'heat recovery', true)).toEqual([
      'Heat recovery is not implemented.',
    ]);
  });
  it('distinguishes not-included or not-provided from a nonexclusive description', () => {
    expect(
      sourceSupport(
        row('a', 'Prototype', 'Acoustic sensing is not included.'),
        'acoustic sensing',
      ),
    ).toEqual([]);
    expect(
      sourceSupport(
        row('b', 'Prototype', 'Acoustic sensing is not provided.'),
        'acoustic sensing',
      ),
    ).toEqual([]);
    expect(
      sourceSupport(
        row('c', 'Prototype', 'Acoustic sensing is not excluded.'),
        'acoustic sensing',
        true,
      ),
    ).toEqual([]);
  });
});

it('does not mistake a qualified condition for a declaration of total absence', () => {
  expect(
    sourceSupport(
      row(
        'paid',
        'Acoustic Prototype',
        'Acoustic sensing is not provided free of charge.',
      ),
      'acoustic sensing',
      true,
    ),
  ).toEqual([]);
  expect(
    sourceSupport(
      row(
        'conditional',
        'Thermal Prototype',
        'Heat recovery is not implemented without operator approval.',
      ),
      'heat recovery',
      true,
    ),
  ).toEqual([]);
});

it('recognizes current or not-yet implementation absence without a conditional qualifier', () => {
  expect(
    sourceSupport(
      row(
        'pending',
        'Thermal Prototype',
        'Heat recovery is not yet implemented.',
      ),
      'heat recovery',
    ),
  ).toEqual([]);
  expect(
    sourceSupport(
      row(
        'current',
        'Thermal Prototype',
        'Heat recovery is not currently provided.',
      ),
      'heat recovery',
      true,
    ),
  ).toEqual(['Heat recovery is not currently provided.']);
});
