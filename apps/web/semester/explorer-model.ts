import type { SemesterFile } from '@capstone/domain';
export interface ExplorerView {
  folder: string;
  query: string;
  search: 'folder' | 'edition';
  sort: 'name' | 'size';
  mode: 'list' | 'grid';
  selected: string;
  reading: boolean;
  scroll: number;
}
export const scopeKey = (
  actor: string,
  project: string,
  version: string,
  submission?: string,
) => [actor, project, version, submission ?? 'working'].join(':');
type Entry =
  | { kind: 'folder'; key: string; name: string; path: string; count: number }
  | {
      kind: 'file';
      key: string;
      name: string;
      path: string;
      file: SemesterFile;
    };
export function scopedEntries(
  files: SemesterFile[],
  view: ExplorerView,
  locale: string,
): Entry[] {
  const q = view.query.trim().toLocaleLowerCase(locale),
    parent = (p: string) => p.split('/').slice(0, -1).join('/'),
    all = q && view.search === 'edition';
  const matches = files.filter(
    (f) =>
      (all || parent(f.path) === view.folder) &&
      (!q ||
        (all ? f.path : f.path.split('/').at(-1)!)
          .toLocaleLowerCase(locale)
          .includes(q)),
  );
  const result: Entry[] = matches.map((f) => ({
    kind: 'file',
    key: f.id,
    name: f.path.split('/').at(-1)!,
    path: f.path,
    file: f,
  }));
  if (!all) {
    const prefix = view.folder ? view.folder + '/' : '';
    const folders = new Map<string, number>();
    for (const file of files) {
      if (!file.path.startsWith(prefix)) continue;
      const rest = file.path.slice(prefix.length).split('/');
      if (rest.length < 2) continue;
      const p = prefix + rest[0];
      folders.set(p, (folders.get(p) ?? 0) + 1);
    }
    for (const [p, count] of folders)
      if (!q || p.split('/').at(-1)!.toLocaleLowerCase(locale).includes(q))
        result.push({
          kind: 'folder',
          key: 'folder:' + p,
          name: p.split('/').at(-1)!,
          path: p,
          count,
        });
  }
  return result.sort((a, b) =>
    a.kind !== b.kind
      ? a.kind === 'folder'
        ? -1
        : 1
      : view.sort === 'size' &&
          a.kind === 'file' &&
          b.kind === 'file' &&
          a.file.size !== b.file.size
        ? b.file.size - a.file.size
        : a.name.localeCompare(b.name, locale, { numeric: true }) ||
          a.path.localeCompare(b.path, locale, { numeric: true }) ||
          a.key.localeCompare(b.key),
  );
}
