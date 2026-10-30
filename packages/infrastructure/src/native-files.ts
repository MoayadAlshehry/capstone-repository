import 'server-only';
import { createHash } from 'node:crypto';
import {
  createNativeReadRepository,
  type NativeReadRecord,
  type NativeReader,
} from '@capstone/db/native-reads';
import { streamZip, type ExportPorts } from './file-export.js';
import {
  createNativeStorage,
  type NativeStorage,
} from '@capstone/storage/native';
import {
  previewFamily,
  nativeRange,
  TEXT_PREVIEW_BYTES,
  CSV_PREVIEW_ROWS,
  CSV_PREVIEW_COLUMNS,
  type NativeFile,
  type NativePreview,
} from '@capstone/domain';
import Papa from 'papaparse';
import { createHighlighter, type BundledLanguage } from 'shiki';

export class NativeReadError extends Error {
  constructor(
    readonly code:
      'INTEGRITY_FAILED' | 'INVALID_RANGE' | 'NOT_FOUND' | 'EMPTY_ALLOWED_SET',
    readonly size?: number,
  ) {
    super(code);
  }
}
const languages: Record<string, BundledLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  sh: 'bash',
  ps1: 'powershell',
  sql: 'sql',
  html: 'html',
  css: 'css',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  md: 'markdown',
};
let highlighter: ReturnType<typeof createHighlighter> | undefined;
function safe(record: NativeReadRecord): NativeFile {
  return {
    id: record.id,
    project: record.project,
    version: record.version,
    path: record.path,
    name: record.name,
    extension: record.extension,
    mime: record.mime,
    size: Number(record.size),
    sha256: record.sha256,
    visibility: record.visibility,
    status: record.status,
    uploadedLicense: record.uploadedLicense === true,
    ...(record.uploader !== undefined
      ? {
          uploader: record.uploader,
          uploaderRole: record.uploaderRole,
          uploadedAt: record.uploadedAt,
        }
      : {}),
  };
}
function imageDimensions(bytes: Uint8Array, extension: string) {
  const b = Buffer.from(bytes);
  if (extension === 'png' && b.length >= 24)
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (['jpg', 'jpeg'].includes(extension)) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 255) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      if (marker === 255) {
        i++;
        continue;
      }
      if ([216, 217, 1].includes(marker)) {
        i += 2;
        continue;
      }
      const length = b.readUInt16BE(i + 2);
      if (length < 2 || i + 2 + length > b.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      )
        return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += length + 2;
    }
  }
  if (extension === 'webp' && b.length >= 30) {
    const type = b.toString('ascii', 12, 16);
    if (type === 'VP8X')
      return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
    if (type === 'VP8L')
      return [
        (b[21]! | ((b[22]! & 63) << 8)) + 1,
        ((b[22]! >> 6) | (b[23]! << 2) | ((b[24]! & 15) << 10)) + 1,
      ];
    if (type === 'VP8 ')
      return [b.readUInt16LE(26) & 16383, b.readUInt16LE(28) & 16383];
  }
  return null;
}
export async function createNativeFileReader(
  config: {
    databaseUrl: string;
    storageRoot: string;
    workspaceRoot: string;
    environment: 'local' | 'test' | 'production';
  },
  port?: NativeStorage,
) {
  const repository = createNativeReadRepository(config.databaseUrl),
    storage =
      port ??
      (await createNativeStorage(
        config.storageRoot,
        config.workspaceRoot,
        config.environment,
      ));
  // Immutable byte proofs are shared only within a single read operation. Every
  // file still passes its current database authorization and mapping checks.
  async function verified(
    file: { key: string; size: number | string; sha256: string },
    signal: AbortSignal | undefined,
    proofs: Set<string>,
  ) {
    const identity = JSON.stringify([file.key, Number(file.size), file.sha256]);
    if (proofs.has(identity)) return;
    if (
      !(await storage.verify(
        file.key,
        { size: Number(file.size), sha256: file.sha256 },
        signal,
      ))
    )
      throw new NativeReadError('INTEGRITY_FAILED');
    proofs.add(identity);
  }
  async function authorized(
    actor: NativeReader,
    project: string,
    version: string,
    id: string,
    submission?: string,
    signal?: AbortSignal,
    proofs = new Set<string>(),
  ) {
    const file = await repository.file(actor, project, version, id, submission);
    if ('kind' in actor && actor.kind === 'review-packet') {
      if (!file.packetIntegrity?.length)
        throw new NativeReadError('INTEGRITY_FAILED');
      for (const entry of file.packetIntegrity)
        await verified(entry, signal, proofs);
    }
    await verified(file, signal, proofs);
    // Recheck current account/relationship/current mapping after bounded storage validation.
    const current = await repository.file(
      actor,
      project,
      version,
      id,
      submission,
    );
    if (current.key !== file.key || current.sha256 !== file.sha256)
      throw new NativeReadError('NOT_FOUND');
    return current;
  }
  async function preview(
    actor: NativeReader,
    project: string,
    version: string,
    id: string,
    submission?: string,
    syntax: 'default' | 'studio' = 'default',
  ): Promise<NativePreview> {
    const file = await authorized(actor, project, version, id, submission),
      meta = safe(file),
      family = previewFamily(meta);
    const result: NativePreview = {
      meta,
      family,
      integrityVerified: true,
      truncated: false,
      previewBytes: 0,
    };
    if (['source', 'markdown', 'json', 'csv'].includes(family)) {
      const length = Math.min(meta.size, TEXT_PREVIEW_BYTES),
        bytes = await storage.slice(file.key, 0, length);
      result.previewBytes = bytes.byteLength;
      result.truncated = meta.size > length;
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
        stream: result.truncated,
      });
      result.text = text;
      if (family === 'json' && !result.truncated) {
        try {
          JSON.parse(text);
        } catch {
          result.error = 'MALFORMED';
        }
      }
      if (family === 'csv') {
        const rows: string[][] = [];
        let bad = false,
          cells = false,
          columns = false,
          more = false,
          previousCursor = -1;
        Papa.parse<string[]>(text, {
          skipEmptyLines: false,
          preview: CSV_PREVIEW_ROWS + 1,
          step(row) {
            // Papa emits one additional empty record after a terminal separator.
            // Its cursor does not advance. Preserve real blank/quoted/ragged rows.
            const phantom =
              row.meta.cursor === previousCursor &&
              /(?:\r\n|\r|\n)$/.test(text) &&
              row.data.length === 1 &&
              row.data[0] === '';
            previousCursor = row.meta.cursor;
            if (phantom) return;
            if (row.errors.some((e) => e.code !== 'UndetectableDelimiter'))
              bad = true;
            if (rows.length >= CSV_PREVIEW_ROWS) {
              more = true;
              return;
            }
            columns ||= row.data.length > CSV_PREVIEW_COLUMNS;
            rows.push(
              row.data.slice(0, CSV_PREVIEW_COLUMNS).map((value) => {
                if (value.length > 2048) cells = true;
                return value.slice(0, 2048);
              }),
            );
          },
        });
        result.rows = rows;
        result.columnsTruncated = columns;
        result.cellsTruncated = cells;
        result.truncated ||= more;
        delete result.text;
        if (bad) result.error = 'MALFORMED';
      }
      const language =
        languages[meta.extension] ??
        (syntax === 'studio'
          ? (
              { Dockerfile: 'docker', Makefile: 'make' } as Record<
                string,
                BundledLanguage
              >
            )[meta.name]
          : undefined);
      if (
        (family === 'source' ||
          (syntax === 'studio' && ['json', 'markdown'].includes(family))) &&
        text.length <= 100_000 &&
        text.split('\n').length <= 2000 &&
        language
      ) {
        highlighter ??= createHighlighter({
          themes: ['github-light', 'github-dark', 'light-plus', 'dark-plus'],
          langs: [
            ...new Set([
              ...Object.values(languages),
              'docker',
              'make',
            ] as BundledLanguage[]),
          ],
        });
        const output = (await highlighter).codeToTokensWithThemes(text, {
          lang: language,
          themes:
            syntax === 'studio'
              ? { light: 'light-plus', dark: 'dark-plus' }
              : { light: 'github-light', dark: 'github-dark' },
        });
        if (output.reduce((n, line) => n + line.length, 0) <= 50_000)
          result.tokens = output.map((line) =>
            line.map((token) => ({
              content: token.content,
              light: /^#[a-f0-9]{6,8}$/i.test(
                token.variants['light']?.color ?? '',
              )
                ? (token.variants['light']?.color ?? '#172b2a')
                : '#172b2a',
              dark: /^#[a-f0-9]{6,8}$/i.test(
                token.variants['dark']?.color ?? '',
              )
                ? (token.variants['dark']?.color ?? '#edf4f2')
                : '#edf4f2',
            })),
          );
        result.language = language;
      }
    } else if (family === 'image') {
      const dimensions = imageDimensions(
        await storage.slice(file.key, 0, Math.min(65536, meta.size)),
        meta.extension,
      );
      if (
        meta.size > 10_000_000 ||
        !dimensions ||
        dimensions.some((n) => n <= 0 || n > 16384) ||
        dimensions[0]! * dimensions[1]! > 16_000_000
      )
        result.error = 'IMAGE_LIMIT';
    } else if (family === 'pdf') {
      const tail = new TextDecoder().decode(
        await storage.slice(
          file.key,
          Math.max(0, meta.size - 65536),
          Math.min(65536, meta.size),
        ),
      );
      const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
      if (!match || Number(match[1]) >= meta.size) result.error = 'MALFORMED';
    }
    const current = await repository.file(
      actor,
      project,
      version,
      id,
      submission,
    );
    if (current.key !== file.key || current.sha256 !== file.sha256)
      throw new NativeReadError('NOT_FOUND');
    return result;
  }
  return {
    async list(
      actor: NativeReader,
      project: string,
      version: string,
      submission?: string,
    ) {
      const files = await repository.list(actor, project, version, submission);
      if (
        'kind' in actor &&
        (actor.kind === 'public' ||
          actor.kind === 'partner-grant' ||
          actor.kind === 'committee-guest' ||
          actor.kind === 'review-packet')
      ) {
        const proofs = new Set<string>();
        for (const file of files)
          await authorized(
            actor,
            project,
            version,
            file.id,
            submission,
            undefined,
            proofs,
          );
        const current = await repository.list(
          actor,
          project,
          version,
          submission,
        );
        if (JSON.stringify(current) !== JSON.stringify(files))
          throw new NativeReadError('NOT_FOUND');
      }
      return files.map(safe);
    },
    async metadata(
      actor: NativeReader,
      project: string,
      version: string,
      id: string,
      submission?: string,
    ) {
      return safe(await authorized(actor, project, version, id, submission));
    },
    preview,
    async bytes(
      actor: NativeReader,
      project: string,
      version: string,
      id: string,
      mode: 'asset' | 'original' | 'raw',
      rangeHeader: string | null,
      submission?: string,
      signal?: AbortSignal,
    ) {
      const file = await authorized(
          actor,
          project,
          version,
          id,
          submission,
          signal,
        ),
        meta = safe(file),
        family = previewFamily(meta);
      if (
        mode === 'asset' &&
        !['image', 'pdf', 'audio', 'video'].includes(family)
      )
        throw new NativeReadError('NOT_FOUND');
      if (
        mode === 'asset' &&
        family === 'image' &&
        (await preview(actor, project, version, id, submission)).error
      )
        throw new NativeReadError('NOT_FOUND');
      let range: ReturnType<typeof nativeRange>;
      try {
        if (
          rangeHeader &&
          mode === 'asset' &&
          !['pdf', 'audio', 'video'].includes(family)
        )
          throw Error();
        range = nativeRange(rangeHeader, meta.size);
      } catch {
        throw new NativeReadError('INVALID_RANGE', meta.size);
      }
      const start = range?.start ?? 0,
        length = range?.length ?? meta.size;
      async function* stream() {
        const digest = !range ? createHash('sha256') : undefined;
        for (let offset = start; offset < start + length; offset += 65536) {
          if (signal?.aborted) throw new NativeReadError('NOT_FOUND');
          const current = await repository.file(
            actor,
            project,
            version,
            id,
            submission,
          );
          if (current.key !== file.key || current.sha256 !== file.sha256)
            throw new NativeReadError('NOT_FOUND');
          const wanted = Math.min(65536, start + length - offset);
          const chunk = await storage.slice(file.key, offset, wanted);
          if (chunk.byteLength !== wanted)
            throw new NativeReadError('INTEGRITY_FAILED');
          digest?.update(chunk);
          if (
            digest &&
            offset + wanted === start + length &&
            digest.digest('hex') !== file.sha256
          )
            throw new NativeReadError('INTEGRITY_FAILED');
          yield chunk;
        }
      }
      return { meta, range, stream: stream(), length };
    },
    async zip(
      actor: NativeReader,
      project: string,
      version: string,
      signal?: AbortSignal,
      submission?: string,
      ports?: ExportPorts,
    ) {
      if (!('kind' in actor)) actor = { kind: 'internal-zip', actor };
      else if (actor.kind === 'internal')
        actor = { kind: 'internal-zip', actor: actor.actor };
      const files = await repository.list(actor, project, version, submission);
      if (!files.length) throw new NativeReadError('EMPTY_ALLOWED_SET');
      const verified = [],
        proofs = new Set<string>();
      for (const file of files)
        verified.push(
          await authorized(
            actor,
            project,
            version,
            file.id,
            submission,
            signal,
            proofs,
          ),
        );
      const current = await repository.list(
        actor,
        project,
        version,
        submission,
      );
      if (
        JSON.stringify(current.map((f) => [f.id, f.sha256])) !==
        JSON.stringify(files.map((f) => [f.id, f.sha256]))
      )
        throw new NativeReadError('NOT_FOUND');
      return streamZip(
        verified,
        async function* (file) {
          for (let offset = 0; offset < Number(file.size); offset += 65536) {
            const current = await repository.file(
              actor,
              project,
              version,
              file.id,
              submission,
            );
            if (current.key !== file.key || current.sha256 !== file.sha256)
              throw new NativeReadError('NOT_FOUND');
            yield await storage.slice(
              file.key!,
              offset,
              Math.min(65536, Number(file.size) - offset),
            );
          }
        },
        signal,
        ports,
      );
    },
    close: () => repository.close(),
  };
}
