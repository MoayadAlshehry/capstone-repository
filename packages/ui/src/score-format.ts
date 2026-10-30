/** Presentation only. Never use this value for persistence, ranking, policy or exports. */
export function formatScore(
  value: number | string | null | undefined,
  locale: 'en' | 'ar',
) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    !Number.isFinite(Number(value))
  )
    return '-';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value));
}
