import 'server-only';
import { createHash } from 'node:crypto';
import { createRequestId } from './request-id.js';
import { systemClock, type Clock } from './clock.js';
import {
  authorize,
  auditValues,
  roleCode,
  type ActorContext,
  type Decision,
} from './authorization.js';
import {
  ApplicationError,
  serializeError,
  type SerializedError,
} from './index.js';
interface PrincipalRecord {
  id: string;
  role_code: string;
  university_id: string | null;
  account_status: string;
  partner_status: string | null;
}
interface DepartmentRecord {
  id: string;
  university_id: string;
  name_en: string;
  name_ar: string;
  row_version: number;
}
export interface GovernanceTransaction {
  fileFacts(
    id: string,
    actor: string | null,
    now: Date,
  ): Promise<
    | {
        id: string;
        university_id: string;
        project_id: string;
        version_id: string;
        original_name: string;
        detected_mime: string;
        size_bytes: string;
        sha256: string;
        visibility: string;
        processing_status: string;
        status: string;
        authored: boolean;
        supervised: boolean;
        exact_grant: boolean;
      }
    | undefined
  >;
  assignedProject(
    id: string,
    actor: string,
  ): Promise<{ university_id: string; supervised: boolean } | undefined>;
  actor(id: string): Promise<PrincipalRecord | undefined>;
  department(id: string): Promise<DepartmentRecord | undefined>;
  lockCommand(actor: string, command: string): Promise<void>;
  receipt(
    actor: string,
    command: string,
  ): Promise<
    | { payload_digest: string; result: Record<string, string | number> }
    | undefined
  >;
  renameDepartment(
    id: string,
    version: number,
    en: string,
    ar: string,
  ): Promise<DepartmentRecord | undefined>;
  audit(input: {
    actor: PrincipalRecord;
    universityId: string | null;
    action?: 'department.rename' | 'audit.platform.read';
    targetType?: 'department' | 'audit_scope';
    targetId: string;
    correlationId: string;
    eventKey: string;
    before: Record<string, string | number>;
    after: Record<string, string | number>;
    reason: string;
  }): Promise<string>;
  saveReceipt(
    actor: string,
    command: string,
    digest: string,
    audit: string,
    result: Record<string, string | number>,
  ): Promise<void>;
  immediateNotice(
    audit: string,
    actor: string,
    university: string,
  ): Promise<void>;
  auditQuery(options: {
    universityId: string | null;
    platform: boolean;
    actor?: string;
    action?: string;
    project?: string;
    target?: string;
    from?: Date;
    to?: Date;
    limit: number;
    offset: number;
  }): Promise<AuditEntry[]>;
}
interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  university_id: string | null;
  action: string;
  object_type: string;
  object_id: string;
  project_id: string | null;
  version_id: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  reason: string | null;
  occurred_at: Date;
  correlation_id: string;
}
export interface GovernanceRepository {
  run<T>(
    operation: (transaction: GovernanceTransaction) => Promise<T>,
  ): Promise<T>;
}
// Required trusted server identity source; Phase09 supplies a real verified-session adapter. Never an HTTP role/tenant body.
export interface ServerIdentitySource {
  userId(): Promise<string | null>;
}
export interface ServiceResult {
  status: number;
  headers: Record<string, string>;
  body: SerializedError | { data: unknown; requestId: string };
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(
  decision: Decision | 'conflict' | 'invalid_request' | 'internal_error',
  requestId: string,
): ServiceResult {
  const code = {
    allow: 'INTERNAL_ERROR',
    unauthenticated: 'UNAUTHENTICATED',
    forbidden: 'FORBIDDEN',
    not_found: 'NOT_FOUND',
    conflict: 'CONFLICT',
    invalid_request: 'INVALID_REQUEST',
    internal_error: 'INTERNAL_ERROR',
  }[decision] as
    | 'UNAUTHENTICATED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'INVALID_REQUEST'
    | 'INTERNAL_ERROR';
  return {
    status: {
      allow: 500,
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      invalid_request: 400,
      internal_error: 500,
    }[decision],
    headers: {
      'cache-control': 'private, no-store',
      'x-request-id': requestId,
    },
    body: serializeError(new ApplicationError(code), requestId),
  };
}
function success(data: unknown, requestId: string): ServiceResult {
  return {
    status: 200,
    headers: {
      'cache-control': 'private, no-store',
      'x-request-id': requestId,
    },
    body: { data, requestId },
  };
}
function context(
  row: PrincipalRecord | undefined,
  correlationId: string,
): ActorContext | null {
  if (!row) return null;
  const role = roleCode(row.role_code);
  if (!role) return null;
  return {
    userId: row.id,
    role,
    universityId: row.university_id,
    active: row.account_status === 'active',
    partnerApproved: row.partner_status === 'approved',
    correlationId,
  };
}
export class GovernanceService {
  constructor(
    private readonly repository: GovernanceRepository,
    private readonly identity: ServerIdentitySource,
    private readonly clock: Clock = systemClock,
  ) {}
  async execute(
    action: string,
    input: Parameters<GovernanceService['renameDepartment']>[0],
  ): Promise<ServiceResult> {
    return action === 'department.rename'
      ? this.renameDepartment(input)
      : reply('forbidden', createRequestId());
  }
  async fileMetadata(fileId: string): Promise<ServiceResult> {
    const requestId = createRequestId();
    if (!uuid.test(fileId)) return reply('invalid_request', requestId);
    try {
      return await this.repository.run(async (tx) => {
        const identity = await this.identity.userId();
        const row =
          identity && uuid.test(identity)
            ? await tx.actor(identity)
            : undefined;
        const actor = context(row, requestId);
        const file = await tx.fileFacts(
          fileId,
          actor?.userId ?? null,
          this.clock.now(),
        );
        if (!file || file.processing_status !== 'ready')
          return reply('not_found', requestId);
        if (
          (!actor || !actor.active) &&
          !(file.status === 'archived' && file.visibility === 'public')
        )
          return reply('not_found', requestId);
        const decision = authorize(actor, 'file.read', {
          kind: 'file',
          universityId: file.university_id,
          visible:
            file.authored ||
            file.supervised ||
            actor?.role === 'university_admin' ||
            file.exact_grant,
          authored: file.authored,
          supervised: file.supervised,
          archived: file.status === 'archived',
          publicFile: file.visibility === 'public',
          exactActiveGrant: file.exact_grant,
        });
        return decision === 'allow'
          ? success(
              {
                fileId: file.id,
                name: file.original_name,
                mime: file.detected_mime,
                sizeBytes: file.size_bytes,
                sha256: file.sha256,
              },
              requestId,
            )
          : reply(decision, requestId);
      });
    } catch {
      return reply('internal_error', requestId);
    }
  }
  async renameDepartment(input: {
    departmentId: string;
    commandId: string;
    expectedVersion: number;
    nameEn: string;
    nameAr: string;
    reason: string;
    universityId?: string;
    role?: string;
  }): Promise<ServiceResult> {
    const requestId = createRequestId();
    if (
      !uuid.test(input.departmentId) ||
      !uuid.test(input.commandId) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 0 ||
      ![input.nameEn, input.nameAr].every(
        (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 120,
      ) ||
      typeof input.reason !== 'string' ||
      !input.reason.trim() ||
      input.reason.length > 400
    )
      return reply('invalid_request', requestId);
    try {
      auditValues({ scope: input.reason });
    } catch {
      return reply('invalid_request', requestId);
    }
    try {
      return await this.repository.run(async (tx) => {
        const id = await this.identity.userId();
        const row = id && uuid.test(id) ? await tx.actor(id) : undefined;
        const actor = context(row, requestId);
        if (!actor) return reply('unauthenticated', requestId);
        await tx.lockCommand(actor.userId, input.commandId);
        if (!actor.active) return reply('forbidden', requestId);
        const department = await tx.department(input.departmentId);
        if (!department) return reply('not_found', requestId);
        const decision = authorize(actor, 'department.rename', {
          universityId: department.university_id,
          visible: true,
          kind: 'department',
        });
        if (decision !== 'allow') return reply(decision, requestId);
        const digest = createHash('sha256')
          .update(
            JSON.stringify([
              input.departmentId,
              input.expectedVersion,
              input.nameEn.trim(),
              input.nameAr.trim(),
              input.reason.trim(),
            ]),
          )
          .digest('hex');
        const previous = await tx.receipt(actor.userId, input.commandId);
        if (previous)
          return previous.payload_digest === digest
            ? success(previous.result, requestId)
            : reply('conflict', requestId);
        if (department.row_version !== input.expectedVersion)
          return reply('conflict', requestId);
        const before = auditValues({
          name_en: department.name_en,
          name_ar: department.name_ar,
          row_version: department.row_version,
        });
        const after = auditValues({
          name_en: input.nameEn.trim(),
          name_ar: input.nameAr.trim(),
          row_version: department.row_version + 1,
        });
        const changed = await tx.renameDepartment(
          department.id,
          input.expectedVersion,
          input.nameEn.trim(),
          input.nameAr.trim(),
        );
        if (!changed) return reply('conflict', requestId);
        const audit = await tx.audit({
          actor: row!,
          universityId: department.university_id,
          targetId: department.id,
          correlationId: requestId,
          eventKey: input.commandId,
          before,
          after,
          reason: input.reason.trim(),
        });
        await tx.immediateNotice(audit, actor.userId, department.university_id);
        await tx.saveReceipt(
          actor.userId,
          input.commandId,
          digest,
          audit,
          after,
        );
        return success(after, requestId);
      });
    } catch {
      return reply('internal_error', requestId);
    }
  }
  async queryAudit(
    input: {
      actor?: string;
      action?: string;
      project?: string;
      target?: string;
      from?: Date;
      to?: Date;
      limit?: number;
      offset?: number;
      universityId?: string;
      reason?: string;
    } = {},
  ): Promise<ServiceResult> {
    const requestId = createRequestId();
    const limit = input.limit ?? 20,
      offset = input.offset ?? 0;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      [input.actor, input.project, input.target].some(
        (v) => v !== undefined && !uuid.test(v),
      ) ||
      [input.from, input.to].some(
        (v) =>
          v !== undefined &&
          !(v instanceof Date && Number.isFinite(v.getTime())),
      )
    )
      return reply('invalid_request', requestId);
    try {
      return await this.repository.run(async (tx) => {
        const id = await this.identity.userId();
        const row = id && uuid.test(id) ? await tx.actor(id) : undefined;
        const actor = context(row, requestId);
        if (!actor) return reply('unauthenticated', requestId);
        const platform = actor.role === 'platform_admin';
        const assignment =
          actor.role === 'faculty_supervisor' && input.project
            ? await tx.assignedProject(input.project, actor.userId)
            : undefined;
        if (actor.role === 'faculty_supervisor' && !assignment)
          return reply(input.project ? 'not_found' : 'forbidden', requestId);
        const decision = authorize(
          actor,
          platform
            ? 'audit.platform.read'
            : actor.role === 'faculty_supervisor'
              ? 'audit.project.read'
              : 'audit.tenant.read',
          {
            universityId: assignment?.university_id ?? actor.universityId,
            visible:
              actor.role !== 'faculty_supervisor' ||
              Boolean(assignment?.supervised),
            kind: 'audit',
            supervised: assignment?.supervised ?? false,
          },
        );
        if (decision !== 'allow') return reply(decision, requestId);
        if (platform && (!input.reason?.trim() || input.reason.length > 400))
          return reply('forbidden', requestId);
        if (input.reason) auditValues({ scope: input.reason });
        const data = await tx.auditQuery({
          universityId: actor.universityId,
          platform,
          limit,
          offset,
          ...(input.actor ? { actor: input.actor } : {}),
          ...(input.action ? { action: input.action } : {}),
          ...(input.project ? { project: input.project } : {}),
          ...(input.target ? { target: input.target } : {}),
          ...(input.from ? { from: input.from } : {}),
          ...(input.to ? { to: input.to } : {}),
        });
        if (platform)
          await tx.audit({
            actor: row!,
            universityId: null,
            action: 'audit.platform.read',
            targetType: 'audit_scope',
            targetId: requestId,
            correlationId: requestId,
            eventKey: requestId,
            before: {},
            after: { count: data.length },
            reason: input.reason!.trim(),
          });
        return success(data, requestId);
      });
    } catch {
      return reply('internal_error', requestId);
    }
  }
}
