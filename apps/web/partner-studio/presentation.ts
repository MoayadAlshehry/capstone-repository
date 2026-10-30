import type {
  AccessGrant,
  AccessRequest,
  AccessView,
} from '../access/types.js';
type GrantState =
  'active' | 'expired' | 'revoked' | 'paused' | 'unavailable' | 'unknown';
export type GrantRecord = AccessGrant & {
  effective: GrantState;
  fileCount?: number;
};
export type AccessAction = {
  kind:
    | 'files'
    | 'record'
    | 'request'
    | 'history'
    | 'review'
    | 'protect'
    | 'eligibility'
    | 'retry';
  href: string;
};
export interface AccessRecord {
  id: string;
  project: string;
  version: string;
  title: string;
  organization: string;
  state: string;
  date: string;
  dateKind: 'expires' | 'requested' | 'decided' | 'granted' | 'ended';
  action: AccessAction;
  kind: 'grant' | 'request';
  purpose?: string;
  reason?: string | null;
  versionNumber: number;
}
export interface AccessPresentation {
  now: string;
  active: AccessRecord[];
  pending: AccessRecord[];
  history: AccessRecord[];
  groups: {
    project: string;
    title: string;
    active: AccessRecord[];
    history: AccessRecord[];
  }[];
  canRequest: boolean;
}
export const accessHub = (locale: string, tab = 'active', project?: string) =>
  '/' +
  locale +
  '/partner/access?' +
  new URLSearchParams({ tab, ...(project ? { project } : {}) });
// Presentation of server-admitted records, never a byte-access predicate.
export function presentAccess(
  view: AccessView,
  grants: GrantRecord[],
  locale: 'en' | 'ar',
  canRequest: boolean,
): AccessPresentation {
  const pending = view.requests
    .filter((r) => r.status === 'pending')
    .map((r) => requestRecord(r, locale));
  const history: AccessRecord[] = view.requests
    .filter(
      (r) => r.status !== 'pending' && !grants.some((g) => g.request === r.id),
    )
    .map((r) => requestRecord(r, locale));
  const active: AccessRecord[] = [];
  for (const g of grants) {
    const record: AccessRecord = {
      id: g.id,
      project: g.project,
      version: g.version,
      title: g.title,
      organization: g.organization,
      state: g.effective,
      date:
        g.effective === 'revoked'
          ? g.revokedAt!
          : g.effective === 'expired'
            ? g.expiresAt
            : g.grantedAt,
      dateKind:
        g.effective === 'revoked' || g.effective === 'expired'
          ? 'ended'
          : 'granted',
      action: {
        kind: 'record',
        href: '/' + locale + '/partner/grants/' + g.id,
      },
      kind: 'grant',
      reason: g.reason,
      versionNumber: g.versionNumber,
    };
    history.push(record);
    if (g.effective === 'active')
      active.push({
        ...record,
        date: g.expiresAt,
        dateKind: 'expires',
        action: {
          kind: 'files',
          href: '/' + locale + '/partner/grants/' + g.id,
        },
      });
  }
  history.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  pending.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  active.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const groups = Array.from(
    new Set([...active, ...history].map((r) => r.project)),
  ).map((project) => ({
    project,
    title: [...active, ...history].find((r) => r.project === project)!.title,
    active: active.filter((r) => r.project === project),
    history: history.filter((r) => r.project === project),
  }));
  return { now: view.now, active, pending, history, groups, canRequest };
}
export function requestRecord(
  r: AccessRequest,
  locale: 'en' | 'ar',
): AccessRecord {
  return {
    id: r.id,
    project: r.project,
    version: r.version,
    title: r.title,
    organization: r.organization,
    state: r.status === 'pending' ? 'awaiting_lead' : r.status,
    date: r.cancelledAt ?? r.decidedAt ?? r.createdAt,
    dateKind: r.status === 'pending' ? 'requested' : 'decided',
    action: {
      kind: 'request',
      href:
        '/' +
        locale +
        '/partner/request?' +
        new URLSearchParams({
          project: r.project,
          version: r.version,
          request: r.id,
        }),
    },
    kind: 'request',
    purpose: r.justification,
    reason: r.reason,
    versionNumber: r.versionNumber,
  };
}
export function compatibleHubQuery(
  query: Record<string, string | string[] | undefined>,
  grants = false,
) {
  const p = new URLSearchParams();
  for (const key of ['q', 'status', 'page', 'project', 'tab'])
    if (typeof query[key] === 'string') p.set(key, query[key].slice(0, 200));
  if (!['active', 'pending', 'history'].includes(p.get('tab') ?? ''))
    p.set(
      'tab',
      grants
        ? ['expired', 'revoked'].includes(p.get('status') ?? '')
          ? 'history'
          : 'active'
        : ['approved', 'denied', 'cancelled'].includes(p.get('status') ?? '')
          ? 'history'
          : 'pending',
    );
  return p;
}
