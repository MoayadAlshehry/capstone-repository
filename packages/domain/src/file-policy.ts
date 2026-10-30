export const FILE_BYTES = 250_000_000;
export const PROJECT_BYTES = 1_000_000_000;
export const VERSION_PATHS = 10_000;
export const PATH_CHARACTERS = 512;
export const DOCUMENT_EXTENSIONS =
  'pdf docx pptx csv txt md png jpg jpeg webp mp4 mp3 wav'.split(' ');
export const SOURCE_EXTENSIONS =
  'ts tsx js jsx mjs cjs py java c h cpp hpp cs go rs php rb swift kt kts dart r m sh ps1 sql html css scss sass less vue svelte json yml yaml toml xml ini ipynb gitignore'.split(
    ' ',
  );
export const EXTENSIONLESS_NAMES = [
  'README',
  'LICENSE',
  'Dockerfile',
  'Makefile',
];
export const DEFAULT_FILE_VISIBILITY = 'restricted' as const;
export class FilePolicyError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join('; '));
    this.name = 'FilePolicyError';
  }
}
export function admittedPath(input: string) {
  const issues: string[] = [];
  const path = input.replaceAll('\\', '/');
  if ([...path].length > PATH_CHARACTERS)
    issues.push('Path exceeds 512 characters');
  if (/^\/|^[a-z]:/i.test(path))
    issues.push('Path must be relative without a drive prefix');
  if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(path))
    issues.push(
      'Path contains a control, direction or invalid Unicode character',
    );
  const segments = path.split('/');
  if (
    segments.some(
      (s) =>
        !s ||
        s === '.' ||
        s === '..' ||
        /[<>:"|?*]/u.test(s) ||
        /[. ]$/.test(s) ||
        /^\s/.test(s),
    )
  )
    issues.push('Path contains an invalid or empty segment');
  if (
    segments.some((s) => /^(?:\.git|node_modules|vendor|dist|build)$/i.test(s))
  )
    issues.push('Dependency, build and internal directories are excluded');
  if (segments.some((s) => /^\.env(?:[._-].*)?$/i.test(s)))
    issues.push('Environment-secret files are excluded');
  if (
    segments.some((s) =>
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s),
    )
  )
    issues.push('Reserved device names are excluded');
  const name = segments.at(-1) ?? '';
  const extension =
    name.toLowerCase() === '.gitignore'
      ? 'gitignore'
      : name.includes('.')
        ? name.slice(name.lastIndexOf('.') + 1).toLowerCase()
        : '';
  if (
    !DOCUMENT_EXTENSIONS.includes(extension) &&
    !SOURCE_EXTENSIONS.includes(extension) &&
    !(extension === '' && EXTENSIONLESS_NAMES.includes(name))
  )
    issues.push('File name or extension is not allowlisted');
  if (issues.length) throw new FilePolicyError(issues);
  // Preserve original Unicode spelling. NFC and case fold are an ambiguity key only.
  return {
    path,
    canonical: path.normalize('NFC').toLowerCase(),
    name,
    extension,
  };
}
export function validateSelection(paths: readonly string[]) {
  const seen = new Map<string, string>();
  return paths.map((input) => {
    try {
      const value = admittedPath(input),
        previous = seen.get(value.canonical);
      if (previous !== undefined)
        throw new FilePolicyError([
          previous.normalize('NFC') !== previous ||
          value.path.normalize('NFC') !== value.path
            ? 'Unicode-normalization ambiguity'
            : 'Duplicate case-insensitive logical path',
        ]);
      seen.set(value.canonical, value.path);
      return { input, value, issues: [] };
    } catch (e) {
      if (e instanceof FilePolicyError) return { input, issues: e.issues };
      throw e;
    }
  });
}
export function admittedSize(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > FILE_BYTES)
    throw new FilePolicyError(['File size must be 0–250,000,000 bytes']);
  return bytes;
}
export function quotaValues(used: number, reserved: number) {
  if (
    !Number.isSafeInteger(used) ||
    !Number.isSafeInteger(reserved) ||
    used < 0 ||
    reserved < 0 ||
    used + reserved > PROJECT_BYTES
  )
    throw new FilePolicyError(['Project quota exceeded']);
  return {
    used,
    reserved,
    available: PROJECT_BYTES - used - reserved,
    limit: PROJECT_BYTES,
  };
}
export function pathCapacity(current: number, newPaths: number) {
  if (
    !Number.isSafeInteger(current) ||
    !Number.isSafeInteger(newPaths) ||
    current < 0 ||
    newPaths < 0 ||
    current + newPaths > VERSION_PATHS
  )
    throw new FilePolicyError(['Version exceeds 10,000 paths']);
  return current + newPaths;
}
