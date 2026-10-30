import 'server-only';
import { createHash } from 'node:crypto';
import { createPublicationRepository } from '@capstone/db/publications';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import { submissionUuid } from './submissions.js';
import type {
  PublicationCommand,
  PublicationResult,
  PublicationState,
  PublicationProjection,
  ArchiveItem,
  AuditFilter,
  AuditItem,
} from './publications.js';
export class PublicationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function createPublicationEngine(url: string, storage: NativeStorage) {
  const db = createPublicationRepository(url);
  return {
    state: (a: AccountView, s: string) => db.state<PublicationState>(a, s),
    projection: (p: string) => db.projection<PublicationProjection>(p),
    archive: (a: AccountView) => db.archive<{ items: ArchiveItem[] }>(a),
    audit: (a: AccountView, filters: AuditFilter, reason = '') =>
      db.audit<{ items: AuditItem[]; offset: number; limit: number }>(
        a,
        filters,
        reason,
      ),
    async publish(a: AccountView, c: PublicationCommand) {
      if (
        !submissionUuid(c.submission) ||
        !submissionUuid(c.command) ||
        !Number.isSafeInteger(c.revision) ||
        c.revision < 0 ||
        !Number.isSafeInteger(c.assignmentRevision) ||
        c.assignmentRevision < 0
      )
        throw new PublicationError('INVALID_INPUT');
      const digest = createHash('sha256')
        .update(
          JSON.stringify([
            'publish',
            c.submission,
            c.revision,
            c.assignmentRevision,
          ]),
        )
        .digest('hex');
      let failure: PublicationError | undefined;
      try {
        return await db.transaction(async (tx) => {
          const prepared = await db.prepare(
            a,
            c.submission,
            c.revision,
            c.assignmentRevision,
            c.command,
            digest,
            tx,
          );
          if (prepared.completed)
            return JSON.parse(prepared.completed) as PublicationResult;
          for (const f of prepared.files)
            if (
              !(await storage.verify(f.key, {
                size: Number(f.size),
                sha256: f.sha256,
              }))
            ) {
              failure = new PublicationError('EVIDENCE_UNAVAILABLE');
              throw failure;
            }
          return db.commit<PublicationResult>(
            a,
            c.submission,
            c.revision,
            c.assignmentRevision,
            c.command,
            digest,
            tx,
          );
        });
      } catch (e) {
        throw failure ?? e;
      }
    },
    close: db.close,
  };
}
