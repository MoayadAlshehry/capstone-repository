import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Roster } from './collections';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/admin/platform',
  useSearchParams: () => new URLSearchParams('q=existing%20query'),
}));

it.each([
  ['universities', 'en', 'Search universities'],
  ['universities', 'ar', 'البحث عن جامعات'],
  ['people', 'en', 'Search people'],
  ['people', 'ar', 'البحث عن أشخاص'],
] as const)(
  'does not accept search input or submit before %s %s has prepared its client handlers',
  (kind, locale, label) => {
    const html = renderToStaticMarkup(
      <Roster
        locale={locale}
        kind={kind}
        list={{ rows: [], total: 0, page: 1, pageSize: 20 }}
      />,
    );
    const input = [...html.matchAll(/<input\b[^>]*>/g)]
        .map((match) => match[0])
        .find((markup) => markup.includes(`aria-label="${label}"`)),
      submit = [...html.matchAll(/<button\b[^>]*>/g)]
        .map((match) => match[0])
        .find((markup) => markup.includes('type="submit"'));
    expect(input).toContain('disabled=""');
    expect(input).toContain('value="existing query"');
    expect(submit).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  },
);
