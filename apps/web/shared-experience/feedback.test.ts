import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ReleasedFeedback } from './feedback';
import type { AuthorFeedback } from './types';

it('the real feedback template never renders unreleased external entries in either locale', () => {
  const initial: AuthorFeedback = {
    case: 'own-case',
    version: 'own-version',
    internal: [],
    externalReleased: false,
    corrected: false,
    external: [
      {
        label: 1,
        score: 99,
        corrected: false,
        finalizedAt: '2026-10-13T00:00:00Z',
        form: { overall: 'UNRELEASED_OTHER_REVIEW_SECRET', criteria: [] },
      },
    ],
  };
  for (const locale of ['en', 'ar'] as const) {
    const html = renderToStaticMarkup(
      createElement(ReleasedFeedback, {
        locale,
        initial,
        backHref: '/' + locale + '/projects',
      }),
    );
    expect(html).not.toContain('UNRELEASED_OTHER_REVIEW_SECRET');
    expect(html).not.toContain('99.00');
    expect(html).toContain(
      locale === 'en'
        ? 'Independent feedback has not been released'
        : 'لم تُتح الملاحظات المستقلة',
    );
  }
});
