export const roleCodes = [
  'student',
  'faculty_supervisor',
  'university_admin',
  'platform_admin',
  'partner',
] as const;
export type RoleCode = (typeof roleCodes)[number];
export function roleCode(value: string): RoleCode | undefined {
  return roleCodes.find((role) => role === value);
}
export interface ActorContext {
  readonly userId: string;
  readonly role: RoleCode;
  readonly universityId: string | null;
  readonly active: boolean;
  readonly partnerApproved: boolean;
  readonly correlationId: string;
}
export interface ResourceFacts {
  readonly kind?:
    | 'foundation'
    | 'department'
    | 'audit'
    | 'file'
    | 'account'
    | 'institution'
    | 'project';
  readonly universityId: string | null;
  readonly userId?: string;
  readonly visible: boolean;
  readonly authored?: boolean;
  readonly supervised?: boolean;
  readonly lead?: boolean;
  readonly versionState?: string;
  readonly archived?: boolean;
  readonly publicFile?: boolean;
  readonly exactActiveGrant?: boolean;
}
export type Decision = 'allow' | 'unauthenticated' | 'forbidden' | 'not_found';
const protectedActions = new Set([
  'audit.project.read',
  'department.rename',
  'audit.tenant.read',
  'audit.platform.read',
  'file.read',
]);
export function authorize(
  actor: ActorContext | null,
  action: string,
  resource: ResourceFacts,
): Decision {
  if (action === 'foundation.read')
    return resource.kind === 'foundation' ? 'allow' : 'forbidden';
  if (
    action === 'file.read' &&
    resource.kind === 'file' &&
    resource.archived &&
    resource.publicFile
  )
    return 'allow';
  if (!actor) return 'unauthenticated';
  if (!actor.active) return 'forbidden';
  if (action === 'draft.edit') {
    if (resource.kind !== 'project') return 'forbidden';
    if (!resource.visible || actor.universityId !== resource.universityId)
      return 'not_found';
    return actor.role === 'student' &&
      resource.authored &&
      (resource.versionState === 'draft' ||
        resource.versionState === 'revision_required')
      ? 'allow'
      : 'forbidden';
  }
  if (action === 'project.read' || action === 'project.lead') {
    if (resource.kind !== 'project') return 'forbidden';
    if (!resource.visible || actor.universityId !== resource.universityId)
      return 'not_found';
    if (action === 'project.lead')
      return actor.role === 'student' && resource.authored && resource.lead
        ? 'allow'
        : 'forbidden';
    return actor.role === 'university_admin' ||
      (actor.role === 'student' && resource.authored) ||
      (actor.role === 'faculty_supervisor' && resource.supervised)
      ? 'allow'
      : 'not_found';
  }
  if (action === 'admin.profile')
    return resource.kind === 'account' && resource.userId === actor.userId
      ? 'allow'
      : 'forbidden';
  if (action === 'admin.platform')
    return resource.kind === 'institution' && actor.role === 'platform_admin'
      ? 'allow'
      : 'forbidden';
  if (action === 'admin.tenant') {
    if (resource.kind !== 'institution') return 'forbidden';
    if (actor.role !== 'university_admin') return 'forbidden';
    return actor.universityId === resource.universityId && resource.visible
      ? 'allow'
      : 'not_found';
  }
  if (action === 'account.read')
    return resource.kind === 'account' && resource.userId === actor.userId
      ? 'allow'
      : 'forbidden';
  if (!protectedActions.has(action)) return 'forbidden';
  if (
    (action === 'file.read' && resource.kind !== 'file') ||
    (action === 'department.rename' && resource.kind !== 'department') ||
    (action.startsWith('audit.') && resource.kind !== 'audit')
  )
    return 'forbidden';
  if (action === 'audit.platform.read')
    return actor.role === 'platform_admin' ? 'allow' : 'forbidden';
  if (action === 'file.read') {
    if (actor.role === 'partner')
      return actor.partnerApproved &&
        resource.archived &&
        resource.exactActiveGrant
        ? 'allow'
        : 'not_found';
    if (actor.role === 'platform_admin') return 'forbidden';
  }
  if (actor.universityId !== resource.universityId) return 'not_found';
  if (!resource.visible) return 'not_found';
  if (action === 'department.rename' || action === 'audit.tenant.read')
    return actor.role === 'university_admin' ? 'allow' : 'forbidden';
  if (action === 'audit.project.read')
    return actor.role === 'faculty_supervisor' && resource.supervised
      ? 'allow'
      : 'forbidden';
  if (action === 'file.read')
    return actor.role === 'university_admin' ||
      (actor.role === 'student' && resource.authored) ||
      (actor.role === 'faculty_supervisor' && resource.supervised)
      ? 'allow'
      : 'forbidden';
  return 'forbidden';
}
export type VersionState =
  'draft' | 'pending_review' | 'revision_required' | 'archived' | 'rejected';
export type RequestState = 'pending' | 'approved' | 'denied' | 'cancelled';
export function versionTransition(from: VersionState, to: VersionState) {
  return (
    {
      draft: ['pending_review'],
      pending_review: ['revision_required', 'archived', 'rejected'],
      revision_required: ['pending_review'],
      archived: [],
      rejected: [],
    } as Record<VersionState, VersionState[]>
  )[from].includes(to);
}
export function requestTransition(from: RequestState, to: RequestState) {
  return from === 'pending' && ['approved', 'denied', 'cancelled'].includes(to);
}
export function grantState(
  expires: Date,
  revoked: Date | null,
  now: Date,
): 'active' | 'expired' | 'revoked' {
  return revoked ? 'revoked' : now >= expires ? 'expired' : 'active';
}
export function publicMetadata(row: {
  title: string | null;
  abstract: string | null;
  status: string;
  email?: string;
  storage_path?: string;
}) {
  return row.status === 'archived'
    ? { title: row.title, abstract: row.abstract }
    : null;
}
export function auditValues(
  value: Record<string, unknown>,
): Record<string, string | number> {
  const allowed = ['name_en', 'name_ar', 'row_version', 'scope', 'count'];
  const result: Record<string, string | number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      !allowed.includes(key) ||
      !['string', 'number'].includes(typeof item) ||
      (typeof item === 'string' &&
        (item.length > 400 ||
          /postgres(?:ql)?:|authorization|password\s*[:=]|(?:reset|activation|session)[_-]?token|[A-Za-z]:\\|\/run\/secrets/i.test(
            item,
          )))
    )
      throw Error('Unsafe audit value');
    if (typeof item === 'string' || typeof item === 'number')
      result[key] = item;
  }
  return result;
}
