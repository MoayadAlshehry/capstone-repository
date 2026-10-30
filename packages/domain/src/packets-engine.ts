import 'server-only';
import { createHash } from 'node:crypto';
import { createPacketRepository } from '@capstone/db/packets';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import {
  canonicalPacket,
  packetDraftIssues,
  normalizedPacketDraft,
  type PacketDraft,
  type PacketState,
} from './packets.js';
import { submissionUuid } from './submissions.js';
export const packetHash = (value: unknown) =>
  createHash('sha256').update(canonicalPacket(value)).digest('hex');
export class PacketError extends Error {
  constructor(
    readonly code: string,
    readonly issues: string[] = [],
  ) {
    super(code);
  }
}
export function createPacketEngine(url: string, storage: NativeStorage) {
  const r = createPacketRepository(url);
  const ids = (...v: string[]) => {
    if (v.some((x) => !submissionUuid(x)))
      throw new PacketError('INVALID_INPUT');
  };
  const rev = (v: number) => {
    if (!Number.isSafeInteger(v) || v < 0)
      throw new PacketError('INVALID_INPUT');
  };
  async function readiness(
    a: AccountView,
    p: string,
    v: string,
    packet: string | null,
  ): Promise<PacketState['readiness']> {
    if (!packet) return { state: 'not-authorized', assignmentReady: false };
    ids(p, v, packet);
    const result = await r.readability(a, p, v, packet);
    let state = result.state as PacketState['readiness']['state'];
    if (state === 'ready') {
      try {
        for (const f of result.files ?? [])
          if (
            !(await storage.verify(f.key, {
              size: Number(f.size),
              sha256: f.sha256,
            }))
          ) {
            state = 'evidence-unavailable';
            break;
          }
      } catch {
        state = 'evidence-unavailable';
      }
    }
    return { state, assignmentReady: state === 'ready' };
  }
  return {
    async fullFinalView(a: AccountView, p: string, v: string) {
      ids(p, v);
      return r.fullFinalView(a, p, v);
    },
    async authorizeFinal(
      a: AccountView,
      c: {
        project: string;
        version: string;
        revision: number;
        hash: string;
        acknowledged: boolean;
        command: string;
      },
    ) {
      ids(c.project, c.version, c.command);
      rev(c.revision);
      if (c.acknowledged !== true || !/^[a-f0-9]{64}$/.test(c.hash))
        throw new PacketError('CONSENT_REQUIRED');
      return r.authorizeFinal(a, c, async (files) => {
        if (!files.length) throw new PacketError('EVIDENCE_UNAVAILABLE');
        for (const file of files)
          if (
            !(await storage.verify(file.key, {
              size: Number(file.size),
              sha256: file.sha256,
            }))
          )
            throw new PacketError('EVIDENCE_UNAVAILABLE');
      });
    },
    async view(a: AccountView, p: string, v: string) {
      ids(p, v);
      const state = await r.view<PacketState>(a, p, v);
      state.readiness = await readiness(a, p, v, state.current);
      return state;
    },
    readiness,
    async save(
      a: AccountView,
      c: {
        project: string;
        version: string;
        case: string;
        revision: number;
        body: PacketDraft;
        command: string;
      },
    ) {
      ids(c.project, c.version, c.case, c.command);
      rev(c.revision);
      const issues = packetDraftIssues(c.body);
      if (issues.length) throw new PacketError('INVALID_PACKET', issues);
      return r.save(
        a,
        c.project,
        c.version,
        c.case,
        c.revision,
        normalizedPacketDraft(c.body),
        c.command,
      );
    },
    async authorize(
      a: AccountView,
      c: {
        project: string;
        version: string;
        case: string;
        revision: number;
        hash: string;
        supersedes: string | null;
        command: string;
      },
    ) {
      ids(
        c.project,
        c.version,
        c.case,
        c.command,
        ...(c.supersedes ? [c.supersedes] : []),
      );
      rev(c.revision);
      if (!/^[0-9a-f]{64}$/.test(c.hash))
        throw new PacketError('INVALID_INPUT');
      let failure: PacketError | undefined;
      try {
        return await r.transaction(async (tx) => {
          const prepared = await r.prepare(
            a,
            c.project,
            c.version,
            c.case,
            c.revision,
            c.hash,
            c.supersedes,
            c.command,
            tx,
          );
          if (prepared.completed) return prepared.completed;
          if (packetHash(prepared.manifest) !== prepared.hash) {
            failure = new PacketError('INVALID_MANIFEST');
            throw failure;
          }
          for (const f of prepared.files) {
            try {
              if (
                !(await storage.verify(f.key, {
                  size: Number(f.size),
                  sha256: f.sha256,
                }))
              )
                throw Error();
            } catch {
              failure = new PacketError('EVIDENCE_UNAVAILABLE');
              throw failure;
            }
          }
          return r.commit(
            a,
            c.project,
            c.version,
            c.case,
            c.revision,
            c.hash,
            c.supersedes,
            c.command,
            tx,
          );
        });
      } catch (e) {
        throw failure ?? e;
      }
    },
    async revoke(
      a: AccountView,
      c: {
        project: string;
        version: string;
        packet: string;
        revision: number;
        reason: string;
        command: string;
      },
    ) {
      ids(c.project, c.version, c.packet, c.command);
      rev(c.revision);
      if (
        typeof c.reason !== 'string' ||
        [...c.reason.trim()].length < 3 ||
        [...c.reason.trim()].length > 400 ||
        /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(c.reason)
      )
        throw new PacketError('INVALID_INPUT');
      return r.revoke(
        a,
        c.project,
        c.version,
        c.packet,
        c.revision,
        c.command,
        c.reason.trim(),
      );
    },
    close: r.close,
  };
}
