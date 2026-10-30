import 'server-only';
import {
  createNativeFileReader,
  NativeReadError,
} from '@capstone/infrastructure/native-files';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
import { contentDisposition } from '@capstone/infrastructure/file-export';
import { discovery } from '../discovery/server';
import type { NativeFile } from '@capstone/domain';
const publicFile = (f: NativeFile) => ({
  id: f.id,
  path: f.path,
  name: f.name,
  mime: f.mime,
  size: f.size,
  extension: f.extension,
  uploadedLicense: f.uploadedLicense === true,
});
let reader: ReturnType<typeof createNativeFileReader> | undefined;
export function nativeReader() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd();
  const environment = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(environment))
    throw Error('Invalid file environment');
  reader ??= createNativeFileReader({
    databaseUrl: process.env['DATABASE_URL'] ?? '',
    workspaceRoot: root,
    storageRoot:
      process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    environment: environment as 'local' | 'test' | 'production',
  });
  return reader;
}
const uuid = (s: string | null): s is string =>
  !!s &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
export const privateFileHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Referrer-Policy': 'no-referrer',
};
function reply(status: number, code: string) {
  return Response.json({ code }, { status, headers: privateFileHeaders });
}
export async function nativeFileHandler(
  request: Request,
  audience:
    'internal' | 'public' | 'granted' | 'review' | 'committee' = 'internal',
  injected?: Awaited<ReturnType<typeof nativeReader>>,
  guest?: { kind: 'committee-guest'; invitation: string; sessionHash: string },
) {
  try {
    if (!['GET', 'HEAD'].includes(request.method))
      return reply(405, 'METHOD_NOT_ALLOWED');
    const origin = request.headers.get('origin');
    if (
      (origin && origin !== process.env['AUTH_BASE_URL']) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return reply(403, 'FORBIDDEN');
    const account =
      guest ??
      (audience === 'public'
        ? { kind: 'public' as const }
        : await currentAccount(request.headers));
    if (!account) return reply(404, 'NOT_FOUND');
    if (
      request.headers.has('X-Workspace-Actor') &&
      'id' in account &&
      request.headers.get('X-Workspace-Actor') !== account.id
    )
      return reply(404, 'NOT_FOUND');
    const grant = new URL(request.url).searchParams.get('grant');
    if (audience === 'granted' && (!uuid(grant) || !('id' in account)))
      return reply(404, 'NOT_FOUND');
    const assignment = new URL(request.url).searchParams.get('assignment');
    if (audience === 'review' && (!uuid(assignment) || !('id' in account)))
      return reply(404, 'NOT_FOUND');
    const actor =
      guest ??
      (audience === 'review' && 'id' in account
        ? {
            kind: 'review-packet' as const,
            actor: account,
            assignment: assignment!,
          }
        : audience === 'granted' && 'id' in account
          ? { kind: 'partner-grant' as const, actor: account, grant: grant! }
          : account);
    const url = new URL(request.url),
      p = url.searchParams.get('project'),
      v = url.searchParams.get('version'),
      id = url.searchParams.get('file'),
      mode = url.searchParams.get('mode') ?? 'tree',
      submission = url.searchParams.get('submission');
    if (
      url.searchParams.has('syntax') &&
      (!['internal', 'review', 'granted', 'committee'].includes(audience) ||
        mode !== 'preview' ||
        url.searchParams.get('syntax') !== 'studio')
    )
      return reply(400, 'INVALID_TARGET');
    if (
      !uuid(p) ||
      !uuid(v) ||
      (submission !== null && (!uuid(submission) || audience === 'public')) ||
      [...url.searchParams.keys()].some(
        (k) =>
          ![
            'project',
            'version',
            'file',
            'mode',
            'directory',
            'submission',
            ...(['internal', 'review', 'granted', 'committee'].includes(
              audience,
            )
              ? ['syntax']
              : []),
            ...(audience === 'granted' ? ['grant'] : []),
            ...(audience === 'review' ? ['assignment'] : []),
            ...(audience === 'committee' ? ['invitation'] : []),
          ].includes(k),
      ) ||
      [...new Set(url.searchParams.keys())].some(
        (k) => url.searchParams.getAll(k).length !== 1,
      )
    )
      return reply(400, 'INVALID_TARGET');
    const service = injected ?? (await nativeReader());
    const headersFor = async () => {
      const headers = new Headers(privateFileHeaders);
      if (audience === 'public') {
        const project = await discovery().detail(
          p,
          await currentAccount(request.headers),
        );
        if (project.version !== v) throw new NativeReadError('NOT_FOUND');
        headers.set(
          'X-Repository-Rights',
          'Public access does not itself grant reuse or transfer rights. Copyright and original file terms remain with their owners.',
        );
      }
      return headers;
    };
    if (mode === 'zip' && !id && !url.searchParams.has('directory')) {
      const headers = await headersFor();
      const stream = await service.zip(
        actor,
        p,
        v,
        request.signal,
        submission ?? undefined,
      );
      headers.set('Content-Type', 'application/zip');
      headers.set(
        'Content-Disposition',
        contentDisposition(
          audience === 'review'
            ? 'academic-review-packet.zip'
            : audience === 'public'
              ? 'public-files.zip'
              : 'permitted-files.zip',
        ),
      );
      if (request.method === 'HEAD') {
        await stream.cancel();
        return new Response(null, { headers });
      }
      return new Response(stream, { headers });
    }
    if (mode === 'tree' && !id) {
      let files = await service.list(actor, p, v, submission ?? undefined);
      const directory = url.searchParams.get('directory');
      if (directory) {
        files = files.filter((f) => f.path.startsWith(directory + '/'));
        if (!files.length) return reply(404, 'NOT_FOUND');
      }
      return Response.json(
        { files: audience === 'public' ? files.map(publicFile) : files },
        { headers: await headersFor() },
      );
    }
    if (!uuid(id) || url.searchParams.has('directory'))
      return reply(400, 'INVALID_TARGET');
    if (mode === 'metadata')
      return Response.json(
        {
          meta: await service
            .metadata(actor, p, v, id, submission ?? undefined)
            .then((f) => (audience === 'public' ? publicFile(f) : f)),
        },
        { headers: await headersFor() },
      );
    if (mode === 'preview')
      return Response.json(
        await service
          .preview(
            actor,
            p,
            v,
            id,
            submission ?? undefined,
            url.searchParams.get('syntax') === 'studio' ? 'studio' : 'default',
          )
          .then((result) =>
            audience === 'public'
              ? { ...result, meta: publicFile(result.meta) }
              : result,
          ),
        {
          headers: await headersFor(),
        },
      );
    if (
      ![
        'asset',
        'original',
        ...(audience === 'public' ||
        audience === 'granted' ||
        audience === 'review' ||
        audience === 'committee'
          ? ['raw']
          : []),
      ].includes(mode)
    )
      return reply(404, 'NOT_FOUND');
    const body = await service.bytes(
      actor,
      p,
      v,
      id,
      mode as 'asset' | 'original' | 'raw',
      request.headers.get('range'),
      submission ?? undefined,
      request.signal,
    );
    const headers = await headersFor();
    headers.set('Content-Type', body.meta.mime);
    headers.set('Content-Length', String(body.length));
    headers.set(
      'Content-Disposition',
      contentDisposition(body.meta.name, mode !== 'asset'),
    );
    if (
      [
        'application/pdf',
        'audio/mpeg',
        'audio/wav',
        'audio/x-wav',
        'video/mp4',
      ].includes(body.meta.mime) ||
      mode !== 'asset'
    )
      headers.set('Accept-Ranges', 'bytes');
    if (body.range)
      headers.set(
        'Content-Range',
        `bytes ${body.range.start}-${body.range.end}/${body.meta.size}`,
      );
    if (request.method === 'HEAD')
      return new Response(null, { status: body.range ? 206 : 200, headers });
    const iterator = body.stream[Symbol.asyncIterator]();
    const abort = () => {
      void iterator.return?.();
    };
    const cleanup = () => request.signal.removeEventListener('abort', abort);
    const stream = new ReadableStream<Uint8Array>({
      start() {
        request.signal.addEventListener('abort', abort, { once: true });
        if (request.signal.aborted) abort();
      },
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) {
            cleanup();
            controller.close();
          } else controller.enqueue(next.value);
        } catch {
          cleanup();
          controller.error(new Error('FILE_UNAVAILABLE'));
        }
      },
      async cancel() {
        cleanup();
        await iterator.return?.();
      },
    });
    return new Response(stream, { status: body.range ? 206 : 200, headers });
  } catch (error) {
    if (error instanceof NativeReadError) {
      const response = reply(
        error.code === 'INTEGRITY_FAILED'
          ? 409
          : error.code === 'EMPTY_ALLOWED_SET'
            ? 409
            : error.code === 'INVALID_RANGE'
              ? 416
              : 404,
        error.code,
      );
      if (error.code === 'INVALID_RANGE' && error.size !== undefined)
        response.headers.set('Content-Range', 'bytes */' + error.size);
      return response;
    }
    if (
      error instanceof DatabaseError &&
      (['P0002', '42501'].includes(error.sqlState ?? '') ||
        (audience === 'review' && error.sqlState === '40001'))
    )
      return reply(404, 'NOT_FOUND');
    return reply(503, 'FILE_UNAVAILABLE');
  }
}
