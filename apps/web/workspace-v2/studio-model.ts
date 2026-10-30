import {
  navigation,
  type WorkspaceIdentity,
  type Locale,
} from './navigation.ts';
import { routeScope } from './registry.ts';
export type NavIcon =
  | 'Building2'
  | 'FolderKanban'
  | 'UsersRound'
  | 'Archive'
  | 'Bell'
  | 'BookOpen'
  | 'ShieldCheck'
  | 'LayoutDashboard'
  | 'Clock3'
  | 'Settings'
  | 'Globe2';
export function navigationIcon(path: string): NavIcon {
  const rules: [RegExp, NavIcon][] = [
    [/\/notifications/, 'Bell'],
    [/\/people/, 'UsersRound'],
    [/\/archive|\/history/, 'Archive'],
    [/\/approvals/, 'ShieldCheck'],
    [/\/overview/, 'LayoutDashboard'],
    [/\/operations|\/profile/, 'Settings'],
    [/\/reviews$|\/access$/, 'Clock3'],
    [/\/reviewer/, 'BookOpen'],
    [/\/catalogue/, 'Globe2'],
    [/\/admin\/platform/, 'Building2'],
  ];
  return rules.find(([p]) => p.test(path))?.[1] ?? 'FolderKanban';
}
export function roleLabel(
  role: string,
  independent = false,
): readonly [string, string] {
  if (role === 'faculty_supervisor' && independent)
    return ['Independent review', 'التقييم المستقل'];
  return (
    (
      {
        platform_admin: ['Platform administrator', 'مدير المنصة'],
        university_admin: ['University administrator', 'مدير الجامعة'],
        student: ['Student author', 'مؤلف طالب'],
        faculty_supervisor: ['Faculty supervisor', 'مشرف أكاديمي'],
        partner: ['Partner', 'شريك'],
      } as const
    )[role as 'student'] ?? ['Account', 'الحساب']
  );
}
export function contextLabel(
  role: string,
  independent = false,
): readonly [string, string] {
  if (role === 'faculty_supervisor' && independent)
    return ['Independent review', 'التقييم المستقل'];
  return (
    (
      {
        platform_admin: ['Platform administration', 'إدارة المنصة'],
        university_admin: ['University administration', 'إدارة الجامعة'],
        student: ['Author workspace', 'مساحة المؤلف'],
        faculty_supervisor: ['Supervision', 'الإشراف'],
        partner: ['Partner workspace', 'مساحة الشريك'],
      } as const
    )[role as 'student'] ?? ['Workspace', 'مساحة العمل']
  );
}
export function activeDestination(
  a: WorkspaceIdentity,
  path: string,
  independent = false,
) {
  if (
    a.role === 'partner' &&
    (path === '/partner/grants' ||
      path.startsWith('/partner/grants/') ||
      path === '/partner/requests' ||
      path === '/partner/request')
  )
    return '/partner/access';
  const exact = navigation(a, independent).find((n) => n.path === path);
  if (exact) return exact.path;
  const prefix = navigation(a, independent)
    .filter((n) => path.startsWith(n.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix?.path ?? null;
}
export function breadcrumbLabel(path: string): readonly [string, string] {
  if (path === '/reviewer/profile') return ['Reviewer profile', 'ملف المقيّم'];
  if (path === '/partner/access')
    return ['Project access', 'الوصول إلى المشاريع'];
  if (path === '/partner/eligibility')
    return ['Organization & eligibility', 'المؤسسة والأهلية'];

  if (['R05', 'R06'].includes(routeScope(path)?.slice ?? ''))
    return routeScope(path)!.title;
  if (path === '/admin/university/projects/new')
    return ['New project', 'مشروع جديد'];
  if (/^\/admin\/university\/projects\/created\/[a-f0-9-]{36}$/.test(path))
    return ['Project created', 'أُنشئ المشروع'];
  if (/^\/admin\/university\/projects\/[a-f0-9-]{36}$/.test(path))
    return ['Project team', 'فريق المشروع'];
  if (
    /^\/projects\/[a-f0-9-]{36}$/.test(path) ||
    /^\/supervision\/projects\/[a-f0-9-]{36}$/.test(path)
  )
    return ['Assigned project', 'المشروع المسند'];
  if (/^\/admin\/university\/people\/[a-f0-9-]{36}\/account-access$/.test(path))
    return ['Account access', 'وصول الحساب'];
  if (path === '/account') return ['Your account', 'حسابك'];
  if (path.startsWith('/evaluation/'))
    return (
      routeScope(path)?.title ?? ['Academic review', 'المراجعة الأكاديمية']
    );
  if (path === '/audit') return ['Scoped audit', 'التدقيق المحدد'];
  if (path === '/admin/university/people/new')
    return ['Invite people', 'دعوة الأشخاص'];
  if (/^\/admin\/platform\/[0-9a-f-]{36}$/.test(path))
    return ['University record', 'سجل الجامعة'];
  if (/^\/reviewer\/tasks\/[a-f0-9-]{36}$/.test(path))
    return ['Your review', 'تحكيمك'];
  if (/\/[0-9a-f-]{36}/.test(path)) return ['Record', 'السجل'];
  return routeScope(path)?.title ?? ['Workspace', 'مساحة العمل'];
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toLocaleUpperCase();
}
type StatusTone = 'positive' | 'neutral' | 'attention' | 'closed';
export function statusPresentation(status: string, locale: Locale) {
  const labels: Record<string, readonly [string, string, StatusTone]> = {
    active: ['Active', 'نشط', 'positive'],
    suspended: ['Suspended', 'موقوف', 'attention'],
    draft: ['In progress', 'قيد العمل', 'neutral'],
    revision_required: ['Changes requested', 'تعديلات مطلوبة', 'attention'],
    submitted: ['Submitted', 'مُسلّم', 'neutral'],
    published: ['Published', 'منشور', 'positive'],
    archived: ['Archived', 'مؤرشف', 'closed'],
    accepted: ['Accepted', 'مقبول', 'positive'],
    offered: ['Review offer', 'عرض تقييم', 'attention'],
    expired: ['Expired', 'منتهٍ', 'closed'],
    revoked: ['Revoked', 'ملغى', 'closed'],
    pending: ['Pending', 'قيد الانتظار', 'attention'],
    rejected: ['Retained internally', 'محفوظ داخليًا', 'closed'],
    completed: ['Completed', 'مكتمل', 'closed'],
    declined: ['Declined', 'مرفوض', 'closed'],
    cancelled: ['Cancelled', 'ملغى', 'closed'],
    terminated: ['Closed', 'مغلق', 'closed'],
    reapproval: ['Needs approval', 'يتطلب موافقة', 'attention'],
    unavailable: ['Unavailable', 'غير متاح', 'closed'],
  };
  const value = labels[status] ?? [
    'Status unavailable',
    'الحالة غير متاحة',
    'closed',
  ];
  return {
    label: value[locale === 'ar' ? 1 : 0],
    tone: value[2] as StatusTone,
  };
}
