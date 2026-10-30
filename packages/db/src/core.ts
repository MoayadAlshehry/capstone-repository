import 'server-only';
import type { RuntimeDatabase, TransactionScope } from './ports.js';
export interface PrincipalRow {
  id: string;
  role_code: string;
  university_id: string | null;
  account_status: string;
  partner_status: string | null;
}
export interface DepartmentRow {
  id: string;
  university_id: string;
  name_en: string;
  name_ar: string;
  row_version: number;
}
export interface AuditRow {
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
export class CoreSession {
  async fileFacts(id: string, actor: string | null, now: Date) {
    return (
      await this.transaction.query<{
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
      }>(
        `SELECT f.id,f.university_id,f.project_id,f.version_id,f.original_name,f.detected_mime,f.size_bytes::text,f.sha256,f.visibility,f.processing_status,v.status,
 EXISTS(SELECT 1 FROM app.project_authors a WHERE a.project_id=f.project_id AND a.university_id=f.university_id AND a.user_id=$2) AS authored,
 COALESCE(p.supervisor_id=$2,false) AS supervised,
 EXISTS(SELECT 1 FROM app.access_grants g WHERE g.university_id=f.university_id AND g.project_id=f.project_id AND g.version_id=f.version_id AND g.granted_to=$2 AND g.revoked_at IS NULL AND g.expires_at>$3) AS exact_grant
 FROM app.project_files f JOIN app.project_versions v ON (v.university_id,v.project_id,v.id)=(f.university_id,f.project_id,f.version_id) JOIN app.projects p ON (p.university_id,p.id)=(f.university_id,f.project_id) WHERE f.id=$1`,
        [id, actor, now],
      )
    )[0];
  }
  async assignedProject(id: string, actor: string) {
    return (
      await this.transaction.query<{
        university_id: string;
        supervised: boolean;
      }>(
        'SELECT university_id,supervisor_id=$2 AS supervised FROM app.projects WHERE id=$1',
        [id, actor],
      )
    )[0];
  }
  constructor(private readonly transaction: TransactionScope) {}
  async actor(id: string) {
    return (
      await this.transaction.query<PrincipalRow>(
        'SELECT id,role_code,university_id,account_status,partner_status FROM app.users WHERE id=$1 FOR UPDATE',
        [id],
      )
    )[0];
  }
  async department(id: string) {
    return (
      await this.transaction.query<DepartmentRow>(
        'SELECT id,university_id,name_en,name_ar,row_version FROM app.departments WHERE id=$1 FOR UPDATE',
        [id],
      )
    )[0];
  }
  async lockCommand(actor: string, command: string) {
    await this.transaction.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [actor + ':' + command],
    );
  }
  async receipt(actor: string, command: string) {
    return (
      await this.transaction.query<{
        payload_digest: string;
        result: Record<string, string | number>;
      }>(
        'SELECT payload_digest,result FROM app.command_receipts WHERE actor_id=$1 AND command_id=$2',
        [actor, command],
      )
    )[0];
  }
  async renameDepartment(id: string, version: number, en: string, ar: string) {
    return (
      await this.transaction.query<DepartmentRow>(
        'UPDATE app.departments SET name_en=$3,name_ar=$4,row_version=row_version+1,updated_at=now() WHERE id=$1 AND row_version=$2 RETURNING id,university_id,name_en,name_ar,row_version',
        [id, version, en, ar],
      )
    )[0];
  }
  async audit(input: {
    actor: PrincipalRow;
    universityId: string | null;
    action?: 'department.rename' | 'audit.platform.read';
    targetType?: 'department' | 'audit_scope';
    targetId: string;
    correlationId: string;
    eventKey: string;
    before: Record<string, string | number>;
    after: Record<string, string | number>;
    reason: string;
  }) {
    return (
      await this.transaction.query<{ id: string }>(
        'INSERT INTO app.audit_logs(actor_id,actor_role,university_id,action,object_type,object_id,before_state,after_state,reason,correlation_id,event_key) VALUES($1,$2,$3,$10,$11,$4,$5,$6,$7,$8,$9) RETURNING id',
        [
          input.actor.id,
          input.actor.role_code,
          input.universityId,
          input.targetId,
          input.before,
          input.after,
          input.reason,
          input.correlationId,
          input.eventKey,
          input.action ?? 'department.rename',
          input.targetType ?? 'department',
        ],
      )
    )[0]!.id;
  }
  async saveReceipt(
    actor: string,
    command: string,
    digest: string,
    audit: string,
    result: Record<string, string | number>,
  ) {
    await this.transaction.query(
      "INSERT INTO app.command_receipts(actor_id,command_id,action,payload_digest,audit_id,result) VALUES($1,$2,'department.rename',$3,$4,$5)",
      [actor, command, digest, audit, result],
    );
  }
  async immediateNotice(audit: string, actor: string, university: string) {
    await this.transaction.query('SELECT app.core_immediate_notice($1,$2,$3)', [
      audit,
      actor,
      university,
    ]);
    await this.transaction.query(
      "INSERT INTO app.outbox_events(event_id,kind) VALUES($1,'core.audit.committed') ON CONFLICT DO NOTHING",
      [audit],
    );
  }
  async auditQuery(options: {
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
  }): Promise<AuditRow[]> {
    return this.transaction.query<AuditRow>(
      'SELECT id,actor_id,actor_role,university_id,action,object_type,object_id,project_id,version_id,before_state,after_state,reason,occurred_at,correlation_id FROM app.audit_logs WHERE (($1::boolean AND project_id IS NULL) OR (NOT $1 AND university_id=$2)) AND ($3::uuid IS NULL OR actor_id=$3) AND ($4::text IS NULL OR action=$4) AND ($5::uuid IS NULL OR project_id=$5) AND ($6::uuid IS NULL OR object_id=$6) AND ($7::timestamptz IS NULL OR occurred_at >= $7) AND ($8::timestamptz IS NULL OR occurred_at <= $8) ORDER BY occurred_at DESC,id DESC LIMIT $9 OFFSET $10',
      [
        options.platform,
        options.universityId,
        options.actor ?? null,
        options.action ?? null,
        options.project ?? null,
        options.target ?? null,
        options.from ?? null,
        options.to ?? null,
        options.limit,
        options.offset,
      ],
    );
  }
}
export function coreRepository(database: RuntimeDatabase) {
  return {
    run: <T>(operation: (session: CoreSession) => Promise<T>) =>
      database.transactions.run((scope) => operation(new CoreSession(scope))),
  };
}
