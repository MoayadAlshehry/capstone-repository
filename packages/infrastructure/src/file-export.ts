import 'server-only';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
export { ZipArchive } from 'archiver';
import { createHash } from 'node:crypto';
import type { NativeReadRecord } from '@capstone/db/native-reads';

export function exportPaths<T extends Pick<NativeReadRecord, 'path'>>(
  files: readonly T[],
) {
  const seen = new Set<string>();
  const folders = new Map<string, string>();
  for (const { path } of files) {
    if (
      !path ||
      path.length > 512 ||
      /[\\<>:"|?*\x00-\x1f\x7f\p{Cf}]/u.test(path) ||
      Array.from(path).some(
        (x) => x.codePointAt(0)! >= 0xd800 && x.codePointAt(0)! <= 0xdfff,
      ) ||
      /^\/|^[a-z]:/i.test(path) ||
      path
        .split('/')
        .some(
          (x) =>
            !x || x === '.' || x === '..' || /[. ]$/.test(x) || /^\s/.test(x),
        )
    )
      throw Error('INVALID_EXPORT_PATH');
    const parts = path.split('/');
    if (
      parts.some((x) =>
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x),
      )
    )
      throw Error('INVALID_EXPORT_PATH');
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/'),
        normalized = folder.normalize('NFC').toLowerCase();
      if (folders.has(normalized) && folders.get(normalized) !== folder)
        throw Error('AMBIGUOUS_EXPORT_PATH');
      folders.set(normalized, folder);
    }
    const key = path.normalize('NFC').toLowerCase();
    if (
      seen.has(key) ||
      [...seen].some((x) => x.startsWith(key + '/') || key.startsWith(x + '/'))
    )
      throw Error('AMBIGUOUS_EXPORT_PATH');
    seen.add(key);
  }
  return [...files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}
export function contentDisposition(name: string, attachment = true) {
  const clean =
    Array.from(name, (x) =>
      x.codePointAt(0)! >= 0xd800 && x.codePointAt(0)! <= 0xdfff ? '_' : x,
    )
      .join('')
      .replace(/[\\/\x00-\x1f\x7f\p{Cf}]/gu, '_')
      .replace(/["<>:|?*]/g, '_') || 'download';
  const bounded = Array.from(clean).slice(0, 200).join('');
  const fallback = bounded.replace(/[^a-zA-Z0-9._-]/g, '_') || 'download';
  const encoded = encodeURIComponent(bounded).replace(
    /[!'()*]/g,
    (x) => '%' + x.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `${attachment ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
export interface ExportPorts {
  archive?: () => ZipArchive;
  resource?: (event: 'open' | 'close') => void;
}
export function streamZip<
  T extends Pick<NativeReadRecord, 'path' | 'size' | 'sha256'>,
>(
  files: readonly T[],
  read: (file: T) => AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
  ports: ExportPorts = {},
) {
  const ordered = exportPaths(files),
    archive =
      ports.archive?.() ??
      new ZipArchive({ zlib: { level: 6 }, highWaterMark: 65536 });
  const sources = new Set<Readable>();
  let closed = false;
  const dispose = (error?: Error) => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', aborted);
    for (const source of sources) source.destroy(error);
    archive.abort();
    if (error) archive.destroy(new Error('EXPORT_UNAVAILABLE'));
    ports.resource?.('close');
  };
  const aborted = () => dispose(new Error('EXPORT_ABORTED'));
  archive.on('error', () => dispose(new Error('EXPORT_UNAVAILABLE')));
  archive.on('warning', () => dispose(new Error('EXPORT_UNAVAILABLE')));
  archive.once('close', () => dispose());
  ports.resource?.('open');
  for (const file of ordered) {
    async function* verified() {
      let size = 0;
      const digest = createHash('sha256');
      for await (const chunk of read(file)) {
        if (closed || signal?.aborted) throw Error('EXPORT_ABORTED');
        size += chunk.byteLength;
        if (size > Number(file.size)) throw Error('EXPORT_UNAVAILABLE');
        digest.update(chunk);
        yield chunk;
      }
      if (size !== Number(file.size) || digest.digest('hex') !== file.sha256)
        throw Error('EXPORT_UNAVAILABLE');
    }
    const source = Readable.from(verified(), {
      objectMode: false,
      highWaterMark: 65536,
    });
    sources.add(source);
    source.on('error', () => dispose(new Error('EXPORT_UNAVAILABLE')));
    source.once('close', () => sources.delete(source));
    archive.append(source, {
      name: file.path,
      date: new Date('1980-01-01T00:00:00Z'),
      mode: 0o644,
    });
  }
  const iterator = archive[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>(
    {
      start() {
        signal?.addEventListener('abort', aborted, { once: true });
        if (signal?.aborted) aborted();
        else
          void archive
            .finalize()
            .catch(() => dispose(new Error('EXPORT_UNAVAILABLE')));
      },
      async pull(controller) {
        try {
          const result = await iterator.next();
          if (result.done) {
            controller.close();
            dispose();
          } else controller.enqueue(new Uint8Array(result.value));
        } catch {
          controller.error(new Error('EXPORT_UNAVAILABLE'));
          dispose();
        }
      },
      async cancel() {
        dispose();
        await iterator.return?.();
      },
    },
    { highWaterMark: 65536, size: (chunk) => chunk.byteLength },
  );
  return body;
}
