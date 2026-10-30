import {
  uuid,
  stamp,
  validAuditFilters,
  noticeMessage,
  type Notice,
} from '@capstone/domain/notification-types';
export function noticeSubject(n: Notice, locale: 'en' | 'ar') {
  if (n.type === 'workflow.updated' && n.link.kind === 'evaluation-feedback')
    return locale === 'ar'
      ? 'تم تحديث تعليقات تقييم مشروعك.'
      : 'Project assessment feedback was updated.';
  if (n.type === 'workflow.updated' && n.link.kind === 'evaluation-governance')
    return locale === 'ar'
      ? 'يوجد تحديث لمسألة تعديل أو حوكمة التقييم.'
      : 'An assessment amendment or governance matter was updated.';
  const message = noticeMessage(n.type, locale);
  if (n.type === 'submission.created')
    return locale === 'ar'
      ? 'تم تسجيل تسليم مشروع للمراجعة.'
      : 'A project submission was recorded for review.';
  return message;
}
export type SharedScreen =
  | 'inbox'
  | 'audit'
  | 'allocation'
  | 'issues'
  | 'correction'
  | 'feedback'
  | 'profile';
export type Query = Record<string, string>;
export function sharedQuery(
  screen: SharedScreen,
  value: Record<string, string | string[] | undefined>,
): Query {
  const q: Query = {};
  for (const [k, v] of Object.entries(value)) {
    if (
      typeof v !== 'string' ||
      v.length > (k === 'returnTo' ? 1800 : 400) ||
      /[\u0000-\u001f\u007f]/.test(v)
    )
      throw Error('INVALID_QUERY');
    q[k] = v;
  }
  const keys: Record<SharedScreen, string[]> = {
    inbox: ['unread', 'before', 'beforeId', 'context', 'page'],
    audit: [
      'actor',
      'action',
      'project',
      'from',
      'to',
      'before',
      'beforeId',
      'event',
    ],
    allocation: ['case', 'run'],
    issues: ['case', 'issue', 'command', 'task'],
    correction: ['command', 'task'],
    feedback: ['from'],
    profile: ['from', 'context', 'returnTo'],
  };
  if (Object.keys(q).some((k) => !keys[screen].includes(k)))
    throw Error('INVALID_QUERY');
  for (const [k, v] of Object.entries(q))
    if (
      [
        'case',
        'issue',
        'command',
        'run',
        'event',
        'actor',
        'project',
        'beforeId',
      ].includes(k) &&
      !uuid(v)
    )
      throw Error('INVALID_QUERY');
  if (q.unread && !['true', 'false'].includes(q.unread))
    throw Error('INVALID_QUERY');
  if (
    q.context &&
    !(
      screen === 'profile'
        ? ['supervision', 'independent', 'personal']
        : ['supervision', 'independent']
    ).includes(q.context)
  )
    throw Error('INVALID_QUERY');
  if (
    q.returnTo &&
    (!/^\/(en|ar)\//.test(q.returnTo) ||
      /[\\\u0000-\u001f\u007f#]/.test(q.returnTo))
  )
    throw Error('INVALID_QUERY');
  if (q.page && !/^[1-9]\d{0,3}$/.test(q.page)) throw Error('INVALID_QUERY');
  if (q.case && q.issue) throw Error('INVALID_QUERY');
  if (
    Boolean(q.command) !== Boolean(q.task) ||
    (q.task &&
      !/^(?:correction\.[a-f0-9-]{36}|admin\.(?:[a-f0-9-]{36}|collection))$/i.test(
        q.task,
      ))
  )
    throw Error('INVALID_QUERY');
  if (
    Boolean(q.before) !== Boolean(q.beforeId) ||
    (q.before && !stamp(q.before))
  )
    throw Error('INVALID_QUERY');
  if (
    q.from &&
    !(
      (screen === 'feedback' &&
        (/^\/(en|ar)\/projects\/[0-9a-f-]{36}\/(review|reviews)$/.test(
          q.from,
        ) ||
          /^\/(en|ar)\/submissions\/[0-9a-f-]{36}$/.test(q.from))) ||
      (screen === 'profile' && /^\/(en|ar)\/(reviews|reviewer)$/.test(q.from))
    )
  )
    throw Error('INVALID_QUERY');
  if (screen === 'audit') {
    const f = { ...q };
    delete f.event;
    if (!validAuditFilters(f)) throw Error('INVALID_QUERY');
  }
  return q;
}
export function auditRequest(q: Query): Query {
  const f = { ...q };
  delete f.event;
  return Object.fromEntries(
    Object.entries(f).map(([k, v]) => [
      k,
      (k === 'from' || k === 'to') && v.length === 10
        ? v + (k === 'from' ? 'T00:00:00Z' : 'T23:59:59.999999Z')
        : v,
    ]),
  );
}
export function sharedIntent(path: string, params: URLSearchParams): boolean {
  const match = path.match(
    /^\/(notifications|audit|evaluation\/(allocation|issues|corrections\/([0-9a-f-]{36})|feedback\/([0-9a-f-]{36}))|reviewer\/profile)$/i,
  );
  if (!match) return false;
  const screen: SharedScreen =
    path === '/notifications'
      ? 'inbox'
      : path === '/audit'
        ? 'audit'
        : path === '/reviewer/profile'
          ? 'profile'
          : path.includes('/corrections/')
            ? 'correction'
            : path.includes('/feedback/')
              ? 'feedback'
              : path.endsWith('/allocation')
                ? 'allocation'
                : 'issues';
  if ((match[3] && !uuid(match[3])) || (match[4] && !uuid(match[4])))
    return false;
  try {
    if ([...params.keys()].some((k) => params.getAll(k).length !== 1))
      return false;
    sharedQuery(screen, Object.fromEntries(params));
    return true;
  } catch {
    return false;
  }
}
export function resolutionChoices(
  type: string,
  state: string,
  issueState: string,
): string[] {
  if (state !== 'open') return [];
  return [
    ...(issueState === 'corrected' ? ['original_evaluator_amendment'] : []),
    ...(issueState === 'invalidated' ? ['confirmed_invalidation'] : []),
    ...(issueState === 'explained' ? ['institutional_explanation'] : []),

    ...(type === 'evidence_integrity' ? ['verified_evidence_restoration'] : []),
    ...(type === 'access_integrity' ? ['verified_access_restoration'] : []),
  ];
}
