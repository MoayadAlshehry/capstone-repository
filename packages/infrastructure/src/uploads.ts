import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Readable } from 'node:stream';
import { tusNode, type TusUpload } from './tus-node.js';
const { Server, DataStore, Upload } = tusNode;
import { createAuthentication, type AccountView } from '@capstone/db/auth';
import { createUploadRepository } from '@capstone/db/uploads';
import { createNativeStorage } from '@capstone/storage/native';
import {
  createTransferStorage,
  TransferStorageError,
} from '@capstone/storage/transfers';
import type { NativeStorage } from '@capstone/storage/native';
import { ContentError } from '@capstone/storage/content';
import { createFileEngine } from '@capstone/domain/files-engine';
import {
  admittedPath,
  admittedSize,
  FILE_BYTES,
  FilePolicyError,
} from '@capstone/domain';
export interface UploadRuntimeConfig {
  databaseUrl: string;
  secret: string;
  baseURL: string;
  localPublicOrigin?: string;
  storageRoot: string;
  workspaceRoot: string;
  environment: 'local' | 'test' | 'production';
  origins: string[];
}
class ProtocolError extends Error {
  constructor(
    readonly status_code: number,
    readonly code: string,
  ) {
    super(code);
  }
  get body() {
    return JSON.stringify({ error: this.code });
  }
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
export async function createUploadRuntime(
  config: UploadRuntimeConfig,
  ports?: {
    objects?: NativeStorage;
    transfers?: Awaited<ReturnType<typeof createTransferStorage>>;
  },
) {
  const auth = createAuthentication({
      databaseUrl: config.databaseUrl,
      secret: config.secret,
      baseURL: config.baseURL,
      environment: config.environment,
      ...(config.localPublicOrigin
        ? { localPublicOrigin: config.localPublicOrigin }
        : {}),
    }),
    repo = createUploadRepository(config.databaseUrl),
    objects =
      ports?.objects ??
      (await createNativeStorage(
        config.storageRoot,
        config.workspaceRoot,
        config.environment,
      )),
    transfers =
      ports?.transfers ??
      (await createTransferStorage(
        join(config.storageRoot, 'transfers'),
        config.workspaceRoot,
        config.environment,
      )),
    engine = createFileEngine(config.databaseUrl, objects);
  const context = new AsyncLocalStorage<{
    actor: AccountView;
    request: IncomingMessage;
  }>();
  function current() {
    const c = context.getStore();
    if (!c) throw new ProtocolError(401, 'UNAUTHENTICATED');
    return c;
  }
  async function protectedUpload(id: string, completed = true) {
    const c = current();
    return repo.transaction(async (tx) => {
      const r = await repo.access(c.actor, id, tx, completed);
      if (r.status === 'active') {
        await transfers.ensureOffset(r.key, r.offset);
        await repo.advance(c.actor, id, r.offset, r.offset, tx);
      }
      return r;
    });
  }
  class Store extends DataStore {
    constructor() {
      super();
      this.extensions = ['creation', 'termination'];
    }
    override async create(upload: TusUpload) {
      const c = current(),
        m = upload.metadata ?? {};
      if (
        Object.keys(m).some(
          (k) =>
            ![
              'project',
              'version',
              'path',
              'correlation',
              'fingerprint',
            ].includes(k),
        ) ||
        !uuid(m.project) ||
        !uuid(m.version) ||
        !uuid(m.correlation) ||
        typeof m.path !== 'string' ||
        typeof m.fingerprint !== 'string' ||
        m.fingerprint.length > 300
      )
        throw new ProtocolError(400, 'INVALID_METADATA');
      const path = admittedPath(m.path);
      const size = admittedSize(upload.size ?? -1);
      const made = await repo.create(
        c.actor,
        upload.id,
        m.project,
        m.version,
        path.path,
        path.extension,
        size,
        m.correlation,
        m.fingerprint,
      );
      upload.id = made.id;
      upload.metadata = {};
      if (size === 0 && made.status === 'active')
        await this.write(
          (await import('node:stream')).Readable.from([]),
          made.id,
          0,
        );
      return upload;
    }
    override async getUpload(id: string) {
      if (!uuid(id)) throw new ProtocolError(404, 'NOT_FOUND');
      const r = await protectedUpload(id);
      return new Upload({
        id: r.id,
        size: r.expected,
        offset: r.offset,
        metadata: {},
      });
    }
    override async write(stream: Readable, id: string, offset: number) {
      const c = current();
      let stage: string = 'access',
        failure: unknown,
        transferKey: string | undefined;
      try {
        const result = await repo.transaction(async (tx) => {
          const r = await repo.access(c.actor, id, tx);
          transferKey = r.key;
          if (r.offset !== offset) {
            failure = new ProtocolError(409, 'OFFSET_CONFLICT');
            throw failure;
          }
          stage = 'write';
          const header = c.request.headers['content-length'];
          const declared = typeof header === 'string' ? Number(header) : null;
          let next: number;
          try {
            next = await transfers.append(
              r.key,
              r.offset,
              r.expected,
              stream,
              declared,
            );
          } catch (e) {
            failure = e;
            throw e;
          }
          if (c.request.aborted || (!c.request.complete && declared !== 0))
            throw new TransferStorageError('INTERRUPTED');
          await repo.advance(c.actor, id, r.offset, next, tx);
          if (next === r.expected) {
            stage = 'finalize';
            try {
              const out = await engine.finalizeInScope(
                c.actor,
                r.reservation,
                transfers.chunks(r.key),
                tx,
              );
              await repo.complete(c.actor, id, out.fileId, tx);
            } catch (e) {
              failure = e;
              throw e;
            }
          }
          return { next, finished: next === r.expected };
        });
        if (result.finished && transferKey)
          await transfers.remove(transferKey).catch(() => {});
        return result.next;
      } catch (e) {
        if (failure instanceof ProtocolError) throw failure;
        if (
          stage === 'finalize' ||
          failure instanceof ContentError ||
          (failure instanceof TransferStorageError &&
            failure.code === 'STORAGE_FAILURE')
        )
          await repo.end(c.actor, id, 'failed').catch(() => {});
        if (failure instanceof ContentError)
          throw new ProtocolError(422, failure.code);
        if (failure instanceof TransferStorageError)
          throw new ProtocolError(
            failure.code === 'BYTE_LIMIT' ? 413 : 409,
            failure.code,
          );
        throw e;
      }
    }
    override async remove(id: string) {
      const c = current(),
        out = await repo.end(c.actor, id, 'cancelled');
      if (out.status === 'completed')
        throw new ProtocolError(409, 'ALREADY_COMPLETED');
      await transfers.remove(out.key);
    }
  }
  const tus = new Server({
    path: '/files/tus',
    datastore: new Store(),
    namingFunction: () => randomUUID(),
    relativeLocation: true,
    respectForwardedHeaders: false,
    maxSize: FILE_BYTES,
    disableTerminationForFinishedUploads: true,
    allowedCredentials: true,
    allowedOrigins: config.origins,
    onIncomingRequest: async (req, id) => {
      if (req.method !== 'POST') await protectedUpload(id, true);
    },
    onResponseError: (_req, e) => {
      if (e instanceof ProtocolError)
        return { status_code: e.status_code, body: e.body };
      if (e instanceof FilePolicyError)
        return {
          status_code: 400,
          body: JSON.stringify({ error: 'FILE_POLICY', issues: e.issues }),
        };
      const value = e as { status_code?: number; body?: string };
      if (
        value.status_code &&
        [400, 404, 409, 413, 415].includes(value.status_code)
      )
        return {
          status_code: value.status_code,
          body: JSON.stringify({
            error:
              value.status_code === 409
                ? 'OFFSET_CONFLICT'
                : 'PROTOCOL_REJECTED',
          }),
        };
      const state =
        (e as { sqlState?: string; code?: string }).sqlState ??
        (e as { code?: string }).code;
      return {
        status_code:
          state === 'P0002'
            ? 404
            : state === '42501'
              ? 403
              : state === '22023' || state === '23505'
                ? 400
                : 500,
        body: JSON.stringify({
          error:
            state === 'P0002'
              ? 'NOT_FOUND'
              : state === '42501'
                ? 'FORBIDDEN'
                : state === '22023' || state === '23505'
                  ? 'ADMISSION_REJECTED'
                  : 'UPLOAD_FAILED',
        }),
      };
    },
  });
  function jsonResponse(res: ServerResponse, status: number, value: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(value));
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', randomUUID());
    try {
      const url = new URL(req.url ?? '/', config.baseURL);
      if (req.method === 'GET' && url.pathname === '/health/live') {
        jsonResponse(res, 200, {
          service: 'upload',
          status: 'alive',
          phase: 'PHASE_15',
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/health/ready') {
        await repo.ready();
        await objects.guardRoot!();
        jsonResponse(res, 200, {
          service: 'upload',
          status: 'infrastructure-ready',
          phase: 'PHASE_15',
          protocol: 'tus/1.0.0',
        });
        return;
      }
      let origin = req.headers.origin;
      if (
        !origin &&
        ['GET', 'HEAD'].includes(req.method ?? '') &&
        ['same-origin', 'same-site'].includes(
          String(req.headers['sec-fetch-site']),
        ) &&
        typeof req.headers.referer === 'string'
      ) {
        try {
          origin = new URL(req.headers.referer).origin;
        } catch {
          /* deny */
        }
      }
      if (typeof origin !== 'string' || !config.origins.includes(origin)) {
        throw new ProtocolError(403, 'UNTRUSTED_ORIGIN');
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS' && url.pathname.startsWith('/files/tus')) {
        await tus.handle(req, res);
        return;
      }
      const headers = new Headers();
      for (const [name, v] of Object.entries(req.headers))
        if (typeof v === 'string') headers.set(name, v);
      const actor = await auth.account(headers);
      if (!actor) throw new ProtocolError(401, 'UNAUTHENTICATED');
      await context.run({ actor, request: req }, async () => {
        if (req.method === 'GET' && url.pathname === '/files/state') {
          const p = url.searchParams.get('project'),
            v = url.searchParams.get('version');
          if (
            !uuid(p) ||
            !uuid(v) ||
            [...url.searchParams.keys()].some(
              (k) => !['project', 'version'].includes(k),
            )
          )
            throw new ProtocolError(400, 'INVALID_TARGET');
          jsonResponse(res, 200, await repo.view(actor, p, v));
          return;
        }
        if (req.method === 'POST' && url.pathname === '/files/cleanup') {
          const p = url.searchParams.get('project'),
            v = url.searchParams.get('version');
          if (!uuid(p) || !uuid(v))
            throw new ProtocolError(400, 'INVALID_TARGET');
          const cleaned = await repo.transaction(async (tx) => {
            const keys = await repo.cleanup(actor, p, v, tx);
            for (const key of keys) await transfers.remove(key);
            return keys.length;
          });
          await engine.cleanup(actor, p, v);
          jsonResponse(res, 200, { cleaned });
          return;
        }
        if (
          !/^\/files\/tus(?:\/[a-f0-9-]{36})?$/i.test(url.pathname) ||
          url.search ||
          !['POST', 'HEAD', 'PATCH', 'DELETE'].includes(req.method ?? '')
        )
          throw new ProtocolError(404, 'NOT_FOUND');
        for (const name of [
          'upload-length',
          'upload-offset',
          'content-length',
        ]) {
          const v = req.headers[name];
          if (
            v !== undefined &&
            (typeof v !== 'string' ||
              !/^\d+$/.test(v) ||
              !Number.isSafeInteger(Number(v)))
          )
            throw new ProtocolError(400, 'INVALID_NUMBER');
        }
        if (
          req.method === 'PATCH' &&
          Number(req.headers['content-length'] ?? 0) > 5000000
        )
          throw new ProtocolError(413, 'CHUNK_LIMIT');
        if (
          typeof req.headers['upload-metadata'] === 'string' &&
          Buffer.byteLength(req.headers['upload-metadata']) > 8000
        )
          throw new ProtocolError(400, 'METADATA_LIMIT');
        await tus.handle(req, res);
      });
    } catch (e) {
      if (res.headersSent || res.destroyed) return;
      const mapped = await tus.options.onResponseError!(
        null as never,
        e as Error,
      );
      jsonResponse(
        res,
        mapped?.status_code ?? 500,
        JSON.parse(mapped?.body ?? '{"error":"UPLOAD_FAILED"}'),
      );
    }
  }
  return {
    handle,
    close: async () => {
      await engine.close();
      await repo.close();
      await auth.close();
    },
    cleanup: async (a: AccountView, p: string, v: string) => {
      const n = await repo.transaction(async (tx) => {
        const keys = await repo.cleanup(a, p, v, tx);
        for (const key of keys) await transfers.remove(key);
        return keys.length;
      });
      await engine.cleanup(a, p, v);
      return n;
    },
  };
}
