export function safeReturnTo(
  value: string | null | undefined,
  locale: 'en' | 'ar',
) {
  return value !== null &&
    value !== undefined &&
    [
      '/en/account',
      '/ar/account',
      '/en/reviewer/profile',
      '/ar/reviewer/profile',
      '/en/admin/platform/reviewers',
      '/ar/admin/platform/reviewers',
      '/en/notifications',
      '/ar/notifications',
      '/en/audit',
      '/ar/audit',
      '/en/partner/access',
      '/ar/partner/access',
      '/en/access/lead',
      '/ar/access/lead',
      '/en/admin/access',
      '/ar/admin/access',
      '/en/partner',
      '/ar/partner',
      '/en/admin/platform/partners',
      '/ar/admin/platform/partners',
    ].includes(value)
    ? value
    : `/${locale}/account`;
}
