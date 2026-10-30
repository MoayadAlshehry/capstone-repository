export interface NoticeLink {
  kind: string;
  id?: string;
  project?: string;
}
interface Notice {
  id: string;
  type: string;
  created_at: string;
  read_at: string | null;
  args: { deadline?: string };
  link: NoticeLink;
}
export interface NoticePage {
  items: Notice[];
  unread: number;
}
interface AuditItem {
  context?: string | null;
  id: string;
  actor_id: string | null;
  actor: string;
  actor_role: string | null;
  action: string;
  object_type: string;
  object_id: string;
  project_id: string | null;
  version_id: string | null;
  university_id: string | null;
  occurred_at: string;
  correlation_id: string;
  before_status: string | null;
  after_status: string | null;
}
export interface AuditPage {
  items: AuditItem[];
  scope: string;
}
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
export const stamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length <= 40 &&
  /^\d{4}-\d\d-\d\d(?:T[0-9:.+-]+Z?| [0-9:.+-]+)?$/.test(v) &&
  Number.isFinite(Date.parse(v));
export function validAuditFilters(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const f = v as Record<string, unknown>;
  if (
    Object.keys(f).some(
      (k) =>
        ![
          'actor',
          'action',
          'project',
          'from',
          'to',
          'before',
          'beforeId',
        ].includes(k),
    )
  )
    return false;
  for (const [k, x] of Object.entries(f)) {
    if (
      ['actor', 'project', 'beforeId'].includes(k)
        ? !uuid(x)
        : k === 'action'
          ? typeof x !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(x)
          : !stamp(x)
    )
      return false;
  }
  return (
    Boolean(f['before']) === Boolean(f['beforeId']) &&
    (!(f['from'] && f['to']) ||
      Date.parse(String(f['from'])) <= Date.parse(String(f['to'])))
  );
}
