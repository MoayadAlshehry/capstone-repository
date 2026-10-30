export const computingDomains = [
  { code: 'software', en: 'Software systems', ar: 'أنظمة البرمجيات' },
  { code: 'data', en: 'Data and information', ar: 'البيانات والمعلومات' },
  { code: 'hardware', en: 'Computing hardware', ar: 'عتاد الحوسبة' },
] as const;
export const administrationFields: Record<string, readonly string[]> = {
  'university.create': ['code', 'name_en', 'name_ar', 'reason'],
  'university.update': ['university', 'name_en', 'name_ar', 'status', 'reason'],
  'administrator.create': ['university', 'name', 'email', 'reason'],
  'administrator.activation': ['university', 'id', 'reason'],
  'department.create': ['code', 'name_en', 'name_ar', 'reason'],
  'department.update': ['id', 'name_en', 'name_ar', 'version', 'reason'],
  'account.create': [
    'name',
    'email',
    'role',
    'department',
    'student_id',
    'reason',
  ],
  'account.status': ['id', 'status', 'reason'],
  'account.role': ['id', 'role', 'department', 'student_id', 'reason'],
  'activation.issue': ['id', 'reason'],
  'reset.issue': ['id', 'reason'],
  'profile.update': ['name', 'reason'],
};
export function validAdministrationInput(
  command: string,
  value: unknown,
): value is Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = administrationFields[command];
  if (!allowed) return false;
  const fields = value as Record<string, unknown>;
  return (
    Object.keys(fields).every((k) => allowed.includes(k)) &&
    allowed.every((k) => {
      const v = fields[k];
      if (k === 'version') return Number.isInteger(Number(v)) && Number(v) >= 0;
      if (typeof v !== 'string') return false;
      if (['id', 'university', 'department'].includes(k))
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          v,
        );
      if (k === 'email')
        return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
      if (k === 'reason')
        return (
          v.trim().length >= 3 &&
          v.length <= 400 &&
          !/password|token|cookie|postgres(?:ql)?:/i.test(v) &&
          !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}/i.test(
            v,
          )
        );
      if (k === 'role') return ['student', 'faculty_supervisor'].includes(v);
      if (k === 'status') return ['active', 'suspended'].includes(v);
      if (k === 'code')
        return command.startsWith('department')
          ? ['CS', 'IS', 'CE'].includes(v)
          : /^[A-Z][A-Z0-9_]{1,31}$/.test(v);
      if (k === 'student_id')
        return v === '' || /^[A-Za-z0-9_-]{1,64}$/.test(v);
      return v.trim().length > 0 && v.length <= (k === 'name' ? 200 : 120);
    })
  );
}
export function lifecycleValid(
  expiresAt: number,
  now: number,
  consumed: boolean,
  revoked: boolean,
) {
  return !consumed && !revoked && now < expiresAt;
}
