import { admittedPath, admittedSize } from '@capstone/domain';
import type { SemesterFile } from '@capstone/domain';
export type Visibility = 'restricted' | 'public';
export interface StagedOriginal {
  id: string;
  original: File;
  relative: string;
  override?: Visibility | undefined;
  skip: boolean;
  replace: boolean;
}
export function destination(base: string, segment: string) {
  if (segment.startsWith('/') || /^[a-z]:/i.test(segment))
    throw Error('Use a relative nested segment.');
  const path = [base, segment].filter(Boolean).join('/');
  if (path) admittedPath(path + '/README');
  return path;
}
export function effectivePolicy(
  row: Pick<StagedOriginal, 'relative' | 'override'>,
  rules: Record<string, Visibility>,
  fallback: Visibility,
) {
  if (row.override) return { value: row.override, source: 'file' };
  const rule = Object.keys(rules)
    .filter((p) => row.relative.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return {
    value: rule ? rules[rule]! : fallback,
    source: rule ? 'folder' : 'batch',
  };
}
export function stagedFolders(rows: Pick<StagedOriginal, 'relative'>[]) {
  return [
    ...new Set(
      rows.flatMap((row) => {
        const p = row.relative.split('/');
        p.pop();
        return p.map((_, i) => p.slice(0, i + 1).join('/'));
      }),
    ),
  ].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}
/** A folder inherits its closest configured ancestor until it has its own rule. */
export function folderPolicy(
  folder: string,
  rules: Record<string, Visibility>,
  fallback: Visibility,
): Visibility {
  return effectivePolicy({ relative: folder + '/README' }, rules, fallback)
    .value;
}
export function plannedRows(
  rows: StagedOriginal[],
  target: string,
  existing: SemesterFile[],
) {
  const seen = new Set<string>();
  return rows.map((row) => {
    const path = [target, row.relative].filter(Boolean).join('/'),
      issues: string[] = [];
    let collision: SemesterFile | undefined;
    try {
      const parsed = admittedPath(path);
      admittedSize(row.original.size);
      collision = existing.find(
        (f) => admittedPath(f.path).canonical === parsed.canonical,
      );
      if (!row.skip) {
        if (seen.has(parsed.canonical))
          issues.push('Duplicate destination within this upload.');
        seen.add(parsed.canonical);
        if (collision && collision.path !== parsed.path)
          issues.push(
            'Case or Unicode spelling conflicts with an existing path. Use its exact spelling or a different destination.',
          );
        else if (collision && !row.replace)
          issues.push(
            'Confirm replacement or skip this existing working mapping.',
          );
      }
    } catch (e) {
      issues.push(e instanceof Error ? e.message : 'Invalid path or size.');
    }
    return { ...row, path, issues: row.skip ? [] : issues, collision };
  });
}
export function replaceOverrides(
  rows: StagedOriginal[],
  rules: Record<string, Visibility>,
  folder: string,
  value: Visibility,
) {
  return {
    rows: rows.map((r) =>
      r.relative.startsWith(folder + '/') ? { ...r, override: undefined } : r,
    ),
    rules: {
      ...Object.fromEntries(
        Object.entries(rules).filter(
          ([p]) => p !== folder && !p.startsWith(folder + '/'),
        ),
      ),
      [folder]: value,
    },
  };
}
