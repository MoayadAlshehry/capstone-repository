import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { ZipArchive } from 'archiver';
import { exportPaths, contentDisposition, streamZip } from './file-export.js';
import { inspectZip } from '../../../tools/delivery/zip-inspection.js';
for (const path of [
  '/absolute',
  'C:/drive',
  '../escape',
  'a/../escape',
  'a//b',
  'a\\b',
  'a/./b',
  'bad\0name',
  'bad\r\nname',
  'a/space ',
  'a/dot.',
  'a/\u202Eevil',
  'dir/evil:stream.txt',
  'CON.txt',
  'dir/LPT1',
  'bad\ud800name.txt',
])
  it('rejects unsafe ZIP path ' + JSON.stringify(path), () =>
    expect(() => exportPaths([{ path }])).toThrow(),
  );
for (const paths of [
  ['A.txt', 'a.txt'],
  ['café.txt', 'cafe\u0301.txt'],
  ['dir', 'dir/child'],
  ['Dir/a.txt', 'dir/b.txt'],
])
  it('rejects ambiguous ZIP paths ' + JSON.stringify(paths), () =>
    expect(() => exportPaths(paths.map((path) => ({ path })))).toThrow(),
  );
it('normalizes ordering without rewriting legitimate Unicode/extensionless paths', () =>
  expect(
    exportPaths([
      { path: 'src/z.ts' },
      { path: 'LICENSE' },
      { path: 'docs/ملخص.md' },
    ]).map((x) => x.path),
  ).toEqual(['LICENSE', 'docs/ملخص.md', 'src/z.ts']));
it('disposition cannot inject headers or directory names and retains UTF8 filename parameter', () => {
  const value = contentDisposition('../ملف"\r\nX-Evil: 1.txt');
  expect(value).not.toMatch(/[\r\n]/);
  expect(value).not.toContain('../');
  expect(value).toContain("filename*=UTF-8''");
  expect(value).not.toContain('filename="../');
});
it('truncates long astral Unicode filenames without splitting a code point', () => {
  const value = contentDisposition('a'.repeat(199) + '📚.txt');
  expect(value).toContain(
    "filename*=UTF-8''" + 'a'.repeat(199) + '%F0%9F%93%9A',
  );
  expect(value).not.toContain('\uFFFD');
});
it('streams a real ordered ZIP whose extracted hashes match source bytes', async () => {
  const map = new Map([
    ['README', Buffer.from('Synthetic source\n')],
    ['nested/source.ts', Buffer.from('export const value=1;\n')],
  ]);
  const files = [...map].reverse().map(([path, b]) => ({
    path,
    size: b.length,
    sha256: createHash('sha256').update(b).digest('hex'),
  }));
  const body = streamZip(files, async function* (f) {
    yield map.get(f.path)!;
  });
  const zip = new Uint8Array(await new Response(body).arrayBuffer()),
    entries = inspectZip(zip);
  expect(entries.map((x) => x.path)).toEqual(['README', 'nested/source.ts']);
  for (const entry of entries) expect(entry.bytes).toEqual(map.get(entry.path));
});
it('corrupt streamed content fails rather than silently producing a complete archive', async () => {
  const body = streamZip(
    [{ path: 'README', size: 2, sha256: '0'.repeat(64) }],
    async function* () {
      yield Buffer.from('no');
    },
  );
  await expect(new Response(body).arrayBuffer()).rejects.toThrow();
});
it('archiver errors close resources and reject the network body', async () => {
  let closed = 0;
  const archive = new ZipArchive(),
    body = streamZip(
      [{ path: 'README', size: 1, sha256: '0'.repeat(64) }],
      async function* () {
        yield Buffer.from('x');
      },
      undefined,
      {
        archive: () => archive,
        resource: (x) => {
          if (x === 'close') closed++;
        },
      },
    );
  archive.emit('error', new Error('Synthetic archiver fault'));
  await expect(new Response(body).arrayBuffer()).rejects.toThrow();
  expect(closed).toBe(1);
});
it('consumer cancellation closes active sources once and does not read the entire project', async () => {
  let reads = 0,
    closed = 0;
  const body = streamZip(
    [{ path: 'large.txt', size: 65536 * 100, sha256: '0'.repeat(64) }],
    async function* () {
      for (let i = 0; i < 100; i++) {
        reads++;
        yield Buffer.alloc(65536, i);
      }
    },
    undefined,
    {
      resource: (x) => {
        if (x === 'close') closed++;
      },
    },
  );
  const reader = body.getReader();
  await reader.read();
  await reader.cancel();
  expect(reads).toBeLessThan(100);
  expect(closed).toBe(1);
});
