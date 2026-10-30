import { expect, it } from 'vitest';
import { reviewHistoryReturn } from './history';

it('returns closed tasks to History without losing the validated search', () => {
  const href = reviewHistoryReturn(
    'en',
    '/en/reviewer?tab=progress&q=exact%20project%20title',
  );
  const url = new URL(href, 'https://local.invalid');
  expect(url.pathname).toBe('/en/reviewer');
  expect(url.searchParams.get('tab')).toBe('history');
  expect(url.searchParams.get('q')).toBe('exact project title');
});

it('keeps bilingual search text while using the current locale', () => {
  const href = reviewHistoryReturn('ar', '/en/reviewer?q=%D8%A3%D8%B5%D9%84');
  const url = new URL(href, 'https://local.invalid');
  expect(url.pathname).toBe('/ar/reviewer');
  expect(url.searchParams.get('tab')).toBe('history');
  expect(url.searchParams.get('q')).toBe('أصل');
});

it('uses an unfiltered History return when the validated parent is unfiltered', () => {
  expect(reviewHistoryReturn('en', '/en/reviewer')).toBe(
    '/en/reviewer?tab=history',
  );
});
