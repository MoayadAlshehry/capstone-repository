import 'server-only';
import { previewFamily } from '@capstone/domain';
import type { PublicScope } from './sources';
import type { AILocale, AISource, RichBlock } from './types';
/** Server-owned read-only projection of the exact authorized manifest, no model. */
export function publicFileTable(
  scope: PublicScope,
  locale: AILocale,
): { block: RichBlock; sources: AISource[] } {
  const ar = locale === 'ar';
  const files = [...scope.files].sort((a, b) => a.path.localeCompare(b.path));
  const sources: AISource[] = files.map((file, i) => ({
    id: 'S' + (i + 1),
    project: scope.project.project,
    version: scope.project.version,
    file: file.id,
    name: file.path,
    hash: file.sha256,
    page: null,
    lineStart: null,
    lineEnd: null,
    text: 'Public file manifest\nPath: ' + file.path + '\nType: ' + file.mime,
  }));
  return {
    sources,
    block: {
      type: 'fileTable',
      title: ar
        ? 'محتويات المشروع — الملفات العامة'
        : 'Project contents — public files',
      columns: ar ? ['الملف', 'النوع', 'الغرض'] : ['File', 'Type', 'Purpose'],
      rows: files.map((file, i) => ({
        cells: [
          file.path,
          file.extension.toUpperCase() || file.mime,
          (ar ? 'غير مبيّن في سجل الملفات' : 'Not specified in manifest') +
            (previewFamily(file) === 'unsupported'
              ? ar
                ? ' · الملف الأصلي متاح'
                : ' · Original available'
              : ''),
        ],
        sourceIds: [sources[i]!.id],
      })),
    },
  };
}
