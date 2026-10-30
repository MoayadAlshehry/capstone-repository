import type {
  ManagedAccountRow,
  AssignmentView,
  ProjectShell,
} from './types.js';
export type { ManagedAccountRow, AssignmentView, ProjectShell };
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface Filters {
  q: string;
  status: string;
  role: string;
  page: number;
}
export function filters(p: URLSearchParams): Filters {
  const q = p.get('q') ?? '',
    status = p.get('status') ?? 'all',
    role = p.get('role') ?? 'all',
    page = Number(p.get('page') ?? 1);
  if (
    q.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(q) ||
    ![
      'all',
      'active',
      'inactive',
      'suspended',
      'archived',
      'rejected',
      'draft',
      'revision_required',
      'pending_review',
    ].includes(status) ||
    !['all', 'student', 'faculty_supervisor'].includes(role) ||
    !Number.isSafeInteger(page) ||
    page < 1
  )
    throw Error('INVALID_FILTER');
  return { q, status, role, page };
}
export function personSignature(p: ManagedAccountRow) {
  return JSON.stringify([
    p.id,
    p.account_status,
    p.role_code,
    p.department_id,
    p.student_id,
    p.lifecycle,
  ]);
}
export function groupForProject(view: AssignmentView, project: ProjectShell) {
  return view.groups.find((g) => g.code === project.group);
}
export function peopleRows(rows: ManagedAccountRow[], f: Filters) {
  return rows.filter(
    (p) =>
      (p.full_name + ' ' + p.email + ' ' + (p.student_id ?? ''))
        .toLocaleLowerCase()
        .includes(f.q.toLocaleLowerCase()) &&
      (f.status === 'all' || p.account_status === f.status) &&
      (f.role === 'all' || p.role_code === f.role),
  );
}
export function safeFrom(value: unknown, locale: 'en' | 'ar') {
  const fallback = '/' + locale + '/admin/university/people';
  if (
    typeof value !== 'string' ||
    value.length > 12000 ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    const u = new URL(value, 'http://university-return.invalid');
    if (
      u.origin !== 'http://university-return.invalid' ||
      u.hash ||
      !/^\/(en|ar)\/admin\/university(?:\/(people|assignments|archive|records|departments))?$/.test(
        u.pathname,
      ) ||
      [...u.searchParams.keys()].some(
        (k) => !['q', 'status', 'role', 'page'].includes(k),
      ) ||
      [...u.searchParams.keys()].some(
        (k) => u.searchParams.getAll(k).length !== 1,
      )
    )
      return fallback;
    filters(u.searchParams);
    return u.pathname.replace(/^\/(en|ar)/, '/' + locale) + u.search;
  } catch {
    return fallback;
  }
}
export function mayChangeRole(
  p: ManagedAccountRow,
  view: AssignmentView | null,
) {
  return (
    !!view &&
    !view.groups.some((g) => g.members.some((m) => m.id === p.id)) &&
    !view.projects.some(
      (x) => x.supervisor.id === p.id || x.authors.some((a) => a.id === p.id),
    )
  );
}
