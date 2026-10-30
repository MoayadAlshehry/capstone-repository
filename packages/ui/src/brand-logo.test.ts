import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { BrandLogo } from './brand-logo.js';
import {
  primaryLogoMarkup,
  primaryLogoSourceSha256,
} from './primary-logo.generated.js';

it('renders the supplied official asset without introducing executable SVG content', () => {
  const original = readFileSync(
    new URL('../../../apps/web/public/brand/Primary_Logo.svg', import.meta.url),
  );
  expect(createHash('sha256').update(original).digest('hex')).toBe(
    primaryLogoSourceSha256,
  );
  const text = original.toString('utf8');
  expect(primaryLogoMarkup).toBe(text.slice(text.indexOf('<svg')).trim());
  expect(primaryLogoMarkup).not.toMatch(
    /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i,
  );
});

it('keeps repeated header and footer SVG identities distinct and non-focusable', () => {
  const output = renderToStaticMarkup(
    createElement(
      'div',
      null,
      createElement(BrandLogo, { label: 'Header identity', decorative: true }),
      createElement(BrandLogo, { label: 'Footer identity', compact: true }),
    ),
  );
  const ids = [...output.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  expect(ids.length).toBeGreaterThan(2);
  expect(new Set(ids).size).toBe(ids.length);
  expect(output).toContain('aria-label="Footer identity"');
  expect(output).not.toContain('aria-label="Header identity"');
  expect((output.match(/focusable="false"/g) ?? []).length).toBe(2);
});
