import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ProjectCover,
  PersonAvatar,
  DefaultProjectCover,
  visualVariant,
  visualInitials,
} from './visual-media.js';
import { coverScenes, coverSceneIndex, visualHash } from './cover-scenes.js';
it('renders all six editorial scenes from an unsigned project hash, preserving four avatar tones', () => {
  expect(coverScenes).toHaveLength(6);
  const seeds = Array.from({ length: 100 }, (_, i) => 'research-' + i);
  expect(new Set(seeds.map(coverSceneIndex)).size).toBe(6);
  expect(visualHash('research-4')).toBeGreaterThanOrEqual(0);
  expect(visualHash('é')).toBe(visualHash('e\u0301'));
  expect(
    new Set(coverScenes.map((s) => s.plates.map((p) => p.d).join(' '))).size,
  ).toBe(6);
  for (const seed of seeds) {
    expect(visualVariant(seed)).toBe(visualHash(seed) % 4);
    const html = renderToStaticMarkup(<DefaultProjectCover seed={seed} />);
    expect(html).toContain('viewBox="0 0 1600 1000"');
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(html).toContain(
      'data-scene="' + coverScenes[coverSceneIndex(seed)]!.id + '"',
    );
    expect(html).not.toMatch(/<(text|filter|image|script|foreignObject)\b/);
    expect(html).not.toContain(' id=');
  }
});
it('gives projects stable, distinct locale-neutral default identities without unstable SVG ids', () => {
  const seeds = ['academic-1', 'academic-2', 'academic-3', 'academic-4'];
  expect(new Set(seeds.map(visualVariant)).size).toBe(4);
  for (const seed of seeds) {
    const first = renderToStaticMarkup(<DefaultProjectCover seed={seed} />);
    expect(renderToStaticMarkup(<DefaultProjectCover seed={seed} />)).toBe(
      first,
    );
    expect(first).not.toContain(' id=');
    expect(first).toContain('aria-hidden="true"');
  }
});
it('uses a neutral stable frame without unrelated art or image requests when identity is pending', () => {
  const html = renderToStaticMarkup(<ProjectCover projectId="demo" />);
  expect(html).not.toContain('<svg');
  expect(html).toContain('visual-cover');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('missing');
});
it('keeps Arabic/English initials readable and escapes supplied names', () => {
  expect(visualInitials('Maha Ibrahim')).toBe('MI');
  expect(visualInitials('مها إبراهيم')).toBe('مإ');
  expect(visualInitials('')).toBe('');
  const html = renderToStaticMarkup(<PersonAvatar name="<script> unsafe" />);
  expect(html).toContain('aria-hidden="true"');
  expect(html).not.toContain('<script>');
  expect(html).toContain('<svg');
});
it('does not render arbitrary image URLs', () => {
  const html = renderToStaticMarkup(
    <ProjectCover
      image={{
        id: 'test',
        width: 10,
        height: 10,
        smallWidth: 10,
        smallHeight: 10,
        src: 'https://remote.invalid/photo',
        smallSrc: 'javascript:alert(1)',
      }}
    />,
  );
  expect(html).not.toContain('<img');
  expect(html).not.toContain('visual-cover-art');
});
