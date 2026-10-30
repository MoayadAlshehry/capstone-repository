import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import {
  createPrivateStorage,
  type StoredObjectDescriptor,
} from '@capstone/storage';
import { createVisualMediaRepository } from '@capstone/db/visual-media';
import type { AccountView } from '@capstone/db/auth';
import { DatabaseError } from '@capstone/db';
import {
  visualKey,
  visualWriteSchema,
  type VisualState,
  type VisualTarget,
} from '@capstone/domain';
import { normalizeVisualImage } from './visual-images.js';

interface RawState extends Omit<VisualState, 'image'> {
  image: Omit<NonNullable<VisualState['image']>, 'src' | 'smallSrc'> | null;
  objects?: { main: Part; small: Part };
}
interface Part {
  key: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}
interface Receipt {
  target: VisualTarget;
  revision: number;
  asset: string | null;
}
export class VisualMediaError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function createVisualMedia(config: {
  databaseUrl: string;
  storageRoot: string;
  workspaceRoot: string;
  environment: 'local' | 'test' | 'production';
}) {
  const repo = createVisualMediaRepository(config.databaseUrl);
  const storageRoot = join(config.storageRoot, 'visual-media');
  let storePromise: ReturnType<typeof createPrivateStorage> | undefined;
  const storage = () =>
    (storePromise ??= createPrivateStorage(storageRoot, {
      workspaceRoot: config.workspaceRoot,
      environment: config.environment,
    }));
  function present(target: VisualTarget, state: RawState): VisualState {
    const params = new URLSearchParams({
      target: visualKey(target),
      asset: state.image?.id ?? '',
    });
    return {
      revision: state.revision,
      canEdit: state.canEdit,
      image: state.image
        ? {
            ...state.image,
            src: '/api/visual-media/image?' + params,
            smallSrc: '/api/visual-media/image?' + params + '&size=small',
          }
        : null,
    };
  }
  async function read(actor: AccountView | null, target: VisualTarget) {
    return present(target, await repo.read<RawState>(actor, target));
  }
  return {
    read,
    async write(actor: AccountView, input: unknown, bytes: Uint8Array | null) {
      const command = visualWriteSchema.parse(input),
        target = command.target;
      const digest = createHash('sha256')
        .update(
          visualKey(target) +
            ':' +
            command.revision +
            ':' +
            (bytes
              ? createHash('sha256').update(bytes).digest('hex')
              : 'remove') +
            (command.framing ? ':' + JSON.stringify(command.framing) : ''),
        )
        .digest('hex');
      const previous = await repo.receipt<Receipt | null>(
        actor,
        command.command,
      );
      if (previous) {
        const result = await repo.write<Receipt>(
          actor,
          command.command,
          digest,
          target,
          command.revision,
          null,
        );
        return { receipt: result, state: await read(actor, target) };
      }
      const state = await read(actor, target);
      if (!state.canEdit) throw new VisualMediaError('MEDIA_READ_ONLY');
      if (state.revision !== command.revision)
        throw new VisualMediaError('MEDIA_CONFLICT');
      const id = randomUUID(),
        fresh: StoredObjectDescriptor[] = [];
      try {
        let asset: unknown = null;
        if (bytes) {
          const normalized = await normalizeVisualImage(
              bytes,
              target.kind,
              command.framing,
            ),
            store = await storage();
          const main = await store.write(normalized.main.data);
          fresh.push(main);
          const small = await store.write(normalized.small.data);
          fresh.push(small);
          const part = (
            d: StoredObjectDescriptor,
            info: { width: number; height: number },
          ) => ({
            key: d.objectId,
            bytes: Number(d.sizeBytes),
            sha256: d.sha256,
            width: info.width,
            height: info.height,
          });
          asset = {
            id,
            main: part(main, normalized.main.info),
            small: part(small, normalized.small.info),
          };
        }
        const result = await repo.write<Receipt>(
          actor,
          command.command,
          digest,
          target,
          command.revision,
          asset,
        );
        return { receipt: result, state: await read(actor, target) };
      } finally {
        if (fresh.length) {
          // Wait for any uncertain transaction before discarding only this operation's unregistered objects.
          try {
            if (!(await repo.registered(actor, id))) {
              const store = await storage();
              for (const object of fresh) {
                await store.stat(object.objectId);
                await unlink(join(storageRoot, object.objectId));
              }
            }
          } catch {
            /* Keep uncertain private objects; never risk deleting committed media. */
          }
        }
      }
    },
    async receipt(actor: AccountView, command: string) {
      const result = await repo.receipt<Receipt | null>(actor, command);
      return result
        ? { receipt: result, state: await read(actor, result.target) }
        : null;
    },
    async bytes(
      actor: AccountView | null,
      target: VisualTarget,
      asset: string,
      small: boolean,
    ) {
      const value = await repo.read<RawState>(actor, target, true);
      if (value.image?.id !== asset || !value.objects)
        throw new VisualMediaError('NOT_FOUND');
      const part = small ? value.objects.small : value.objects.main,
        store = await storage();
      const stream = await store.open({
        objectId: part.key,
        sizeBytes: BigInt(part.bytes),
        sha256: part.sha256,
      });
      const body = new Uint8Array(await new Response(stream).arrayBuffer());
      const current = await repo.read<RawState>(actor, target);
      if (current.image?.id !== asset) throw new VisualMediaError('NOT_FOUND');
      return body;
    },
    close: () => repo.close(),
  };
}
export function visualFailure(error: unknown): {
  status: number;
  code: string;
} {
  const code =
    error instanceof Error && 'code' in error ? String(error.code) : '';
  const state = error instanceof DatabaseError ? error.sqlState : '';
  if (state === 'P0002' || code === 'NOT_FOUND')
    return { status: 404, code: 'NOT_FOUND' };
  if (state === '42501' || code === 'MEDIA_READ_ONLY')
    return { status: 403, code: 'MEDIA_READ_ONLY' };
  if (state === '40001' || state === '23505' || code === 'MEDIA_CONFLICT')
    return { status: 409, code: 'MEDIA_CONFLICT' };
  if (state === 'PV001') return { status: 413, code: 'IMAGE_CAPACITY' };
  if (state === 'PV002') return { status: 429, code: 'IMAGE_RATE_LIMIT' };
  if (state === 'PV003') return { status: 409, code: 'COMMAND_CONFLICT' };
  if (code === 'IMAGE_BUSY') return { status: 503, code };
  if (code === 'IMAGE_SIZE') return { status: 413, code };
  if (code.startsWith('IMAGE_') || state === '22023' || state === '23514')
    return { status: 422, code: code || 'IMAGE_INVALID' };
  return { status: 503, code: 'MEDIA_UNAVAILABLE' };
}
