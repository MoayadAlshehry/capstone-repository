import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export interface Reservation {
  id: string;
  status: string;
  expectedBytes: number;
  expiresAt: string;
}
export interface FileResult {
  fileId: string;
  objectId?: string;
  sizeBytes?: number;
  sha256?: string;
  status: 'ready';
  visibility: 'restricted';
  reused?: boolean;
}
export interface FileQuota {
  used: number;
  reserved: number;
  available: number;
  limit: number;
  currentFiles: number;
}
export interface FileAccess {
  key: string;
  status: string;
  fileId?: string;
  id: string;
  project: string;
  version: string;
  path: string;
  extension: string;
  expected: number;
}
export interface ReuseObject {
  id: string;
  key: string;
  size: number;
  sha256: string;
}
export function createFileRepository(url: string) {
  const db = createRuntimeDatabase(url);
  async function value<T>(
    sql: string,
    params: unknown[],
    scope?: TransactionScope,
  ): Promise<T> {
    return (await (scope ?? db).query<{ value: T }>(sql, params))[0]!.value;
  }
  const identity = (actor: AccountView) => [actor.id, actor.sessionId];
  return {
    reserve: (
      actor: AccountView,
      project: string,
      version: string,
      path: string,
      extension: string,
      expected: number,
      correlation: string,
    ) =>
      value<Reservation>(
        'SELECT app.file_reserve($1,$2,$3,$4,$5,$6,$7,$8) value',
        [
          ...identity(actor),
          project,
          version,
          path,
          extension,
          expected,
          correlation,
        ],
      ),
    quota: (actor: AccountView, project: string, version: string) =>
      value<FileQuota>('SELECT app.file_quota($1,$2,$3,$4) value', [
        ...identity(actor),
        project,
        version,
      ]),
    access: (actor: AccountView, id: string, scope: TransactionScope) =>
      value<FileAccess>(
        'SELECT app.file_access($1,$2,$3) value',
        [...identity(actor), id],
        scope,
      ),
    reuse: (
      actor: AccountView,
      id: string,
      size: number,
      sha256: string,
      scope: TransactionScope,
    ) =>
      value<ReuseObject | null>(
        'SELECT app.file_reuse($1,$2,$3,$4,$5) value',
        [...identity(actor), id, size, sha256],
        scope,
      ),
    finalize: (
      actor: AccountView,
      id: string,
      size: number,
      sha256: string,
      mime: string,
      reuse: string | null,
      scope: TransactionScope,
    ) =>
      value<FileResult>(
        'SELECT app.file_finalize($1,$2,$3,$4,$5,$6,$7) value',
        [...identity(actor), id, size, sha256, mime, reuse],
        scope,
      ),
    end: (
      actor: AccountView,
      id: string,
      op: 'cancelled' | 'failed' | 'touch',
    ) =>
      value<{ id: string; status: string }>(
        'SELECT app.file_end($1,$2,$3,$4) value',
        [...identity(actor), id, op],
      ),
    cleanup: async (
      actor: AccountView,
      project: string,
      version: string,
      scope: TransactionScope,
    ) =>
      (
        await scope.query<{ id: string }>(
          'SELECT app.file_cleanup($1,$2,$3,$4) id',
          [...identity(actor), project, version],
        )
      ).map((x) => x.id),
    transaction: db.transactions.run.bind(db.transactions),
    close: () => db.close(),
  };
}
