import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export interface UploadAccess {
  id: string;
  status: string;
  offset: number;
  expected: number;
  reservation: string;
  key: string;
  project: string;
  version: string;
  path: string;
  fingerprint: string;
  fileId?: string;
}
export interface UploadView {
  canUpload: boolean;
  quota: { used: number; reserved: number; available: number; limit: number };
  files: {
    id: string;
    path: string;
    mime: string;
    size: number;
    sha256: string;
    visibility: string;
    uploader: string;
    uploaderRole: string;
    uploadedAt: string;
  }[];
  transfers: {
    id: string;
    path: string;
    size: number;
    offset: number;
    status: string;
    fingerprint: string;
    expiresAt: string;
    fileId: string | null;
  }[];
}
export function createUploadRepository(url: string) {
  const db = createRuntimeDatabase(url),
    who = (a: AccountView) => [a.id, a.sessionId];
  async function value<T>(sql: string, args: unknown[], tx?: TransactionScope) {
    return (await (tx ?? db).query<{ value: T }>(sql, args))[0]!.value;
  }
  return {
    create: (
      a: AccountView,
      id: string,
      p: string,
      v: string,
      path: string,
      ext: string,
      size: number,
      correlation: string,
      fingerprint: string,
    ) =>
      value<{ id: string; status: string }>(
        'SELECT app.upload_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) value',
        [...who(a), id, p, v, path, ext, size, correlation, fingerprint],
      ),
    access: (
      a: AccountView,
      id: string,
      tx: TransactionScope,
      completed = false,
    ) =>
      value<UploadAccess>(
        'SELECT app.upload_access($1,$2,$3,$4) value',
        [...who(a), id, completed],
        tx,
      ),
    advance: (
      a: AccountView,
      id: string,
      old: number,
      next: number,
      tx: TransactionScope,
    ) =>
      value<{ offset: number }>(
        'SELECT app.upload_advance($1,$2,$3,$4,$5) value',
        [...who(a), id, old, next],
        tx,
      ),
    complete: (
      a: AccountView,
      id: string,
      file: string,
      tx: TransactionScope,
    ) =>
      tx.query('SELECT app.upload_complete($1,$2,$3,$4)', [
        ...who(a),
        id,
        file,
      ]),
    end: (a: AccountView, id: string, op: 'failed' | 'cancelled') =>
      value<{ key: string; status: string }>(
        'SELECT app.upload_end($1,$2,$3,$4) value',
        [...who(a), id, op],
      ),
    view: (a: AccountView, p: string, v: string) =>
      value<UploadView>('SELECT app.upload_view($1,$2,$3,$4) value', [
        ...who(a),
        p,
        v,
      ]),
    cleanup: async (
      a: AccountView,
      p: string,
      v: string,
      tx: TransactionScope,
    ) =>
      (
        await tx.query<{ key: string }>(
          'SELECT app.upload_cleanup($1,$2,$3,$4) key',
          [...who(a), p, v],
        )
      ).map((x) => x.key),
    transaction: <T>(fn: (tx: TransactionScope) => Promise<T>) =>
      db.transactions.run(async (tx) => {
        await tx.query("SET LOCAL statement_timeout='30s'");
        return fn(tx);
      }),
    ready: () => db.ready(),
    close: () => db.close(),
  };
}
