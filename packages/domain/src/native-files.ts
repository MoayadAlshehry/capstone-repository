export const TEXT_PREVIEW_BYTES = 1_000_000;
export const CSV_PREVIEW_ROWS = 200;
export const CSV_PREVIEW_COLUMNS = 50;
export interface NativeFile {
  id: string;
  project: string;
  version: string;
  path: string;
  name: string;
  extension: string;
  mime: string;
  size: number;
  sha256: string;
  visibility: string;
  status: string;
  uploadedLicense?: boolean;
  uploader?: string;
  uploaderRole?: string;
  uploadedAt?: string;
}
/** Selection happens only after an exact-scope permitted manifest has been read. */
export function uploadedLicenseFile<
  T extends { path: string; uploadedLicense?: boolean },
>(files: readonly T[]): T | undefined {
  return files
    .filter(
      (f) =>
        f.uploadedLicense === true &&
        /^(?:[^/]+\/)*license(?:\.md|\.txt)?$/i.test(f.path) &&
        !f.path.split('/').some((p) => p === '.' || p === '..'),
    )
    .sort(
      (a, b) =>
        a.path.split('/').length - b.path.split('/').length ||
        a.path.localeCompare(b.path, 'en'),
    )[0];
}
export type PreviewFamily =
  | 'source'
  | 'markdown'
  | 'json'
  | 'csv'
  | 'pdf'
  | 'image'
  | 'audio'
  | 'video'
  | 'unsupported';
export interface NativePreview {
  meta: NativeFile;
  family: PreviewFamily;
  integrityVerified: true;
  truncated: boolean;
  previewBytes: number;
  text?: string;
  rows?: string[][];
  columnsTruncated?: boolean;
  cellsTruncated?: boolean;
  tokens?: { content: string; light: string; dark: string }[][];
  language?: string;
  error?: 'MALFORMED' | 'IMAGE_LIMIT';
}
export function previewFamily(
  file: Pick<NativeFile, 'extension' | 'mime'>,
): PreviewFamily {
  const ext = file.extension,
    mime = file.mime;
  if (ext === 'pdf' && mime === 'application/pdf') return 'pdf';
  if (
    ['png', 'jpg', 'jpeg', 'webp'].includes(ext) &&
    ['image/png', 'image/jpeg', 'image/webp'].includes(mime)
  )
    return 'image';
  if (
    ['mp3', 'wav'].includes(ext) &&
    ['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(mime)
  )
    return 'audio';
  if (ext === 'mp4' && mime === 'video/mp4') return 'video';
  if (['docx', 'pptx'].includes(ext)) return 'unsupported';
  if (!['text/plain', 'text/csv', 'application/json'].includes(mime))
    return 'unsupported';
  if (ext === 'md') return 'markdown';
  if (['json', 'ipynb'].includes(ext)) return 'json';
  if (ext === 'csv') return 'csv';
  return 'source';
}
export interface NativeNode {
  name: string;
  path: string;
  file?: NativeFile;
  children: NativeNode[];
}
export function nativeTree(files: readonly NativeFile[]): NativeNode[] {
  const root: NativeNode[] = [];
  for (const file of files) {
    let nodes = root,
      path = '';
    const parts = file.path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      path = path ? path + '/' + name : name;
      const leaf = i === parts.length - 1;
      let node = nodes.find((x) => x.path === path && !!x.file === leaf);
      if (!node) {
        node = { name, path, children: [] };
        nodes.push(node);
      }
      if (i === parts.length - 1) node.file = file;
      nodes = node.children;
    }
  }
  function order(nodes: NativeNode[]) {
    nodes.sort(
      (a, b) =>
        Number(!!a.file) - Number(!!b.file) ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );
    for (const n of nodes) order(n.children);
  }
  order(root);
  return root;
}
export function nativeRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size <= 0)
    throw Error('INVALID_RANGE');
  const left = match[1] ? Number(match[1]) : null,
    right = match[2] ? Number(match[2]) : null;
  if (
    (left !== null && !Number.isSafeInteger(left)) ||
    (right !== null && !Number.isSafeInteger(right))
  )
    throw Error('INVALID_RANGE');
  const start = left === null ? Math.max(0, size - (right ?? 0)) : left;
  const end =
    left === null
      ? size - 1
      : right === null
        ? size - 1
        : Math.min(right, size - 1);
  if (
    start < 0 ||
    start >= size ||
    end < start ||
    (left === null && right === 0)
  )
    throw Error('INVALID_RANGE');
  return { start, end, length: end - start + 1 };
}
export function safeMarkdownUrl(value: string) {
  if (/^https?:\/\//i.test(value) && !/[\x00-\x20\x7f]/.test(value))
    return value;
  if (/^#[a-z0-9_-]+$/i.test(value)) return value;
  return '';
}
