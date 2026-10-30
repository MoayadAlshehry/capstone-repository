import type { Locale } from './common';
export function safeParent(l: Locale, value: unknown, parent: string) {
  if (typeof value !== 'string' || value.length > 1500) return `/${l}${parent}`;
  try {
    const u = new URL(value, 'https://parent.invalid');
    if (
      u.origin !== 'https://parent.invalid' ||
      u.hash ||
      ![`/en${parent}`, `/ar${parent}`].includes(u.pathname) ||
      /[\\\u0000-\u001f]/.test(value) ||
      [...u.searchParams.keys()].some(
        (k) => !['q', 'status', 'role', 'page', 'tab', 'selected'].includes(k),
      )
    )
      return `/${l}${parent}`;
    return `/${l}${parent}` + u.search;
  } catch {
    return `/${l}${parent}`;
  }
}
