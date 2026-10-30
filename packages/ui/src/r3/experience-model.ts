const keys = new Set([
  'q',
  'page',
  'pageSize',
  'filter',
  'status',
  'role',
  'university',
  'department',
  'academicYear',
  'domain',
  'author',
  'supervisor',
  'version',
  'submission',
  'file',
  'directory',
  'request',
  'case',
  'run',
  'event',
  'actor',
  'project',
  'action',
  'from',
  'to',
  'before',
  'beforeId',
  'unread',
  'operation',
  'group',
  'account',
  'criterion',
  'tab',
]);
export function safeOrigin(value: string, locale: 'en' | 'ar'): string | null {
  if (
    value.length > 4000 ||
    !/^\/(en|ar)(?:\/|$)/.test(value) ||
    /[\u0000-\u001f\u007f\\]/.test(value)
  )
    return null;
  const u = new URL(value, 'http://context.invalid');
  if (
    !/^\/(en|ar)(?:\/|$)/.test(u.pathname) ||
    /^\/(en|ar)\/(login|activate|reset-password|partner\/register)(?:\/|$)/.test(
      u.pathname,
    )
  )
    return null;
  for (const key of Array.from(u.searchParams.keys()))
    if (!keys.has(key) || key === 'from') u.searchParams.delete(key);
  u.pathname = u.pathname.replace(/^\/(en|ar)(?=\/|$)/, '/' + locale);
  return u.pathname + u.search;
}
export function returnLabel(href: string): readonly [string, string] {
  const path = href.split('?')[0]!.replace(/^\/(en|ar)(?=\/|$)/, '');
  const labels: readonly [RegExp, readonly [string, string]][] = [
    [/^\/notifications(?:\/|$)/, ['Back to Inbox', 'العودة إلى الوارد']],
    [/^\/catalogue\//, ['Back to project', 'العودة إلى المشروع']],
    [/^\/catalogue\/?$/, ['Back to discovery', 'العودة إلى الاستكشاف']],
    [
      /^\/reviewer(?:\/|$)/,
      ['Back to my review tasks', 'العودة إلى مهام التقييم'],
    ],
    [
      /^\/reviews\/?$/,
      ['Back to supervision tasks', 'العودة إلى مهام الإشراف'],
    ],
    [
      /^\/partner\/request/,
      ['Back to access request', 'العودة إلى طلب الوصول'],
    ],
    [
      /^\/partner\/access/,
      ['Back to request history', 'العودة إلى سجل الطلبات'],
    ],
    [
      /^\/partner\/grants/,
      ['Back to Granted projects', 'العودة إلى المشاريع المسموح بها'],
    ],
    [/^\/partner\/?$/, ['Back to partner overview', 'العودة إلى نظرة الشريك']],
    [/\/history$/, ['Back to edition history', 'العودة إلى سجل الإصدارات']],
    [/\/sharing$/, ['Back to Sharing', 'العودة إلى المشاركة']],
    [/\/review$/, ['Back to project Review', 'العودة إلى مراجعة المشروع']],
  ];
  return (
    labels.find(([pattern]) => pattern.test(path))?.[1] ?? [
      'Back to workspace',
      'العودة إلى مساحة العمل',
    ]
  );
}
export function plainActivation(e: {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}) {
  return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
}
