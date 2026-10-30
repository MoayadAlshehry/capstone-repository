const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validAssignmentInput(
  operation: string,
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const f = value as Record<string, unknown>,
    keys: Record<string, string[]> = {
      create: ['group', 'authors', 'lead', 'supervisor', 'reason'],
      authors: ['project', 'expected', 'authors', 'lead', 'reason'],
      lead: ['project', 'expected', 'lead', 'reason'],
      supervisor: ['project', 'expected', 'supervisor', 'reason'],
    };
  const allowed = keys[operation];
  if (
    !allowed ||
    Object.keys(f).length !== allowed.length ||
    Object.keys(f).some((k) => !allowed.includes(k))
  )
    return false;
  if (
    typeof f['reason'] !== 'string' ||
    f['reason'].trim().length < 3 ||
    f['reason'].length > 400 ||
    /[\u0000-\u001f\u007f]|(?:password|secret|token|cookie)\s*[:=]|[0-9a-f-]{36}\.[0-9a-f-]{36}\.[0-9a-f]{64}/i.test(
      f['reason'],
    )
  )
    return false;
  for (const k of ['group', 'project', 'lead', 'supervisor'])
    if (k in f && (typeof f[k] !== 'string' || !uuid.test(f[k]))) return false;
  if (
    'expected' in f &&
    (!Number.isSafeInteger(f['expected']) || Number(f['expected']) < 0)
  )
    return false;
  if (
    'authors' in f &&
    (!Array.isArray(f['authors']) ||
      f['authors'].length < 1 ||
      f['authors'].length > 1000 ||
      f['authors'].some((x) => typeof x !== 'string' || !uuid.test(x)) ||
      new Set(f['authors']).size !== f['authors'].length ||
      !f['authors'].includes(f['lead']))
  )
    return false;
  return true;
}
