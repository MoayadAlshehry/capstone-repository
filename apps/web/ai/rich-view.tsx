'use client';
import { SpecSheet } from '@/components/assistant-ui/elements/spec-sheet';
import { DataTable } from '@/components/assistant-ui/elements/data-table';
import { Citation } from '@/components/assistant-ui/elements/inline-citation';
import type { RichBlock, AICitation } from './types';
import { useAISystem } from './context';
/** Only the server-owned validated union reaches these installed renderers. */
export function RichAnswer({
  block,
  sources,
}: {
  block: RichBlock;
  sources: AICitation[];
}) {
  const ui = useAISystem(),
    ar = (block.locale ?? ui.locale) === 'ar';
  const sourceLinks = (ids: string[]) =>
    ids.map((id) => {
      const s = sources.find((s) => s.id === id);
      return s ? (
        <Citation
          key={id}
          index={sources.indexOf(s)}
          source={{ title: s.label, url: s.href, snippet: s.quote }}
        />
      ) : null;
    });
  return (
    <div className="my-3 grid gap-3">
      {block.type === 'specSheet' ? (
        <SpecSheet
          title={block.title}
          visibleCount={block.rows.length}
          rows={block.rows.map((row) => ({
            label: row.label,
            value: (
              <>
                {row.value} {sourceLinks(row.sourceIds)}
              </>
            ),
          }))}
        />
      ) : (
        <DataTable
          locale={ar ? 'ar' : 'en'}
          caption={block.title}
          columns={[
            ...block.columns.map((label, i) => ({
              key: 'c' + i,
              label,
              width:
                block.type === 'fileTable'
                  ? ['38%', '16%', '30%'][i]
                  : i === 0
                    ? '24%'
                    : '60%',
              sortable: false,
            })),
            {
              key: 'source',
              width: '16%',
              label:
                block.type === 'fileTable'
                  ? ar
                    ? 'فتح'
                    : 'Open'
                  : ar
                    ? 'المصدر'
                    : 'Source',
              format: { kind: 'link', hrefKey: 'sourceHref' },
              sortable: false,
            },
          ]}
          rows={block.rows.map((row) =>
            Object.fromEntries([
              ...row.cells.map((cell, i) => [
                'c' + i,
                // DataTable intentionally accepts text, not arbitrary HTML.
                // Isolate literal inline code and file paths inside Arabic
                // prose without mirroring the table or interpreting markup.
                cell === null
                  ? null
                  : block.type === 'fileTable' && i === 0
                    ? '\u2066' + cell + '\u2069'
                    : cell.replace(/`([^`\n]+)`/g, '\u2066$1\u2069'),
              ]),
              [
                'source',
                block.type === 'fileTable'
                  ? ar
                    ? 'فتح'
                    : 'Open'
                  : String(
                      sources.findIndex((s) => s.id === row.sourceIds[0]) + 1,
                    ),
              ],
              [
                'sourceHref',
                sources.find((s) => s.id === row.sourceIds[0])?.href ?? '',
              ],
            ]),
          )}
        />
      )}
    </div>
  );
}
