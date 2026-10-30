import 'server-only';
import { createRuntimeDatabase, DatabaseError } from './index.js';
import type { AccountView } from './auth.js';
export type FileReaderContext =
  | { kind: 'public' }
  | { kind: 'committee-guest'; invitation: string; sessionHash: string }
  | { kind: 'internal' | 'internal-zip'; actor: AccountView }
  | { kind: 'partner-grant'; actor?: AccountView; grant?: string }
  | { kind: 'review-packet'; actor?: AccountView; assignment?: string };
export type NativeReader = AccountView | FileReaderContext;
export interface NativeReadRecord {
  id: string;
  project: string;
  version: string;
  path: string;
  name: string;
  extension: string;
  mime: string;
  size: number;
  sha256: string;
  visibility: string;
  status: string;
  uploader: string;
  uploaderRole: string;
  uploadedAt: string;
  uploadedLicense?: boolean;
  key?: string;
  packetIntegrity?: { key: string; size: number; sha256: string }[];
}
export function createNativeReadRepository(url: string) {
  const db = createRuntimeDatabase(url);
  async function read(
    actor: NativeReader,
    project: string,
    version: string,
    file?: string,
    submission?: string,
  ) {
    const context: FileReaderContext =
      'kind' in actor ? actor : { kind: 'internal', actor };
    const account = 'actor' in context ? context.actor : null;
    if (context.kind === 'committee-guest') {
      const scope = (
        await db.query<{
          value: {
            project: string;
            version: string;
            submission: string;
            files: NativeReadRecord[];
          };
        }>('SELECT app.committee_file_scope($1,$2,$3) value', [
          context.invitation,
          context.sessionHash,
          file ?? null,
        ])
      )[0]!.value;
      if (
        scope.project !== project ||
        scope.version !== version ||
        (submission && scope.submission !== submission)
      )
        throw new DatabaseError('NOT_FOUND', 'P0002');
      const files = scope.files.map((f) => ({
        ...f,
        project,
        version,
        visibility: 'Restricted',
        status: 'ready',
      }));
      return file ? files[0]! : { files };
    }
    return (
      await db.query<{
        value: NativeReadRecord | { files: NativeReadRecord[] };
      }>('SELECT app.file_delivery_read($1,$2,$3,$4,$5,$6,$7,$8) AS value', [
        context.kind,
        account?.id ?? null,
        account?.sessionId ?? null,
        project,
        version,
        file ?? null,
        submission ?? null,
        context.kind === 'partner-grant'
          ? (context.grant ?? null)
          : context.kind === 'review-packet'
            ? (context.assignment ?? null)
            : null,
      ])
    )[0]!.value;
  }
  return {
    async list(
      actor: NativeReader,
      project: string,
      version: string,
      submission?: string,
    ) {
      return (
        (await read(actor, project, version, undefined, submission)) as {
          files: NativeReadRecord[];
        }
      ).files;
    },
    async file(
      actor: NativeReader,
      project: string,
      version: string,
      file: string,
      submission?: string,
    ) {
      return (await read(
        actor,
        project,
        version,
        file,
        submission,
      )) as NativeReadRecord & {
        key: string;
      };
    },
    close: () => db.close(),
  };
}
