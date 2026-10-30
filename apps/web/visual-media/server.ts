import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  visualTargetSchema,
  visualWriteSchema,
  IMAGE_UPLOAD_BYTES,
} from '@capstone/domain';
import {
  createVisualMedia,
  visualFailure,
} from '@capstone/infrastructure/visual-media';
import { currentAccount } from '../auth/server';
import { CredentialWindow } from '@capstone/db/auth';
const attempts = new CredentialWindow(Date.now, 12, 60000);
let activeUploads = 0;
let service: ReturnType<typeof createVisualMedia> | undefined;
export function visualMedia() {
  const environment = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(environment))
    throw Error('Invalid media environment');
  return (service ??= createVisualMedia({
    databaseUrl: process.env['DATABASE_URL'] ?? '',
    workspaceRoot: process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    storageRoot:
      process.env['PRIVATE_STORAGE_ROOT'] ?? process.cwd() + '/.local/storage',
    environment: environment as 'local' | 'test' | 'production',
  }));
}
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
const reply = (status: number, data: unknown) =>
  Response.json(data, { status, headers });
async function bounded(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('EMPTY_BODY');
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(part.value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    output.set(c, offset);
    offset += c.length;
  }
  return output;
}
export async function visualMediaHandler(
  request: Request,
  operation: 'resolve' | 'write' | 'image' | 'receipt',
) {
  let uploadSlot = false;
  try {
    const url = new URL(request.url),
      actor = await currentAccount(request.headers);
    if (operation === 'image') {
      if (!['GET', 'HEAD'].includes(request.method))
        return reply(405, { code: 'METHOD_NOT_ALLOWED' });
      if (
        [...url.searchParams.keys()].some(
          (k) =>
            !['target', 'asset', 'size'].includes(k) ||
            url.searchParams.getAll(k).length !== 1,
        ) ||
        !['small', null].includes(url.searchParams.get('size'))
      )
        return reply(400, { code: 'INVALID_TARGET' });
      const raw = url.searchParams.get('target') ?? '';
      if (raw.length > 1000) return reply(400, { code: 'INVALID_TARGET' });
      const target = visualTargetSchema.safeParse(JSON.parse(raw)),
        asset = z.uuid().safeParse(url.searchParams.get('asset'));
      if (!target.success || !asset.success)
        return reply(400, { code: 'INVALID_TARGET' });
      const origin = request.headers.get('origin');
      if (origin && origin !== process.env['AUTH_BASE_URL'])
        return reply(403, { code: 'FORBIDDEN' });
      const bytes = await visualMedia().bytes(
        actor,
        target.data,
        asset.data,
        url.searchParams.get('size') === 'small',
      );
      // Always authorize and recheck the current pointer before a conditional hit.
      // Private revalidation saves transfer without reviving a revoked public cover.
      const cacheable =
        target.data.kind === 'cover' && target.data.published === true;
      const etag = '"' + createHash('sha256').update(bytes).digest('hex') + '"';
      const imageHeaders = cacheable
        ? {
            ...headers,
            'Cache-Control': 'private, max-age=0, must-revalidate',
            ETag: etag,
          }
        : headers;
      if (cacheable && request.headers.get('if-none-match') === etag)
        return new Response(null, { status: 304, headers: imageHeaders });
      return new Response(request.method === 'HEAD' ? null : bytes, {
        headers: {
          ...imageHeaders,
          'Content-Type': 'image/webp',
          'Content-Length': String(bytes.length),
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }
    if (operation === 'receipt') {
      if (request.method !== 'GET')
        return reply(405, { code: 'METHOD_NOT_ALLOWED' });
      if (!actor) return reply(401, { code: 'UNAUTHENTICATED' });
      const command = z.uuid().safeParse(url.searchParams.get('command'));
      if (
        !command.success ||
        [...url.searchParams.keys()].some((k) => k !== 'command') ||
        url.searchParams.getAll('command').length !== 1
      )
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(200, {
        result: await visualMedia().receipt(actor, command.data),
      });
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (request.headers.get('origin') !== process.env['AUTH_BASE_URL'])
      return reply(403, { code: 'FORBIDDEN' });
    if (operation === 'resolve') {
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        return reply(400, { code: 'INVALID_INPUT' });
      const bytes = await bounded(request, 50000);
      if (!bytes) return reply(413, { code: 'BODY_LIMIT' });
      const parsed = z
        .object({ targets: z.array(visualTargetSchema).min(1).max(50) })
        .strict()
        .safeParse(JSON.parse(new TextDecoder().decode(bytes)));
      if (!parsed.success) return reply(400, { code: 'INVALID_TARGET' });
      const items = [];
      for (const target of parsed.data.targets) {
        try {
          items.push(await visualMedia().read(actor, target));
        } catch (e) {
          const failure = visualFailure(e);
          if (failure.status === 403 || failure.status === 404)
            items.push(null);
          else throw e;
        }
      }
      return reply(200, { items });
    }
    if (!actor) return reply(401, { code: 'UNAUTHENTICATED' });
    if (!attempts.attempt(actor.id))
      return reply(429, { code: 'IMAGE_RATE_LIMIT', knownRejected: true });
    if (activeUploads >= 4)
      return reply(503, { code: 'IMAGE_BUSY', knownRejected: true });
    activeUploads++;
    uploadSlot = true;
    const type = request.headers.get('content-type') ?? '';
    const bytes = await bounded(request, IMAGE_UPLOAD_BYTES + 100000);
    if (!bytes) return reply(413, { code: 'IMAGE_SIZE' });
    let input: unknown,
      image: Uint8Array | null = null;
    if (type.startsWith('multipart/form-data')) {
      const form = await new Request(request.url, {
        method: 'POST',
        headers: { 'Content-Type': type },
        body: bytes,
      }).formData();
      if (
        [...form.keys()].some(
          (k) =>
            !['command', 'target', 'revision', 'image', 'framing'].includes(k),
        ) ||
        [...form.keys()].some((k) => form.getAll(k).length !== 1)
      )
        return reply(400, { code: 'INVALID_INPUT' });
      const file = form.get('image');
      if (!(file instanceof File) || file.size > IMAGE_UPLOAD_BYTES)
        return reply(413, { code: 'IMAGE_SIZE' });
      input = {
        target: JSON.parse(String(form.get('target'))),
        revision: Number(form.get('revision')),
        command: form.get('command'),
        ...(form.has('framing')
          ? { framing: JSON.parse(String(form.get('framing'))) }
          : {}),
      };
      image = new Uint8Array(await file.arrayBuffer());
    } else if (type.startsWith('application/json'))
      input = JSON.parse(new TextDecoder().decode(bytes));
    else return reply(400, { code: 'INVALID_INPUT' });
    const parsed = visualWriteSchema.safeParse(input);
    if (!parsed.success) return reply(400, { code: 'INVALID_INPUT' });
    return reply(200, await visualMedia().write(actor, parsed.data, image));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError)
      return reply(400, { code: 'INVALID_INPUT', knownRejected: true });
    const failure = visualFailure(error);
    return reply(failure.status, {
      code: failure.code,
      knownRejected: failure.code !== 'MEDIA_UNAVAILABLE',
    });
  } finally {
    if (uploadSlot) activeUploads--;
  }
}
