import 'server-only';
import { assertCurrentGeneration } from './generation';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { discovery } from '../discovery/server';
import { nativeReader } from '../native-files/server';
import type { AccountView } from '@capstone/db/auth';
import type { NativeFile } from '@capstone/domain';
import { aiEnabled } from './runtime';
import { AIError, type AIProject, type AIIndex, type AISource } from './types';
import { LIMITS, digest, chunkText } from './core';
export type PublicScope = {
  project: AIProject;
  files: NativeFile[];
  fingerprint: string;
};
export async function scope(
  project: string,
  account: AccountView | null,
): Promise<PublicScope> {
  if (!(await aiEnabled())) throw new AIError('DISABLED', 404);
  await assertCurrentGeneration();
  const p = await discovery().detail(project, account);
  // The authoritative projection omits evaluation for concealed review sessions.
  // AI never broadens their evidence packet via the anonymous public path.
  if (account && !Object.hasOwn(p, 'evaluation'))
    throw new AIError('REVIEW_CONTEXT_RESTRICTED', 403);
  const files = await (
    await nativeReader()
  ).list({ kind: 'public' }, p.project, p.version);
  const safe: AIProject = {
    project: p.project,
    version: p.version,
    title: p.title,
    abstract: p.abstract,
    keywords: p.keywords,
    university: p.university,
    department: p.department,
    academicYear: p.academicYear,
    domain: p.domain,
    publishedAt: p.publishedAt,
  };
  const fingerprint = digest([
    safe,
    files
      .map((f) => [f.id, f.sha256, f.size, f.path, f.visibility, f.status])
      .sort(),
  ]);
  return { project: safe, files, fingerprint };
}
export async function recheck(
  previous: PublicScope,
  account: AccountView | null,
) {
  const current = await scope(previous.project.project, account);
  if (
    current.fingerprint !== previous.fingerprint ||
    current.project.version !== previous.project.version
  )
    throw new AIError('SOURCE_CHANGED', 409);
}
export function metadataSource(p: AIProject): AISource {
  return {
    id: 'S1',
    project: p.project,
    version: p.version,
    file: null,
    name: 'Project abstract',
    hash: digest([p.title, p.abstract, p.keywords]),
    text: p.title + '\n' + p.abstract + '\nTopics: ' + p.keywords.join(', '),
    page: null,
    lineStart: null,
    lineEnd: null,
  };
}
async function bytes(
  project: AIProject,
  file: NativeFile,
  signal: AbortSignal,
) {
  const r = await (
    await nativeReader()
  ).bytes(
    { kind: 'public' },
    project.project,
    project.version,
    file.id,
    'original',
    null,
    undefined,
    signal,
  );
  const pieces: Buffer[] = [];
  let size = 0;
  for await (const b of r.stream) {
    size += b.byteLength;
    if (size > LIMITS.fileBytes) throw new AIError('FILE_LIMIT');
    pieces.push(Buffer.from(b));
  }
  return Buffer.concat(pieces);
}
/** Internal read primitive: IDs only, current public ACL before and after bytes. */
export async function readScopedFile(
  s: PublicScope,
  fileId: string,
  account: AccountView | null,
  signal: AbortSignal,
) {
  if (!/^[a-f0-9-]{36}$/i.test(fileId))
    throw new AIError('INVALID_TOOL_INPUT', 400);
  await recheck(s, account);
  const file = s.files.find((file) => file.id === fileId);
  if (!file) throw new AIError('NOT_FOUND', 404);
  if (file.size > LIMITS.fileBytes) throw new AIError('FILE_LIMIT', 413);
  const raw = await bytes(s.project, file, signal);
  if (
    raw.length !== file.size ||
    createHash('sha256').update(raw).digest('hex') !== file.sha256
  )
    throw new AIError('SOURCE_CHANGED', 409);
  await recheck(s, account);
  if (signal.aborted) throw new AIError('CANCELLED', 499);
  return { file, raw };
}
function pdfText(bytes: Buffer, signal: AbortSignal) {
  return new Promise<string>((yes, no) => {
    const child = execFile(
      '/usr/bin/pdftotext',
      [
        '-layout',
        '-enc',
        'UTF-8',
        '-f',
        '1',
        '-l',
        String(LIMITS.pages),
        '-',
        '-',
      ],
      {
        timeout: LIMITS.extractionMs,
        maxBuffer: 500_000,
        encoding: 'utf8',
        signal,
      },
      (e, out) =>
        e
          ? no(new AIError(signal.aborted ? 'CANCELLED' : 'EXTRACTION_FAILED'))
          : yes(out),
    );
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(bytes);
  });
}
const textExtensions = new Set([
  'md',
  'txt',
  'json',
  'yaml',
  'yml',
  'csv',
  'py',
  'ts',
  'tsx',
  'js',
  'jsx',
  'java',
  'c',
  'cpp',
  'h',
  'css',
  'html',
  'xml',
  'sql',
]);
export function supportedFile(f: Pick<NativeFile, 'name' | 'size'>) {
  const ext = f.name.split('.').at(-1)?.toLowerCase() ?? '';
  return (
    f.size <= LIMITS.fileBytes &&
    (ext === 'pdf' ||
      textExtensions.has(ext) ||
      /^(readme|license)$/i.test(f.name))
  );
}
export async function extractPublic(
  s: PublicScope,
  signal: AbortSignal,
): Promise<AIIndex> {
  const sources: AISource[] = [metadataSource(s.project)];
  const coverage: AIIndex['coverage'] = {
    supported: 0,
    indexed: 0,
    chunks: 0,
    skipped: [],
    limits: [],
  };
  let used = 0,
    files = 0;
  for (const f of [...s.files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (signal.aborted) throw new AIError('CANCELLED', 499);
    if (!supportedFile(f)) {
      coverage.skipped.push({
        name: f.path,
        reason: f.size > LIMITS.fileBytes ? 'size-limit' : 'unsupported-format',
      });
      continue;
    }
    coverage.supported++;
    if (
      ++files > LIMITS.fileCount ||
      used >= LIMITS.projectText ||
      sources.length >= LIMITS.chunks
    ) {
      coverage.skipped.push({ name: f.path, reason: 'project-limit' });
      continue;
    }
    try {
      const input = await bytes(s.project, f, signal);
      const base = {
        project: s.project.project,
        version: s.project.version,
        file: f.id,
        name: f.path,
        hash: f.sha256,
        page: null,
      };
      let chunks: AISource[] = [];
      if (/\.pdf$/i.test(f.name)) {
        const text = await pdfText(input, signal),
          pages = text.split('\f');
        for (let i = 0; i < Math.min(pages.length, LIMITS.pages); i++) {
          const allowed = Math.max(
            0,
            Math.min(
              LIMITS.fileText - chunks.reduce((n, c) => n + c.text.length, 0),
              LIMITS.projectText - used,
            ),
          );
          if (!allowed) break;
          chunks.push(...chunkText(pages[i]!.slice(0, allowed), base, i + 1));
        }
        if (pages.length >= LIMITS.pages)
          coverage.limits.push(
            f.path + ': first ' + LIMITS.pages + ' PDF pages maximum',
          );
      } else {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(input);
        if (text.includes('\0')) throw new AIError('UNSUPPORTED_ENCODING');
        const take = Math.min(LIMITS.fileText, LIMITS.projectText - used);
        chunks = chunkText(text.slice(0, take), base);
        if (text.length > take)
          coverage.limits.push(f.path + ': bounded text extraction');
      }
      chunks = chunks.slice(0, Math.max(0, LIMITS.chunks - sources.length));
      if (!chunks.length) {
        coverage.skipped.push({ name: f.path, reason: 'no-extractable-text' });
        continue;
      }
      sources.push(...chunks);
      used += chunks.reduce((n, c) => n + c.text.length, 0);
      coverage.indexed++;
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof AIError && error.code === 'CANCELLED')
      )
        throw error;
      coverage.skipped.push({ name: f.path, reason: 'extraction-failed' });
    }
  }
  coverage.chunks = sources.length;
  return {
    fingerprint: s.fingerprint,
    coverage,
    sources: sources.map((s, i) => ({ ...s, id: 'S' + (i + 1) })),
  };
}
