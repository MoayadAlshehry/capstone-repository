import 'server-only';
import { Worker } from 'node:worker_threads';
import { findPackageJSON } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';
import type { NativeStorage } from './native.js';
export class ContentError extends Error {
  constructor(readonly code: string) {
    super('File content does not match the admitted format: ' + code);
    this.name = 'ContentError';
  }
}
const binary: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const sensitive =
  /-----BEGIN (?:[A-Z0-9 ]*PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----|PuTTY-User-Key-File-/;
export async function validateContent(
  storage: NativeStorage,
  key: string,
  extension: string,
  size: number,
) {
  const prefix = await storage.slice(key, 0, 65536);
  if (
    (prefix[0] === 0x4d && prefix[1] === 0x5a) ||
    (prefix[0] === 0x7f &&
      prefix[1] === 0x45 &&
      prefix[2] === 0x4c &&
      prefix[3] === 0x46)
  )
    throw new ContentError('EXECUTABLE');
  let detected: { ext: string; mime: string } | undefined;
  try {
    detected = await detect(prefix);
  } catch {
    throw new ContentError('MALFORMED_SIGNATURE');
  }
  if (extension === 'docx' || extension === 'pptx') {
    if (!detected || !['zip', extension].includes(detected.ext))
      throw new ContentError('DOCUMENT_SIGNATURE');
    await officeContainer(storage, key, size, extension);
    return binary[extension]!;
  }
  if (binary[extension]) {
    if (!detected || detected.mime !== binary[extension])
      throw new ContentError('SIGNATURE_MISMATCH');
    return detected.mime;
  }
  if (detected) throw new ContentError('BINARY_AS_TEXT');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let tail = '',
    json = '';
  // Larger structured originals remain inert UTF8 source; never load the whole file.
  const parseJson = ['json', 'ipynb'].includes(extension) && size <= 8_000_000;
  try {
    for await (const b of storage.chunks(key)) {
      const text = decoder.decode(b, { stream: true });
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text))
        throw new ContentError('BINARY_CONTROL');
      const scan = tail + text;
      if (sensitive.test(scan)) throw new ContentError('PRIVATE_KEY');
      tail = scan.slice(-256);
      if (parseJson) json += text;
    }
    const end = decoder.decode();
    if (parseJson) json += end;
  } catch (e) {
    if (e instanceof ContentError) throw e;
    throw new ContentError('INVALID_UTF8');
  }
  if (parseJson) {
    try {
      const value: unknown = JSON.parse(json);
      if (
        extension === 'ipynb' &&
        (!value ||
          typeof value !== 'object' ||
          !('nbformat' in value) ||
          !('cells' in value) ||
          !Array.isArray(value.cells))
      )
        throw Error();
    } catch {
      throw new ContentError('INVALID_JSON');
    }
  }
  return parseJson
    ? 'application/json'
    : extension === 'csv'
      ? 'text/csv'
      : 'text/plain';
}
async function detect(
  prefix: Uint8Array,
): Promise<{ ext: string; mime: string } | undefined> {
  // Node24 resolves the installed pinned worker dependency. Bundlers may turn
  // import.meta.resolve/require.resolve into chunk IDs, which are not worker URLs.
  const manifest = findPackageJSON('file-type', import.meta.url);
  if (!manifest) throw new ContentError('SIGNATURE_FAILED');
  const module = pathToFileURL(join(dirname(manifest), 'source/index.js')).href;
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `const {parentPort,workerData}=require('node:worker_threads');import(workerData.module).then(async m=>parentPort.postMessage(await m.fileTypeFromBuffer(workerData.prefix))).catch(()=>process.exit(1));`,
      {
        eval: true,
        workerData: { module, prefix },
        resourceLimits: { maxOldGenerationSizeMb: 64 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new ContentError('SIGNATURE_TIMEOUT'));
    }, 2000);
    worker.once(
      'message',
      (result: { ext: string; mime: string } | undefined) => {
        clearTimeout(timer);
        void worker.terminate();
        resolve(result);
      },
    );
    worker.once('error', () => {
      clearTimeout(timer);
      reject(new ContentError('SIGNATURE_FAILED'));
    });
    worker.once('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new ContentError('SIGNATURE_FAILED'));
      }
    });
  });
}
// Bounded central-directory inspection for two Office formats only. No general archive
// ingestion/extraction and no member is written to the logical project tree.
async function officeContainer(
  storage: NativeStorage,
  key: string,
  size: number,
  format: 'docx' | 'pptx',
) {
  const tail = Buffer.from(
    await storage.slice(key, Math.max(0, size - 65557), Math.min(size, 65557)),
  );
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (
      tail.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + tail.readUInt16LE(i + 20) === tail.length
    ) {
      end = i;
      break;
    }
  if (
    end < 0 ||
    tail.readUInt16LE(end + 4) !== 0 ||
    tail.readUInt16LE(end + 6) !== 0
  )
    throw new ContentError('DOCUMENT_DIRECTORY');
  const count = tail.readUInt16LE(end + 10),
    length = tail.readUInt32LE(end + 12),
    offset = tail.readUInt32LE(end + 16);
  if (
    count === 0 ||
    count > 10000 ||
    length > 1_048_576 ||
    offset + length > size - 22
  )
    throw new ContentError('DOCUMENT_DIRECTORY');
  const dir = Buffer.from(await storage.slice(key, offset, length));
  let cursor = 0;
  const entries = new Map<
    string,
    { offset: number; compressed: number; size: number; method: number }
  >();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > dir.length || dir.readUInt32LE(cursor) !== 0x02014b50)
      throw new ContentError('DOCUMENT_DIRECTORY');
    const flags = dir.readUInt16LE(cursor + 8),
      method = dir.readUInt16LE(cursor + 10),
      compressed = dir.readUInt32LE(cursor + 20),
      uncompressed = dir.readUInt32LE(cursor + 24),
      n = dir.readUInt16LE(cursor + 28),
      extra = dir.readUInt16LE(cursor + 30),
      comment = dir.readUInt16LE(cursor + 32),
      local = dir.readUInt32LE(cursor + 42);
    if (
      cursor + 46 + n + extra + comment > dir.length ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      throw new ContentError('DOCUMENT_MEMBER');
    let name: string;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(
        dir.subarray(cursor + 46, cursor + 46 + n),
      );
    } catch {
      throw new ContentError('DOCUMENT_MEMBER');
    }
    if (
      !name ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.split('/').includes('..') ||
      /[\x00-\x1f]/.test(name) ||
      entries.has(name.toLowerCase()) ||
      /vbaProject\.bin$|(?:^|\/)embeddings\//i.test(name)
    )
      throw new ContentError('DOCUMENT_MEMBER');
    if (local + 30 + compressed > offset)
      throw new ContentError('DOCUMENT_MEMBER');
    entries.set(name.toLowerCase(), {
      offset: local,
      compressed,
      size: uncompressed,
      method,
    });
    cursor += 46 + n + extra + comment;
  }
  if (cursor !== dir.length) throw new ContentError('DOCUMENT_DIRECTORY');
  const main = format === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml';
  for (const name of ['[content_types].xml', '_rels/.rels', main]) {
    const entry = entries.get(name);
    if (!entry) throw new ContentError('DOCUMENT_STRUCTURE');
    const local = Buffer.from(await storage.slice(key, entry.offset, 30));
    if (local.length !== 30 || local.readUInt32LE(0) !== 0x04034b50)
      throw new ContentError('DOCUMENT_MEMBER');
    const start =
      entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    if (
      local.readUInt16LE(8) !== entry.method ||
      (local.readUInt16LE(6) & 1) !== 0
    )
      throw new ContentError('DOCUMENT_MEMBER');
    const localName = await storage.slice(
      key,
      entry.offset + 30,
      local.readUInt16LE(26),
    );
    if (
      new TextDecoder('utf-8', { fatal: true })
        .decode(localName)
        .toLowerCase() !== name
    )
      throw new ContentError('DOCUMENT_MEMBER');
    if (start + entry.compressed > offset)
      throw new ContentError('DOCUMENT_MEMBER');
    let xml: string;
    try {
      xml = await officeXml(storage, key, start, entry, name === main);
    } catch {
      throw new ContentError('DOCUMENT_STRUCTURE');
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || sensitive.test(xml))
      throw new ContentError('DOCUMENT_STRUCTURE');
    if (
      name === main &&
      !xml.includes(
        format === 'docx'
          ? 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
          : 'http://schemas.openxmlformats.org/presentationml/2006/main',
      ) &&
      !xml.includes(
        format === 'docx'
          ? 'http://purl.oclc.org/ooxml/wordprocessingml/main'
          : 'http://purl.oclc.org/ooxml/presentationml/main',
      )
    )
      throw new ContentError('DOCUMENT_STRUCTURE');
    if (
      name === '[content_types].xml' &&
      !xml.includes(
        binary[format]!.replace(
          'officedocument.wordprocessingml.document',
          'officedocument.wordprocessingml.document.main+xml',
        ).replace(
          'officedocument.presentationml.presentation',
          'officedocument.presentationml.presentation.main+xml',
        ),
      )
    )
      throw new ContentError('DOCUMENT_STRUCTURE');
    if (
      name === '_rels/.rels' &&
      (!xml.includes('officeDocument') || !xml.includes(main))
    )
      throw new ContentError('DOCUMENT_STRUCTURE');
    if (
      name === main &&
      !(format === 'docx'
        ? /<(?:\w+:)?document\b/.test(xml)
        : /<(?:\w+:)?presentation\b/.test(xml))
    )
      throw new ContentError('DOCUMENT_STRUCTURE');
  }
}
async function officeXml(
  storage: NativeStorage,
  key: string,
  start: number,
  entry: { compressed: number; size: number; method: number },
  prefixOnly: boolean,
) {
  const input = Readable.from(
    (async function* () {
      for (let offset = 0; offset < entry.compressed; offset += 65536)
        yield await storage.slice(
          key,
          start + offset,
          Math.min(65536, entry.compressed - offset),
        );
    })(),
  );
  const output =
    entry.method === 8
      ? input.pipe(createInflateRaw({ chunkSize: 65536 }))
      : input;
  // pipe() does not forward source read errors to the inflater. Without this
  // bridge an I/O failure is uncaught while the admission iterator waits forever.
  if (output !== input) input.on('error', (error) => output.destroy(error));
  const chunks: Buffer[] = [];
  let length = 0;
  const limit = prefixOnly ? 65536 : 1_000_000;
  try {
    for await (const value of output) {
      const b = Buffer.from(value as Uint8Array);
      const n = Math.min(b.length, limit - length);
      chunks.push(b.subarray(0, n));
      length += n;
      if (length === limit) {
        if (prefixOnly) break;
        throw new ContentError('DOCUMENT_METADATA_LIMIT');
      }
    }
    if (!prefixOnly && length !== entry.size)
      throw new ContentError('DOCUMENT_STRUCTURE');
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks, length),
      { stream: prefixOnly },
    );
  } finally {
    output.destroy();
    input.destroy();
  }
}
