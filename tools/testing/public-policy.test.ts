import { it, expect } from 'vitest';
import { join } from 'node:path';
import {
  sourceExecutionDeferred,
  engineeringTestNames,
  engineeringPhaseDirectory,
} from './source-policy.js';
import { engineeringEvidencePath, saveJson, root } from '../automation/core.js';

it('keeps historical acceptance read-only while explicitly selecting public engineering output', async () => {
  expect(sourceExecutionDeferred).toBe(true);
  expect(engineeringPhaseDirectory).toBe('public-release');
  await expect(
    saveJson(join(root, 'docs/registries/acceptance-status.json'), {
      outcome: 'UNAUTHORIZED_PROMOTION',
    }),
  ).rejects.toThrow('Historical source registry is read-only');
});

it('makes historical TC selection explicit without filtering ordinary engineering names', () => {
  expect(engineeringTestNames?.test('TC-23 historical complete scenario')).toBe(
    false,
  );
  expect(
    engineeringTestNames?.test('exact seventy policy engineering regression'),
  ).toBe(true);
});

it('scopes engineering evidence remapping to this source root', () => {
  const own = join(root, '.local/evidence-raw/phase-12/result.json');
  expect(engineeringEvidencePath(own)).toBe(
    join(
      root,
      '.local/evidence-raw/public-release/engineering-regressions/phase-12/result.json',
    ),
  );
  const other = '/tmp/other-capstone/.local/evidence-raw/phase-12/result.json';
  expect(engineeringEvidencePath(other)).toBe(other);
});
