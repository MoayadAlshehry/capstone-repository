import 'server-only';
import { validNewPassword } from './password-policy.js';
import { createHash, randomBytes } from 'node:crypto';
import { createRuntimeDatabase } from './index.js';
import {
  authPasswordHash,
  CredentialWindow,
  type AccountView,
  type Authentication,
} from './auth.js';
export interface UniversityRow {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  status: string;
}
export interface DepartmentRow {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  row_version: number;
}
export interface ManagedAccountRow {
  id: string;
  full_name: string;
  email: string;
  role_code: string;
  account_status: string;
  student_id: string | null;
  department_id: string | null;
  university_id: string | null;
  lifecycle?: {
    purpose: string;
    state: string;
    issuedAt: string;
    expiresAt: string;
  }[];
}
export interface AdministrationView {
  universities: UniversityRow[];
  departments: DepartmentRow[];
  accounts: ManagedAccountRow[];
}
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function createAdministration(
  databaseUrl: string,
  auth: Authentication,
) {
  const db = createRuntimeDatabase(databaseUrl),
    limit = new CredentialWindow();
  async function view(
    user: AccountView,
    university?: string,
  ): Promise<AdministrationView> {
    if (!['platform_admin', 'university_admin'].includes(user.role))
      throw Error('FORBIDDEN');
    const uni =
      user.role === 'university_admin' ? user.universityId : university;
    const universities = await db.query<UniversityRow>(
      'SELECT id,code,name_en,name_ar,status FROM app.universities WHERE ($1::uuid IS NULL OR id=$1) ORDER BY code',
      [user.role === 'university_admin' ? uni : null],
    );
    if (university && !universities.some((u) => u.id === university))
      throw Error('NOT_FOUND');
    const departments = uni
      ? await db.query<DepartmentRow>(
          'SELECT id,code,name_en,name_ar,row_version FROM app.departments WHERE university_id=$1 ORDER BY code',
          [uni],
        )
      : [];
    const accounts = uni
      ? await db.query<ManagedAccountRow>(
          `SELECT id,full_name,email,role_code,account_status,student_id,department_id,university_id FROM app.users WHERE university_id=$1 AND role_code=ANY($2::text[]) ORDER BY full_name,id`,
          [
            uni,
            user.role === 'platform_admin'
              ? ['university_admin']
              : ['student', 'faculty_supervisor'],
          ],
        )
      : [];
    if (uni) {
      const states = await db.query<{
        user_id: string;
        purpose: string;
        state: string;
        issued_at: Date;
        expires_at: Date;
      }>(
        'SELECT user_id,purpose,state,issued_at,expires_at FROM app.lifecycle_administration_state($1,$2,$3)',
        [user.id, user.sessionId, uni],
      );
      for (const account of accounts)
        account.lifecycle = states
          .filter((s) => s.user_id === account.id)
          .map((s) => ({
            purpose: s.purpose,
            state: s.state,
            issuedAt: s.issued_at.toISOString(),
            expiresAt: s.expires_at.toISOString(),
          }));
    }
    return { universities, departments, accounts };
  }
  async function command(
    user: AccountView,
    command: string,
    fields: Record<string, string | number>,
  ) {
    if (command === 'department.update') {
      const rows = await db.query<{ row_version: number }>(
        'SELECT row_version FROM app.departments WHERE id=$1 AND university_id=$2',
        [fields['id'], user.universityId],
      );
      if (!rows.length) throw Error('NOT_FOUND');
      if (rows[0]!.row_version !== Number(fields['version']))
        throw Error('CONFLICT');
    }
    if (typeof fields['id'] === 'string' && command !== 'profile.update') {
      const target = await db.query<{ role_code?: string }>(
        'SELECT role_code FROM app.users WHERE id=$1 AND university_id=$2',
        [
          fields['id'],
          command === 'administrator.activation'
            ? fields['university']
            : user.universityId,
        ],
      );
      if (!command.startsWith('department.') && !target.length)
        throw Error('NOT_FOUND');
      if (
        !command.startsWith('department.') &&
        command !== 'administrator.activation' &&
        !['student', 'faculty_supervisor'].includes(target[0]?.role_code ?? '')
      )
        throw Error('FORBIDDEN');
    }
    const issuing = [
      'activation.issue',
      'reset.issue',
      'administrator.activation',
    ].includes(command);
    let token: string | undefined;
    const data: Record<string, string | number> = { ...fields };
    if (issuing) {
      const uni =
        command === 'administrator.activation'
          ? String(fields['university'])
          : user.universityId;
      token = `${fields['id']}.${uni}.${randomBytes(32).toString('hex')}`;
      data['digest'] = digest(token);
    }
    const rows = await db.query<{ result: { id: string; scope: string } }>(
      'SELECT app.admin_command($1,$2,$3,$4::jsonb) AS result',
      [user.id, user.sessionId, command, JSON.stringify(data)],
    );
    return {
      ...rows[0]!.result,
      ...(token
        ? { token, expiresInHours: command === 'reset.issue' ? 1 : 24 }
        : {}),
    };
  }
  async function lifecycle(fields: Record<string, unknown>, consume: boolean) {
    const { token, email, purpose, password, confirmation } = fields;
    if (
      Object.keys(fields).some(
        (k) =>
          ![
            'token',
            'email',
            'purpose',
            ...(consume ? ['password', 'confirmation'] : []),
          ].includes(k),
      ) ||
      typeof token !== 'string' ||
      !/^[0-9a-f-]{36}\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token) ||
      typeof email !== 'string' ||
      email.length > 254 ||
      !['activation', 'reset'].includes(String(purpose))
    )
      throw Error('INVALID_INPUT');
    if (!limit.attempt(email.trim().toLowerCase())) throw Error('TRY_LATER');
    const [id, uni] = token.split('.');
    const matches = await db.query(
      'SELECT id FROM app.users WHERE id=$1 AND email=$2',
      [id, email.trim().toLowerCase()],
    );
    if (!matches.length) throw Error('INVALID_CREDENTIAL');
    if (!consume) {
      const rows = await db.query<{
        context: { name: string; purpose: string } | null;
      }>('SELECT app.lifecycle_context($1,$2,$3,$4) AS context', [
        id,
        uni,
        purpose,
        digest(token),
      ]);
      if (!rows[0]?.context) throw Error('INVALID_CREDENTIAL');
      return rows[0].context;
    }
    if (
      typeof password !== 'string' ||
      !validNewPassword(password) ||
      password !== confirmation
    )
      throw Error('INVALID_INPUT');
    const rows = await db.query<{ success: boolean }>(
      'SELECT app.lifecycle_consume($1,$2,$3,$4,$5) AS success',
      [id, uni, purpose, digest(token), await authPasswordHash(password)],
    );
    if (!rows[0]?.success) throw Error('INVALID_CREDENTIAL');
    limit.success(email.trim().toLowerCase());
    return { success: true };
  }
  return {
    view,
    command,
    lifecycle,
    account: (h: Headers) => auth.account(h),
    close: () => db.close(),
  };
}
