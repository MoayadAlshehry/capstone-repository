import { landing, type WorkspaceIdentity } from './navigation.ts';
export interface RouteScope {
  slice: string;
  title: readonly [string, string];
  roles: readonly string[];
  landing?: 'universities' | 'projects' | 'partner' | 'reviewer';
}
const admins = ['platform_admin', 'university_admin'];
export function routeScope(path: string): RouteScope | null {
  if (/^\/projects\/[a-f0-9-]{36}\/final$/.test(path))
    return {
      slice: 'R06',
      title: ['Final submission', 'الإرسال النهائي'],
      roles: ['student'],
    };
  if (
    /^\/supervision\/finals\/[a-f0-9-]{36}\/(screening|assessment|committee|decision)$/.test(
      path,
    )
  )
    return {
      slice: 'R06',
      title: path.endsWith('/screening')
        ? ['Final screening', 'فحص الإرسال النهائي']
        : path.endsWith('/assessment')
          ? ['Supervisor assessment', 'تقييم المشرف']
          : path.endsWith('/committee')
            ? ['Committee assessments', 'تقييمات اللجنة']
            : ['Publication decision', 'قرار النشر'],
      roles: ['faculty_supervisor'],
    };
  if (path === '/admin/university/committee-assessments')
    return {
      slice: 'R06',
      title: ['Committee assessments', 'تقييمات اللجنة'],
      roles: ['university_admin'],
    };
  const semesterTask = path.match(
    /^\/(projects|supervision\/projects)\/[a-f0-9-]{36}\/(files|reviews|team|edit)$/,
  );
  if (semesterTask) {
    const task = semesterTask[2]!;
    return {
      slice: 'R05',
      roles:
        semesterTask[1] === 'projects' ? ['student'] : ['faculty_supervisor'],
      title:
        task === 'files'
          ? ['Files', 'الملفات']
          : task === 'reviews'
            ? ['Reviews', 'المراجعات']
            : task === 'team'
              ? ['Team', 'الفريق']
              : ['Project details', 'تفاصيل المشروع'],
    };
  }
  if (/^\/supervision\/rounds\/[a-f0-9-]{36}$/.test(path))
    return {
      slice: 'R05',
      roles: ['faculty_supervisor'],
      title: ['Checkpoint review', 'مراجعة نقطة المراجعة'],
    };
  if (/^\/submissions\/[a-f0-9-]{36}$/.test(path))
    return {
      slice: 'R05',
      roles: ['student', 'faculty_supervisor', 'university_admin'],
      title: ['Saved review record', 'سجل المراجعة المحفوظ'],
    };
  if (
    /^\/admin\/platform\/[a-f0-9-]{36}\/(?:invite-administrator|administrators\/[a-f0-9-]{36}\/account-access)$/.test(
      path,
    )
  )
    return {
      slice: 'R03',
      title: path.endsWith('/account-access')
        ? ['Administrator account access', 'وصول حساب المدير']
        : ['Invite administrator', 'دعوة المدير'],
      roles: ['platform_admin'],
    };
  if (
    /^\/admin\/platform\/approvals\/(partners|reviewers)\/[a-f0-9-]{36}$/.test(
      path,
    )
  )
    return {
      slice: 'R03',
      title: ['Approval record', 'سجل الموافقة'],
      roles: ['platform_admin'],
    };
  if (/^\/admin\/university\/people\/[a-f0-9-]{36}$/.test(path))
    return {
      slice: 'R03',
      title: ['Person record', 'سجل الشخص'],
      roles: ['university_admin'],
    };
  if (path === '/admin/university/projects/new')
    return {
      slice: 'R04',
      title: ['New project', 'مشروع جديد'],
      roles: ['university_admin'],
    };
  if (/^\/admin\/university\/projects\/created\/[a-f0-9-]{36}$/.test(path))
    return {
      slice: 'R04',
      title: ['Project created', 'أُنشئ المشروع'],
      roles: ['university_admin'],
    };
  if (/^\/admin\/university\/projects\/[a-f0-9-]{36}$/.test(path))
    return {
      slice: 'R04',
      title: ['Project team', 'فريق المشروع'],
      roles: ['university_admin'],
    };
  if (/^\/projects\/[a-f0-9-]{36}$/.test(path))
    return {
      slice: 'R05',
      title: ['Project studio', 'استوديو المشروع'],
      roles: ['student'],
    };
  if (/^\/supervision\/projects\/[a-f0-9-]{36}$/.test(path))
    return {
      slice: 'R05',
      title: ['Project studio', 'استوديو المشروع'],
      roles: ['faculty_supervisor'],
    };
  if (path === '/admin/platform/new')
    return {
      slice: 'R03',
      title: ['Add university', 'إضافة جامعة'],
      roles: ['platform_admin'],
    };
  if (path === '/admin/university/people/new')
    return {
      slice: 'R03',
      title: ['Invite person', 'دعوة شخص'],
      roles: ['university_admin'],
    };
  if (path === '/admin/platform/approvals')
    return {
      slice: 'R03',
      title: ['Approvals', 'الموافقات'],
      roles: ['platform_admin'],
    };
  if (path === '/account/security')
    return {
      slice: 'R02',
      title: ['Account security', 'أمان الحساب'],
      roles: ['student', 'faculty_supervisor', 'partner', ...admins],
    };
  if (/^\/admin\/university\/people\/[a-f0-9-]{36}\/account-access$/.test(path))
    return {
      slice: 'R02',
      title: ['Account access', 'وصول الحساب'],
      roles: ['university_admin'],
    };
  if (
    path === '/workspace' ||
    path === '/account' ||
    /^\/notifications(?:\/[0-9a-f-]{36})?$/.test(path)
  )
    return {
      slice: path === '/account' ? 'R02' : 'R08',
      title:
        path === '/account' ? ['Your account', 'حسابك'] : ['Inbox', 'الوارد'],
      roles: ['student', 'faculty_supervisor', 'partner', ...admins],
    };
  if (path === '/admin/university/departments') return null;
  if (
    /^\/admin\/platform(?:\/(?:institutions|overview|approvals|new|drafts|partners(?:\/[0-9a-f-]{36})?|reviewers(?:\/[0-9a-f-]{36})?|[0-9a-f-]{36}))?$/.test(
      path,
    )
  )
    return {
      slice: /approvals|partners|reviewers|drafts/.test(path) ? 'R08' : 'R03',
      title: path.endsWith('/overview')
        ? ['Overview', 'نظرة عامة']
        : path.endsWith('/approvals')
          ? ['Approvals', 'الموافقات']
          : path.endsWith('/drafts')
            ? ['Reasoned metadata access', 'الوصول المسبب للبيانات الوصفية']
            : ['Universities', 'الجامعات'],
      roles: ['platform_admin'],
      ...(['/admin/platform', '/admin/platform/institutions'].includes(path)
        ? { landing: 'universities' as const }
        : {}),
    };
  if (
    /^\/admin\/university(?:\/(?:people(?:\/new)?|archive|assignments(?:\/(?:new|[0-9a-f-]{36}))?|records\/[0-9a-f-]{36}|[0-9a-f-]{36}))?$/.test(
      path,
    )
  )
    return {
      slice: path.includes('people') ? 'R03' : 'R04',
      title: path.includes('people')
        ? ['People', 'الأشخاص']
        : path.endsWith('/archive')
          ? ['Archive', 'الأرشيف']
          : ['Projects', 'المشاريع'],
      roles: ['university_admin'],
      ...(path === '/admin/university' ? { landing: 'projects' as const } : {}),
    };
  if (
    /^\/projects(?:\/[0-9a-f-]{36}(?:\/(?:edit|review|reviews|team|history|files|packets|sharing(?:\/requests)?))?)?$/.test(
      path,
    )
  )
    return {
      slice: /packets|sharing/.test(path) ? 'R08' : 'R05',
      title: ['My projects', 'مشاريعي'],
      roles: ['student'],
      ...(path === '/projects' ? { landing: 'projects' as const } : {}),
    };
  if (
    /^\/supervision(?:\/projects\/[0-9a-f-]{36}(?:\/(?:files|reviews|team))?|\/rounds\/[0-9a-f-]{36}(?:\/(?:assessment|committee|decision))?)?$/.test(
      path,
    ) ||
    path === '/reviews'
  )
    return {
      slice: /assessment|committee|decision/.test(path) ? 'R06' : 'R05',
      title:
        path === '/reviews'
          ? ['Needs review', 'تحتاج مراجعة']
          : ['Projects', 'المشاريع'],
      roles: ['faculty_supervisor'],
      ...(path === '/supervision' ? { landing: 'projects' as const } : {}),
    };
  if (/^\/reviewer(?:\/(?:history|profile|tasks\/[0-9a-f-]{36}))?$/.test(path))
    return {
      slice: 'R07',
      title: path.endsWith('/profile')
        ? ['Reviewer profile', 'ملف المقيّم']
        : ['Review tasks', 'مهام التقييم'],
      roles: ['faculty_supervisor'],
      ...(path === '/reviewer' ? { landing: 'reviewer' as const } : {}),
    };
  if (
    /^\/partner(?:\/(?:access|eligibility|request|grants(?:\/[0-9a-f-]{36})?))?$/.test(
      path,
    )
  )
    return {
      slice: 'R08',
      title:
        path === '/partner/access'
          ? ['Project access', 'الوصول إلى المشاريع']
          : path === '/partner/eligibility'
            ? ['Organization & eligibility', 'المؤسسة والأهلية']
            : ['Partner workspace', 'مساحة الشريك'],
      roles: ['partner'],
      ...(path === '/partner' ? { landing: 'partner' as const } : {}),
    };
  if (
    /^\/evaluation\/(?:allocation|issues|corrections\/[0-9a-f-]{36}|feedback\/[0-9a-f-]{36})$/.test(
      path,
    )
  )
    return {
      slice: 'R08',
      title:
        path === '/evaluation/issues'
          ? ['Evaluation matters', 'مسائل التقييم']
          : path.startsWith('/evaluation/corrections/')
            ? ['Assessment amendment', 'تعديل التقييم']
            : path.startsWith('/evaluation/feedback/')
              ? ['Academic feedback', 'الملاحظات الأكاديمية']
              : ['Review allocation', 'توزيع التقييمات'],
      roles: path.includes('feedback')
        ? ['student', 'faculty_supervisor']
        : path.includes('corrections')
          ? ['faculty_supervisor']
          : path === '/evaluation/issues'
            ? [...admins, 'faculty_supervisor']
            : ['university_admin'],
    };
  if (path === '/audit' || path === '/admin/access')
    return {
      slice: 'R08',
      title:
        path === '/audit'
          ? ['Scoped audit', 'التدقيق المحدد']
          : ['Access protection', 'حماية الوصول'],
      roles: path === '/audit' ? [...admins, 'faculty_supervisor'] : admins,
    };
  if (
    /^\/(?:access\/lead|project-records(?:\/[0-9a-f-]{36}(?:\/(?:files|sharing|packets))?)?|submissions\/[0-9a-f-]{36})$/.test(
      path,
    )
  )
    return {
      slice: 'R08',
      title: ['Project workspace', 'مساحة المشروع'],
      roles: ['student', 'faculty_supervisor', 'university_admin'],
    };
  return null;
}
export function roleLanding(a: WorkspaceIdentity) {
  return landing[a.role] ?? '/account';
}
export function collectionReturn(
  value: unknown,
  a: WorkspaceIdentity,
  locale: 'en' | 'ar',
) {
  const fallback = '/' + locale + roleLanding(a);
  if (
    typeof value !== 'string' ||
    value.length > 1200 ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    const u = new URL(value, 'http://workspace-return.invalid');
    if (
      u.origin !== 'http://workspace-return.invalid' ||
      u.hash ||
      ![
        '/' + locale + roleLanding(a),
        ...(a.role === 'faculty_supervisor' && a.reviewerCapable
          ? ['/' + locale + '/reviewer']
          : []),
      ].includes(u.pathname)
    )
      return fallback;
    if (
      [...u.searchParams].some(
        ([key, v]) =>
          !['q', 'page', 'status', 'selected'].includes(key) ||
          u.searchParams.getAll(key).length !== 1 ||
          (key === 'q' && v.length > 200) ||
          (key === 'selected' && !/^[a-f0-9-]{36}$/.test(v)) ||
          (key === 'status' && !/^[a-z_]{1,40}$/.test(v)) ||
          (key === 'page' && !/^[1-9]\d{0,4}$/.test(v)),
      )
    )
      return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}
