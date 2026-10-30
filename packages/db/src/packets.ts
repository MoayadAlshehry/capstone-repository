import 'server-only';
import { createRuntimeDatabase, type TransactionScope } from './index.js';
import type { AccountView } from './auth.js';
export function createPacketRepository(url: string) {
  const db = createRuntimeDatabase(url);
  const call = async <T>(
    name: string,
    values: unknown[],
    tx?: TransactionScope,
  ) =>
    (
      await (tx ?? db).query<{ value: T }>(
        `SELECT app.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')}) value`,
        values,
      )
    )[0]!.value;
  const who = (a: AccountView) => [a.id, a.sessionId];
  return {
    fullFinalView: (a: AccountView, p: string, v: string) =>
      call<Record<string, unknown> | null>('full_final_packet_state', [
        ...who(a),
        p,
        v,
      ]),
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
      verify: (
        files: { key: string; size: number; sha256: string }[],
      ) => Promise<void>,
    ) {
      return db.transactions.run(async (tx) => {
        const args = [
          ...who(a),
          c.project,
          c.version,
          c.revision,
          c.hash,
          c.acknowledged,
          c.command,
        ];
        const prepared = await call<{
          completed?: unknown;
          files?: { key: string; size: number; sha256: string }[];
        }>('full_final_packet_authorize', [...args, false], tx);
        if (prepared.completed) return prepared.completed;
        await verify(prepared.files ?? []);
        return (
          await call<{ completed: unknown }>(
            'full_final_packet_authorize',
            [...args, true],
            tx,
          )
        ).completed;
      });
    },
    view: <T>(a: AccountView, p: string, v: string) =>
      call<T>('packet_view', [...who(a), p, v]),
    save: (
      a: AccountView,
      p: string,
      v: string,
      c: string,
      revision: number,
      body: unknown,
      command: string,
    ) =>
      call<{ scope: string; row_version: number }>('packet_save', [
        ...who(a),
        p,
        v,
        c,
        revision,
        JSON.stringify(body),
        command,
      ]),
    prepare: (
      a: AccountView,
      p: string,
      v: string,
      c: string,
      revision: number,
      hash: string,
      supersedes: string | null,
      command: string,
      tx: TransactionScope,
    ) =>
      call<{
        completed?: { scope: string; row_version: number };
        manifest: unknown;
        hash: string;
        files: { key: string; size: number; sha256: string }[];
      }>(
        'packet_prepare',
        [...who(a), p, v, c, revision, hash, supersedes, command],
        tx,
      ),
    commit: (
      a: AccountView,
      p: string,
      v: string,
      c: string,
      revision: number,
      hash: string,
      supersedes: string | null,
      command: string,
      tx: TransactionScope,
    ) =>
      call<{ scope: string; row_version: number }>(
        'packet_commit',
        [...who(a), p, v, c, revision, hash, supersedes, command],
        tx,
      ),
    revoke: (
      a: AccountView,
      p: string,
      v: string,
      packet: string,
      revision: number,
      command: string,
      reason: string,
    ) =>
      call<{ scope: string; row_version: number }>('packet_revoke', [
        ...who(a),
        p,
        v,
        packet,
        revision,
        command,
        reason,
      ]),
    readability: (a: AccountView, p: string, v: string, packet: string) =>
      call<{
        state: string;
        files?: { key: string; size: number; sha256: string }[];
      }>('packet_readability', [...who(a), p, v, packet]),
    transaction: db.transactions.run.bind(db.transactions),
    close: () => db.close(),
  };
}
