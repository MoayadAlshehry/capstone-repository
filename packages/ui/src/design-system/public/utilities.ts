import type { FileEntry } from './model.js';
export function matchingFiles(
  files: FileEntry[],
  query: string,
  folder: string,
) {
  return files.filter(
    (f) =>
      (!query || f.path.toLowerCase().includes(query.toLowerCase())) &&
      (!folder ||
        (f.path.includes('/')
          ? f.path.slice(0, f.path.lastIndexOf('/'))
          : '/') === folder),
  );
}
