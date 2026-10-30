import type { Locale, WorkspaceIdentity } from './navigation.ts';
import { landing } from './navigation.ts';
import { routeScope } from './registry.ts';
import type { ContextId } from '../auth/r3-context.js';
export type WorkspaceContext = ContextId | 'personal';
export interface NavigationContext {
  context: WorkspaceContext;
  returnTo: string;
  warning: boolean;
}
function permittedContexts(a: WorkspaceIdentity): WorkspaceContext[] {
  return a.role === 'faculty_supervisor'
    ? a.reviewerCapable
      ? ['supervision', 'independent']
      : ['supervision']
    : [
        {
          student: 'author',
          university_admin: 'university',
          platform_admin: 'platform',
          partner: 'partner',
        }[a.role] as ContextId,
      ];
}
export function contextLanding(
  a: WorkspaceIdentity,
  locale: Locale,
  context: WorkspaceContext,
) {
  return (
    '/' +
    locale +
    (context === 'independent'
      ? '/reviewer'
      : context === 'supervision'
        ? '/supervision'
        : (landing[a.role] ?? '/workspace'))
  );
}
export function safeWorkspaceDestination(
  a: WorkspaceIdentity,
  value: unknown,
  locale: Locale,
  context: WorkspaceContext,
  depth = 0,
): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 1800 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u001f\u007f#]/.test(value)
  )
    return null;
  let url: URL;
  try {
    url = new URL(value, 'https://local.invalid');
  } catch {
    return null;
  }
  let decoded: string;
  try {
    decoded = url.search;
    for (let i = 0; i < 3; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }
  if (
    url.origin !== 'https://local.invalid' ||
    /%/.test(url.pathname) ||
    !/^\/(en|ar)\//.test(url.pathname) ||
    /(?:token|password|secret|cookie|authorization|credential)=/i.test(decoded)
  )
    return null;
  const path = url.pathname.replace(/^\/(en|ar)/, ''),
    scope = routeScope(path);
  if (
    !scope?.roles.includes(a.role) ||
    path.startsWith('/account') ||
    path === '/workspace'
  )
    return null;
  if (
    (context === 'independent' &&
      !path.startsWith('/reviewer') &&
      !['/notifications', '/audit'].includes(path) &&
      !/^\/evaluation\/corrections\/[a-f0-9-]{36}$/i.test(path)) ||
    (context === 'supervision' &&
      path.startsWith('/reviewer') &&
      path !== '/reviewer/profile')
  )
    return null;
  const query = new URLSearchParams();
  for (const [key, v] of url.searchParams) {
    if (
      url.searchParams.getAll(key).length !== 1 ||
      ![
        'tab',
        'q',
        'status',
        'role',
        'page',
        'filter',
        'selected',
        'from',
        'project',
        'version',
        'request',
        'file',
        'submission',
        'directory',
        'criterion',
        'case',
        'issue',
        'command',
        'task',
        'context',
        'unread',
        'before',
        'beforeId',
        'grant',
        'returnTo',
      ].includes(key) ||
      v.length > 500
    )
      return null;
    if (
      [
        'selected',
        'project',
        'version',
        'request',
        'file',
        'submission',
        'case',
        'issue',
        'command',
        'beforeId',
        'grant',
      ].includes(key) &&
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)
    )
      return null;
    if (
      key === 'context' &&
      (!['/notifications', '/reviewer/profile'].includes(path) ||
        !['supervision', 'independent', 'personal'].includes(v) ||
        a.role !== 'faculty_supervisor' ||
        (!permittedContexts(a).includes(v as WorkspaceContext) &&
          !(
            path === '/reviewer/profile' &&
            v === 'personal' &&
            permittedContexts(a).length > 1
          )))
    )
      return null;
    if (
      key === 'command' &&
      !/^\/(?:evaluation\/(?:issues|corrections\/[a-f0-9-]{36})|projects\/[a-f0-9-]{36}(?:\/(?:edit|final|files|reviews))?|supervision\/(?:finals|rounds)\/[a-f0-9-]{36}(?:\/(?:screening|assessment|committee|decision))?|reviewer\/tasks\/[a-f0-9-]{36})$/i.test(
        path,
      )
    )
      return null;
    if (
      key === 'task' &&
      !/^(?:metadata|checkpoint|review|license\.[a-f0-9-]{36}|decision:[a-f0-9-]{36}|correction\.[a-f0-9-]{36}|admin\.(?:[a-f0-9-]{36}|collection)|request\.[a-f0-9-]{36}(?:\.(?:supervisor|committee|external))?|(?:completion|final|screening|decision|independent)\.[a-f0-9-]{36}|academic\.form\.[a-f0-9-]{36}\.(?:supervisor|committee))$/i.test(
        v,
      )
    )
      return null;
    if (
      key === 'task' &&
      /^license\./i.test(v) &&
      !/^\/projects\/[a-f0-9-]{36}\/files$/i.test(path)
    )
      return null;
    if (
      key === 'directory' &&
      (!v ||
        /[\\\u0000-\u001f\u007f]/.test(v) ||
        v.split('/').some((x) => !x || x === '.' || x === '..'))
    )
      return null;
    if (key === 'criterion' && !/^[1-7]$/.test(v)) return null;
    if (key === 'unread' && !['true', 'false'].includes(v)) return null;
    if (key === 'before' && !Number.isFinite(Date.parse(v))) return null;
    if (key === 'returnTo') {
      if (path !== '/reviewer/profile' || depth >= 2) return null;
      const destination = safeWorkspaceDestination(
        a,
        v,
        locale,
        context,
        depth + 1,
      );
      if (!destination) return null;
      query.set(key, destination);
      continue;
    }
    if (key === 'from') {
      if (
        depth >= 2 ||
        !safeWorkspaceDestination(a, v, locale, context, depth + 1)
      )
        return null;
      query.set(
        key,
        safeWorkspaceDestination(a, v, locale, context, depth + 1)!,
      );
    } else query.set(key, v);
  }
  if (query.has('command') !== query.has('task')) return null;
  return '/' + locale + path + (query.size ? '?' + query : '');
}
export function resolveNavigationContext(
  a: WorkspaceIdentity,
  locale: Locale,
  query: { context?: unknown; returnTo?: unknown },
): NavigationContext {
  const allowed = permittedContexts(a),
    requested = query.context;
  const context = allowed.includes(requested as WorkspaceContext)
    ? (requested as WorkspaceContext)
    : allowed.length === 1
      ? allowed[0]!
      : 'personal';
  const invalid =
    requested !== undefined &&
    requested !== context &&
    !(requested === 'personal' && context === 'personal');
  const fallback = contextLanding(
    a,
    locale,
    context === 'personal' ? allowed[0]! : context,
  );
  const destination = safeWorkspaceDestination(
    a,
    query.returnTo,
    locale,
    context === 'personal' ? allowed[0]! : context,
  );
  return {
    context,
    returnTo: destination ?? fallback,
    warning: invalid || (query.returnTo !== undefined && !destination),
  };
}
export function originNavigation(
  a: WorkspaceIdentity,
  locale: Locale,
  path: string,
): NavigationContext {
  const source = new URL(path, 'https://local.invalid');
  const inboxContext =
    source.pathname === '/' + locale + '/notifications' &&
    a.role === 'faculty_supervisor' &&
    permittedContexts(a).includes(
      source.searchParams.get('context') as WorkspaceContext,
    )
      ? (source.searchParams.get('context') as WorkspaceContext)
      : null;
  const context: WorkspaceContext =
    inboxContext ??
    (path.startsWith('/' + locale + '/reviewer') && a.reviewerCapable
      ? 'independent'
      : a.role === 'faculty_supervisor'
        ? 'supervision'
        : permittedContexts(a)[0]!);
  return {
    context,
    returnTo:
      safeWorkspaceDestination(a, path, locale, context) ??
      contextLanding(a, locale, context),
    warning: false,
  };
}
export function inboxHref(
  a: WorkspaceIdentity,
  locale: Locale,
  intent: NavigationContext,
) {
  return (
    '/' +
    locale +
    '/notifications' +
    (a.role === 'faculty_supervisor' &&
    a.reviewerCapable &&
    intent.context !== 'personal'
      ? '?' + new URLSearchParams({ context: intent.context })
      : '')
  );
}
export function personalHref(
  locale: Locale,
  page: 'account' | 'security' | 'preferences',
  intent: NavigationContext,
) {
  return (
    '/' +
    locale +
    '/account' +
    (page === 'security' ? '/security' : '') +
    '?' +
    new URLSearchParams({
      context: intent.context,
      returnTo: intent.returnTo,
    }) +
    (page === 'preferences' ? '#preferences' : '')
  );
}
export function localeDestination(value: string, locale: Locale) {
  const u = new URL(value, 'https://local.invalid');
  u.pathname = u.pathname.replace(/^\/(en|ar)/, '/' + locale);
  if (u.searchParams.has('returnTo'))
    u.searchParams.set(
      'returnTo',
      u.searchParams.get('returnTo')!.replace(/^\/(en|ar)/, '/' + locale),
    );
  return u.pathname + u.search + u.hash;
}
