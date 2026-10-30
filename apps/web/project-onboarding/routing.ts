export function projectParent(
  locale: 'en' | 'ar',
  value: unknown,
  fallback = '/admin/university',
) {
  if (
    typeof value !== 'string' ||
    value.length > 1400 ||
    /[\\\u0000-\u001f]/.test(value)
  )
    return '/' + locale + fallback;
  try {
    const u = new URL(value, 'https://project-parent.invalid');
    if (u.origin !== 'https://project-parent.invalid' || u.hash)
      return '/' + locale + fallback;
    const path = u.pathname.replace(/^\/(en|ar)/, '');
    if (
      !['/admin/university', '/projects', '/supervision'].includes(path) &&
      !/^\/admin\/university\/projects\/[a-f0-9-]{36}$/.test(path)
    )
      return '/' + locale + fallback;
    for (const [k, v] of u.searchParams)
      if (
        !['q', 'status', 'department', 'year', 'page', 'selected'].includes(
          k,
        ) ||
        u.searchParams.getAll(k).length !== 1 ||
        v.length > 200
      )
        return '/' + locale + fallback;
    return '/' + locale + path + u.search;
  } catch {
    return '/' + locale + fallback;
  }
}
