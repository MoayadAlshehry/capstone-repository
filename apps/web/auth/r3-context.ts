// Client-safe projection input; database/account session types stay in the server adapter.
import { sharedIntent } from './return-policy/shared.ts';
import {
  filters as universityFilters,
  safeFrom as universityFrom,
  uuid as universityUuid,
} from './return-policy/university.ts';
import {
  filterValues as platformFilters,
  safeFrom as platformFrom,
  uuid as platformUuid,
} from './return-policy/platform.ts';
export interface ContextPrincipal {
  id: string;
  name: string;
  email: string;
  role: string;
  university: string | null;
  universityAr: string | null;
  department: string | null;
  status: string;
  locale: 'en' | 'ar';
  partnerStatus: string | null;
}
export type ContextId =
  | 'author'
  | 'supervision'
  | 'independent'
  | 'university'
  | 'platform'
  | 'partner';
export interface ContextEntry {
  id: ContextId;
  path: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}
export function permittedContexts(
  role: string,
  capable: boolean,
): ContextEntry[] {
  const rows: Record<string, ContextEntry> = {
    student: {
      id: 'author',
      path: '/projects',
      titleEn: 'Project author',
      titleAr: 'مؤلف المشاريع',
      descriptionEn: 'Prepare and follow your assigned project editions.',
      descriptionAr: 'أعد إصدارات مشاريعك المكلّف بها وتابعها.',
    },
    faculty_supervisor: {
      id: 'supervision',
      path: '/reviews',
      titleEn: 'Supervision',
      titleAr: 'الإشراف',
      descriptionEn: 'Read the work and review your assigned submissions.',
      descriptionAr: 'اقرأ العمل وراجع التسليمات المكلّف بها.',
    },
    university_admin: {
      id: 'university',
      path: '/admin/university',
      titleEn: 'University administration',
      titleAr: 'إدارة الجامعة',
      descriptionEn: 'Manage people and projects within your university.',
      descriptionAr: 'أدر الأشخاص والمشاريع ضمن جامعتك.',
    },
    platform_admin: {
      id: 'platform',
      path: '/admin/platform',
      titleEn: 'Platform governance',
      titleAr: 'حوكمة المنصة',
      descriptionEn: 'Manage institutions and permitted governance decisions.',
      descriptionAr: 'أدر المؤسسات وقرارات الحوكمة المسموحة.',
    },
    partner: {
      id: 'partner',
      path: '/partner',
      titleEn: 'Partner workspace',
      titleAr: 'مساحة الشريك',
      descriptionEn:
        'Follow your eligibility, exact-edition requests and grants.',
      descriptionAr: 'تابع أهليتك وطلبات الإصدارات المحددة والأذونات.',
    },
  };
  const base = rows[role];
  if (!base) return [];
  return [
    base,
    ...(role === 'faculty_supervisor' && capable
      ? [
          {
            id: 'independent' as const,
            path: '/reviewer',
            titleEn: 'Independent review',
            titleAr: 'التقييم المستقل',
            descriptionEn:
              'Your own offers and accepted academic review tasks.',
            descriptionAr: 'عروضك ومهام التقييم الأكاديمي المقبولة الخاصة بك.',
          },
        ]
      : []),
  ];
}
export interface OwnAccountView {
  id: string;
  name: string;
  email: string;
  role: string;
  universityEn: string | null;
  universityAr: string | null;
  department: string | null;
  status: string;
  preferredLocale: 'en' | 'ar';
  partnerStatus: string | null;
  reviewerStatus: string | null;
  reviewerCapable: boolean;
  canLead: boolean;
  contexts: ContextEntry[];
}
export function ownAccountView(
  a: ContextPrincipal,
  capable: boolean,
  reviewerStatus: string | null,
  canLead: boolean,
): OwnAccountView {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    universityEn: a.university,
    universityAr: a.universityAr,
    department: a.department,
    status: a.status,
    preferredLocale: a.locale,
    partnerStatus: a.partnerStatus,
    reviewerStatus,
    reviewerCapable: capable,
    canLead,
    contexts: permittedContexts(a.role, capable),
  };
}
export function parsedIntent(value: unknown): URL | null {
  if (
    typeof value !== 'string' ||
    value.length > 20000 ||
    !/^\/(en|ar)\//.test(value) ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return null;
  try {
    const u = new URL(value, 'http://context-return.invalid');
    if (u.origin !== 'http://context-return.invalid' || u.hash) return null;
    if (u.search) {
      const path = u.pathname.replace(/^\/(en|ar)/, '');
      if (sharedIntent(path, u.searchParams)) return u;
      if (
        /^\/admin\/platform(?:\/(?:institutions|new|drafts|partners(?:\/[0-9a-f-]{36})?|reviewers(?:\/[0-9a-f-]{36})?|[0-9a-f-]{36}))?$/i.test(
          path,
        )
      ) {
        platformFilters(u.searchParams);
        for (const [k, v] of u.searchParams) {
          if (
            u.searchParams.getAll(k).length !== 1 ||
            !['q', 'status', 'page', 'from', 'account'].includes(k)
          )
            return null;
          if (k === 'account' && !platformUuid.test(v)) return null;
          if (
            k === 'from' &&
            platformFrom(v, 'en') !== v.replace(/^\/(en|ar)/, '/en')
          )
            return null;
        }
        return u;
      }
      if (
        /^\/admin\/university(?:\/(people(?:\/new)?|import|departments|archive|assignments(?:\/(?:new|[0-9a-f-]{36}))?|records\/[0-9a-f-]{36}|[0-9a-f-]{36}))?$/i.test(
          path,
        )
      ) {
        universityFilters(u.searchParams);
        for (const [key, v] of u.searchParams) {
          if (
            u.searchParams.getAll(key).length !== 1 ||
            ![
              'q',
              'status',
              'role',
              'page',
              'from',
              'group',
              'version',
              'submission',
              'file',
              'operation',
            ].includes(key)
          )
            return null;
          if (
            ['group', 'version', 'submission', 'file'].includes(key) &&
            !universityUuid.test(v)
          )
            return null;
          if (
            key === 'operation' &&
            !['create', 'authors', 'lead', 'supervisor'].includes(v)
          )
            return null;
          if (
            key === 'from' &&
            (!/^\/(en|ar)\/admin\/university(?:\/|\?|$)/.test(v) ||
              (universityFrom(v, 'en') === '/en/admin/university/people' &&
                v.replace(/^\/(en|ar)/, '/en') !==
                  '/en/admin/university/people'))
          )
            return null;
        }
        return u;
      }
      if (
        [
          '/partner',
          '/partner/access',
          '/partner/grants',
          '/partner/eligibility',
          '/partner/request',
        ].includes(path) ||
        /^\/partner\/grants\/[0-9a-f-]{36}$/i.test(path)
      ) {
        const keys =
          path === '/partner/request'
            ? ['project', 'version', 'from']
            : path.startsWith('/partner/grants/')
              ? ['file', 'from']
              : [
                  'request',
                  'from',
                  ...(path === '/partner/access'
                    ? ['filter', 'tab', 'q', 'status', 'page', 'project']
                    : []),
                ];
        for (const [key, value] of u.searchParams) {
          if (
            !keys.includes(key) ||
            u.searchParams.getAll(key).length !== 1 ||
            (key === 'from'
              ? !/^\/(en|ar)\/(catalogue|partner)(?:\/|\?|$)/.test(value) ||
                /[\\\u0000-\u001f\u007f]/.test(value)
              : key === 'tab'
                ? !['active', 'pending', 'history'].includes(value)
                : key === 'q'
                  ? value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)
                  : key === 'status'
                    ? ![
                        'all',
                        'active',
                        'pending',
                        'awaiting_lead',
                        'approved',
                        'revoked',
                        'expired',
                        'paused',
                        'denied',
                        'cancelled',
                        'unavailable',
                      ].includes(value)
                    : key === 'page'
                      ? !/^[1-9]\d*$/.test(value) ||
                        !Number.isSafeInteger(Number(value))
                      : key === 'project'
                        ? !universityUuid.test(value)
                        : key === 'filter'
                          ? ![
                              'all',
                              'pending',
                              'approved',
                              'denied',
                              'cancelled',
                            ].includes(value)
                          : !/^[0-9a-f-]{36}$/i.test(value))
          )
            return null;
        }
        return u;
      }
      if (path === '/reviewer') {
        return u.searchParams.size === 1 &&
          u.searchParams.getAll('tab').length === 1 &&
          ['offers', 'active', 'history'].includes(
            u.searchParams.get('tab') ?? '',
          )
          ? u
          : null;
      }
      if (/^\/reviewer\/tasks\/[0-9a-f-]{36}$/i.test(path)) {
        for (const [key, value] of u.searchParams) {
          if (
            u.searchParams.getAll(key).length !== 1 ||
            (key === 'criterion'
              ? !/^[1-4]$/.test(value)
              : key !== 'file' || !/^[0-9a-f-]{36}$/i.test(value))
          )
            return null;
        }
        return u;
      }
      if (path === '/reviews') {
        for (const [key, value] of u.searchParams) {
          if (
            u.searchParams.getAll(key).length !== 1 ||
            (key === 'q'
              ? value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)
              : key !== 'filter' ||
                ![
                  'attention',
                  'all',
                  'supervisor',
                  'committee',
                  'decision',
                  'draft',
                  'revision_required',
                  'archived',
                  'rejected',
                ].includes(value))
          )
            return null;
        }
        return u;
      }
      if (
        /^\/supervision\/(rounds\/[0-9a-f-]{36}(?:\/(assessment|committee|decision))?|projects\/[0-9a-f-]{36}(?:\/files)?)$/i.test(
          path,
        )
      ) {
        for (const [key, value] of u.searchParams) {
          if (
            u.searchParams.getAll(key).length !== 1 ||
            ![
              'file',
              'criterion',
              'version',
              'submission',
              'directory',
            ].includes(key)
          )
            return null;
          if (
            key === 'criterion'
              ? !/^[1-7]$/.test(value)
              : key === 'directory'
                ? !value ||
                  /[\\\u0000-\u001f\u007f]/.test(value) ||
                  value.split('/').some((x) => !x || x === '.' || x === '..')
                : !/^[0-9a-f-]{36}$/i.test(value)
          )
            return null;
        }
        return u;
      }
      if (
        /^\/projects\/[0-9a-f-]{36}\/(files|sharing(?:\/(license|requests))?|packets)$/i.test(
          path,
        )
      ) {
        for (const [key, value] of u.searchParams) {
          if (
            !['version', 'submission', 'file', 'directory', 'request'].includes(
              key,
            ) ||
            u.searchParams.getAll(key).length !== 1
          )
            return null;
          if (
            key === 'directory'
              ? !value ||
                /[\\\u0000-\u001f\u007f]/.test(value) ||
                value.split('/').some((x) => !x || x === '.' || x === '..')
              : !/^[0-9a-f-]{36}$/i.test(value)
          )
            return null;
        }
        return u;
      }
      if (
        path !== '/account' ||
        u.searchParams.size !== 1 ||
        u.searchParams.getAll('from').length !== 1
      )
        return null;
      const from = u.searchParams.get('from')!;
      if (!/^\/(en|ar)\/[A-Za-z0-9_/-]+$/.test(from) || from.includes('//'))
        return null;
    }
    return u;
  } catch {
    return null;
  }
}
export function allowedOwnReturn(
  value: unknown,
  view: Pick<OwnAccountView, 'role' | 'contexts' | 'canLead'>,
  locale: 'en' | 'ar',
): string | null {
  const u = parsedIntent(value);
  if (!u) return null;
  const path = u.pathname.replace(/^\/(en|ar)/, '');
  if (
    path === '/audit' &&
    ['faculty_supervisor', 'university_admin', 'platform_admin'].includes(
      view.role,
    )
  )
    return '/' + locale + path + u.search;
  if (
    path === '/evaluation/allocation' &&
    ['university_admin', 'platform_admin'].includes(view.role)
  )
    return '/' + locale + path + u.search;
  if (path === '/notifications') return '/' + locale + path + u.search;
  if (path === '/reviewer/profile' && view.role === 'faculty_supervisor')
    return '/' + locale + path + u.search;
  if (
    path === '/evaluation/issues' &&
    ['platform_admin', 'university_admin', 'faculty_supervisor'].includes(
      view.role,
    )
  )
    return '/' + locale + path + u.search;
  if (
    view.role === 'platform_admin' &&
    [
      '/admin/platform',
      '/admin/platform/institutions',
      '/admin/platform/new',
      '/admin/platform/drafts',
      '/admin/platform/partners',
      '/admin/platform/reviewers',
    ].includes(path)
  )
    return '/' + locale + path + u.search;
  if (
    view.role === 'university_admin' &&
    [
      '/admin/university',
      '/admin/university/people',
      '/admin/university/people/new',
      '/admin/university/import',
      '/admin/university/departments',
      '/admin/university/assignments',
      '/admin/university/archive',
    ].includes(path)
  )
    return '/' + locale + path + u.search;
  if (
    view.role === 'partner' &&
    [
      '/partner',
      '/partner/access',
      '/partner/grants',
      '/partner/eligibility',
    ].includes(path)
  )
    return '/' + locale + path + u.search;
  if (path === '/reviewer' && view.contexts.some((c) => c.id === 'independent'))
    return '/' + locale + path + u.search;
  if (path === '/reviews' && view.role === 'faculty_supervisor')
    return '/' + locale + path + u.search;
  if (u.search && path === '/account') {
    const from = allowedOwnReturn(u.searchParams.get('from'), view, locale);
    return (
      '/' +
      locale +
      '/account' +
      (from ? '?from=' + encodeURIComponent(from) : '')
    );
  }
  const common = ['/account', '/workspace', '/notifications'];
  const scoped: Record<string, string[]> = {
    student: ['/projects', ...(view.canLead ? ['/access/lead'] : [])],
    faculty_supervisor: [
      '/projects',
      '/reviews',
      '/reviewer/profile',
      ...(view.contexts.some((c) => c.id === 'independent')
        ? ['/reviewer']
        : []),
    ],
    university_admin: [
      '/admin/university',
      '/projects',
      '/admin/access',
      '/evaluation/allocation',
      '/audit',
    ],
    platform_admin: [
      '/admin/platform',
      '/admin/platform/institutions',
      '/admin/platform/new',
      '/admin/platform/drafts',
      '/admin/platform/partners',
      '/admin/platform/reviewers',
      '/admin/access',
      '/evaluation/allocation',
      '/audit',
    ],
    partner: [
      '/partner',
      '/partner/access',
      '/partner/grants',
      '/partner/eligibility',
    ],
  };
  return [...common, ...(scoped[view.role] ?? [])].includes(path)
    ? '/' + locale + path
    : null;
}
