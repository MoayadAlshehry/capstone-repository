export type Locale = 'en' | 'ar';
export interface WorkspaceIdentity {
  id: string;
  name: string;
  email: string;
  role: string;
  universityEn: string | null;
  universityAr: string | null;
  reviewerCapable: boolean;
}
export type NavEntry = { path: string; label: readonly [string, string] };
export const landing: Record<string, string> = {
  platform_admin: '/admin/platform',
  university_admin: '/admin/university',
  student: '/projects',
  faculty_supervisor: '/supervision',
  partner: '/partner',
};
export function navigation(
  a: WorkspaceIdentity,
  independent = false,
): NavEntry[] {
  const roles: Record<string, NavEntry[]> = {
    platform_admin: [
      { path: '/admin/platform', label: ['Universities', 'الجامعات'] },
      { path: '/admin/platform/approvals', label: ['Approvals', 'الموافقات'] },
      { path: '/admin/platform/overview', label: ['Overview', 'نظرة عامة'] },
    ],
    university_admin: [
      { path: '/admin/university', label: ['Projects', 'المشاريع'] },
      { path: '/admin/university/people', label: ['People', 'الأشخاص'] },
      { path: '/admin/university/archive', label: ['Archive', 'الأرشيف'] },
      {
        path: '/admin/university/committee-assessments',
        label: ['Committee assessments', 'تقييمات اللجنة'],
      },
    ],
    student: [{ path: '/projects', label: ['My projects', 'مشاريعي'] }],
    faculty_supervisor: [
      { path: '/supervision', label: ['Projects', 'المشاريع'] },
      { path: '/reviews', label: ['Needs review', 'تحتاج مراجعة'] },
    ],
    partner: [
      { path: '/partner', label: ['Overview', 'نظرة عامة'] },
      {
        path: '/partner/access',
        label: ['Project access', 'الوصول إلى المشاريع'],
      },
      { path: '/catalogue', label: ['Discover', 'استكشف'] },
    ],
  };
  const items =
    independent && a.role === 'faculty_supervisor' && a.reviewerCapable
      ? [
          {
            path: '/reviewer',
            label: ['Review tasks', 'مهام التقييم'] as const,
          },
          {
            path: '/reviewer?tab=history',
            label: ['History', 'السجل'] as const,
          },
          { path: '/account', label: ['Account', 'الحساب'] as const },
        ]
      : (roles[a.role] ?? []);
  return [...items, { path: '/notifications', label: ['Inbox', 'الوارد'] }];
}
export function text(label: readonly [string, string], locale: Locale) {
  return label[locale === 'ar' ? 1 : 0];
}
