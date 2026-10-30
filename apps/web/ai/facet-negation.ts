/** Only operators attached to this named facet. An earlier negative topic
 * clause ("without sensors from …") cannot negate the institution. */
export function explicitFacetOperator(prefix: string) {
  if (
    /\b(?:excluding|except|other than|without|not(?:\s+(?:from|at|in|by))?)\s*$/iu.test(
      prefix,
    ) ||
    /(?:باستثناء|عدا|غير|بدون|دون|ليس(?:ت)?\s+من|لا\s+ينتمي\s+إلى)\s*$/u.test(
      prefix,
    )
  )
    return 'exclude' as const;
  if (
    /\b(?:from|at|in|by)\s*$/iu.test(prefix) ||
    /(?:من|في|بجامعة|بقسم)\s*$/u.test(prefix)
  )
    return 'include' as const;
  return undefined;
}
