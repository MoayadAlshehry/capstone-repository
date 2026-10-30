function localizeRoute(value: string, locale: 'en' | 'ar', depth = 0): string {
  if (depth > 3 || !/^\/(en|ar)(?=\/|[?#]|$)/.test(value)) return value;
  const target = new URL(value, 'https://public.invalid');
  target.pathname = target.pathname.replace(
    /^\/(en|ar)(?=\/|[?#]|$)/,
    '/' + locale,
  );
  for (const key of ['from', 'returnTo']) {
    const nested = target.searchParams.get(key);
    if (nested && /^\/(en|ar)(?=\/|[?#]|$)/.test(nested))
      target.searchParams.set(key, localizeRoute(nested, locale, depth + 1));
  }
  return target.pathname + target.search + target.hash;
}
/** Keep path, query and nested return routes separate when switching public locales. */
export function localizedPublicDestination(
  path: string,
  query: string,
  locale: 'en' | 'ar',
) {
  const target = new URL(path, 'https://public.invalid');
  target.search = query;
  target.hash = '';
  return localizeRoute(target.pathname + target.search, locale);
}
/** Replace a destination fragment rather than concatenating two URL fragments. */
export function publicLocaleDestination(
  destination: string,
  fragment: string,
  origin: string,
) {
  const target = new URL(destination, origin);
  target.hash = fragment;
  return target.pathname + target.search + target.hash;
}
