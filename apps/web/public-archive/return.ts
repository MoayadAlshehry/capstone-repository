import { parseDiscovery } from '@capstone/domain';
import type { Locale } from './core.js';
export function safeCatalogueReturn(
  value: unknown,
  locale: Locale,
  project: string,
) {
  const base = `/${locale}/catalogue`;
  if (typeof value !== 'string' || value.length > 20000) return base;
  try {
    const url = new URL(value, 'https://public-return.invalid');
    if (
      url.origin !== 'https://public-return.invalid' ||
      !/^\/(en|ar)\/catalogue$/.test(url.pathname) ||
      url.hash
    )
      return base;
    parseDiscovery(url.searchParams);
    return base + url.search + '#project-' + encodeURIComponent(project);
  } catch {
    return base;
  }
}
