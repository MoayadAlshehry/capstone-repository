import 'server-only';
import { DatabaseError } from '@capstone/db';
import { createHash } from 'node:crypto';
import { createEditionRepository } from '@capstone/db/editions';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import { submissionUuid } from './submissions.js';
import type {
  EditionHistory,
  SuccessorCommand,
  VisibilityCommand,
  SuccessorResult,
} from './editions.js';
export class EditionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const hash = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const revision = (r: number) => Number.isSafeInteger(r) && r >= 0;
export function createEditionEngine(url: string, storage: NativeStorage) {
  const db = createEditionRepository(url);
  return {
    history: (a: AccountView, p: string) => db.history<EditionHistory>(a, p),
    policy: (a: AccountView, p: string, v: string) =>
      db.policy<{
        version: string;
        state: string;
        files: {
          file: string;
          visibility: string;
          externallyPublic: boolean;
          requiresRestrictedAccess: boolean;
        }[];
      }>(a, p, v),
    async create(a: AccountView, c: SuccessorCommand) {
      if (
        ![c.project, c.base, c.command].every(submissionUuid) ||
        !revision(c.assignmentRevision)
      )
        throw new EditionError('INVALID_INPUT');
      const digest = hash([
        'successor',
        c.project,
        c.base,
        c.assignmentRevision,
      ]);
      return db.transaction(async (tx) => {
        const prep = await db.prepare(
          a,
          c.project,
          c.base,
          c.assignmentRevision,
          c.command,
          digest,
          tx,
        );
        if (prep.completed)
          return JSON.parse(prep.completed) as SuccessorResult;
        for (const f of prep.files)
          if (
            !(await storage.verify(f.key, {
              size: Number(f.size),
              sha256: f.sha256,
            }))
          )
            throw new EditionError('EVIDENCE_UNAVAILABLE');
        return db.commit<SuccessorResult>(
          a,
          c.project,
          c.base,
          c.assignmentRevision,
          c.command,
          digest,
          tx,
        );
      });
    },
    async visibility(a: AccountView, c: VisibilityCommand) {
      if (
        ![c.project, c.version, c.file, c.command].every(submissionUuid) ||
        !revision(c.revision) ||
        !['public', 'restricted'].includes(c.visibility)
      )
        throw new EditionError('INVALID_INPUT');
      return db
        .visibility<{
          file: string;
          visibility: string;
          revision: number;
          externallyPublic: boolean;
        }>(
          a,
          c.project,
          c.version,
          c.file,
          c.revision,
          c.visibility,
          c.command,
          hash([
            'visibility',
            c.project,
            c.version,
            c.file,
            c.revision,
            c.visibility,
          ]),
        )
        .catch((error) => {
          if (error instanceof DatabaseError && error.sqlState === 'P1021')
            throw new EditionError('REVIEWED_SUCCESSOR_REQUIRED');
          throw error;
        });
    },
    async visibilityBatch(
      a: AccountView,
      c: {
        project: string;
        version: string;
        files: Omit<VisibilityCommand, 'project' | 'version'>[];
      },
    ) {
      if (
        ![c.project, c.version].every(submissionUuid) ||
        !Array.isArray(c.files) ||
        !c.files.length ||
        c.files.length > 100 ||
        new Set(c.files.map((f) => f.file)).size !== c.files.length ||
        new Set(c.files.map((f) => f.command)).size !== c.files.length ||
        c.files.some(
          (f) =>
            ![f.file, f.command].every(submissionUuid) ||
            !revision(f.revision) ||
            !['public', 'restricted'].includes(f.visibility),
        )
      )
        throw new EditionError('INVALID_INPUT');
      return db.transaction(async (tx) => {
        const history = await db.history<EditionHistory>(a, c.project, tx),
          edition = history.items.find((v) => v.id === c.version);
        if (
          !history.lead ||
          history.currentVersion !== c.version ||
          !edition ||
          !['draft', 'revision_required'].includes(edition.status)
        )
          throw new EditionError('WORKING_LEAD_REQUIRED');
        const results = [];
        for (const f of [...c.files].sort((x, y) =>
          x.file.localeCompare(y.file),
        )) {
          const result = await db.visibility<{
            file: string;
            visibility: string;
            revision: number;
            externallyPublic: boolean;
          }>(
            a,
            c.project,
            c.version,
            f.file,
            f.revision,
            f.visibility,
            f.command,
            hash([
              'visibility',
              c.project,
              c.version,
              f.file,
              f.revision,
              f.visibility,
            ]),
            tx,
          );
          results.push({ ...result, command: f.command });
        }
        return {
          project: c.project,
          version: c.version,
          files: results,
          atomic: true,
        };
      });
    },
    close: db.close,
  };
}
