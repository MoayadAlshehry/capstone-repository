import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const ffmpeg: unknown = createRequire(import.meta.url)('ffmpeg-static');
import { root } from '../automation/core.js';
import { assertLocalTooling } from '../local-infrastructure.js';
import { formatFixture } from '../files/formats.js';
function pdf() {
  const stream = 'BT /F1 18 Tf 40 100 Td (Synthetic private PDF preview) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 160] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let data = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(data));
    data += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(data);
}
export async function previewFixtures() {
  assertLocalTooling();
  if (typeof ffmpeg !== 'string')
    throw Error('Pinned development fixture encoder unavailable');
  const dir = join(root, '.local/infra-tests/native-fixtures', randomUUID());
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const files: { path: string; bytes: Buffer }[] = [
    {
      path: 'src/nested/example.ts',
      bytes: Buffer.from('export const message = "Synthetic source";\n'),
    },
    {
      path: 'safe/README.md',
      bytes: Buffer.from(
        '# Synthetic Markdown\n\n**Readable** text and a table.\n\n| A | B |\n|---|---|\n| one | two |\n\n<script>window.__uploadedExecuted=true</script>\n[unsafe](javascript:alert(1))\n![blocked](https://example.invalid/never-fetch.png)\n',
      ),
    },
    {
      path: 'unsafe/display.html',
      bytes: Buffer.from(
        '<html><body onload="window.__uploadedExecuted=true"><script>window.__uploadedExecuted=true;fetch("https://example.invalid/never-fetch")</script></body></html>',
      ),
    },
    {
      path: 'unsafe/source.js',
      bytes: Buffer.from(
        'window.__uploadedExecuted=true;document.body.innerHTML="executed";fetch("https://example.invalid/never-fetch");',
      ),
    },
    {
      path: 'data/safe.json',
      bytes: Buffer.from(
        '{"synthetic":true,"value":"<script>window.__uploadedExecuted=true</script>"}',
      ),
    },
    {
      path: 'data/notebook.ipynb',
      bytes: Buffer.from(
        JSON.stringify({
          nbformat: 4,
          nbformat_minor: 5,
          cells: [
            {
              cell_type: 'code',
              source: ['window.__uploadedExecuted=true'],
              outputs: [
                {
                  output_type: 'display_data',
                  data: {
                    'text/html': [
                      '<script>window.__uploadedExecuted=true</script>',
                    ],
                  },
                },
              ],
            },
          ],
        }),
      ),
    },
    {
      path: 'data/large.csv',
      bytes: Buffer.from(
        Array.from({ length: 205 }, (_, r) =>
          Array.from({ length: 55 }, (_, c) =>
            r === 0 && c === 0 ? '=1+1' : `r${r}c${c}`,
          ).join(','),
        ).join('\n'),
      ),
    },
    {
      path: 'data/malformed.csv',
      bytes: Buffer.from('a,b\n"unterminated,value\n'),
    },
    { path: 'documents/synthetic.pdf', bytes: pdf() },
    {
      path: 'documents/malformed.pdf',
      bytes: Buffer.from('%PDF-1.4\nSynthetic malformed body\n%%EOF\n'),
    },
    {
      path: 'documents/original.docx',
      bytes: Buffer.from(formatFixture('docx')),
    },
    {
      path: 'documents/original.pptx',
      bytes: Buffer.from(formatFixture('pptx')),
    },
    {
      path: 'large/truncated.txt',
      bytes: Buffer.concat([
        Buffer.alloc(999999, 97),
        Buffer.from('€ trailing synthetic text'),
      ]),
    },
    {
      path: 'عربي/ملف.ts',
      bytes: Buffer.from('export const synthetic = "بيانات";\n'),
    },
  ];
  try {
    for (const extension of ['png', 'jpg', 'webp']) {
      const target = join(dir, 'image.' + extension);
      const result = spawnSync(
        ffmpeg,
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x146b62:s=64x64',
          '-frames:v',
          '1',
          '-y',
          target,
        ],
        { timeout: 20000 },
      );
      if (result.status !== 0) throw Error('Synthetic image generation failed');
      files.push({
        path: 'images/synthetic.' + extension,
        bytes: await readFile(target),
      });
    }
    for (const extension of ['mp3', 'wav']) {
      const target = join(dir, 'sound.' + extension);
      const result = spawnSync(
        ffmpeg,
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=0.4',
          '-ar',
          '16000',
          '-ac',
          '1',
          '-y',
          target,
        ],
        { timeout: 20000 },
      );
      if (result.status !== 0) throw Error('Synthetic audio generation failed');
      files.push({
        path: 'media/synthetic.' + extension,
        bytes: await readFile(target),
      });
    }
    const target = join(dir, 'video.mp4');
    const result = spawnSync(
      ffmpeg,
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x146b62:s=64x64:d=0.4',
        '-r',
        '10',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-an',
        '-y',
        target,
      ],
      { timeout: 20000 },
    );
    if (result.status !== 0) throw Error('Synthetic video generation failed');
    files.push({ path: 'media/synthetic.mp4', bytes: await readFile(target) });
    return files;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
