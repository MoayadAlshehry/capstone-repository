import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './button.js';
it('keeps the single-element Slot contract for workspace navigation', () => {
  const html = renderToStaticMarkup(
    <Button asChild>
      <a href="/en/projects">Open project</a>
    </Button>,
  );
  expect(html).toContain('href="/en/projects"');
  expect(html).not.toContain('action-spinner');
});
it('represents a real pending action without changing its accessible label', () => {
  const html = renderToStaticMarkup(<Button pending>Save draft</Button>);
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('action-spinner');
  expect(html).toContain('Save draft');
});
