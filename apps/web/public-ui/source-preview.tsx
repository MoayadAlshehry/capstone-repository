'use client';
import { BidiValue } from '@capstone/ui/bidi';
import { csvRows } from '../../../packages/ui/src/design-system/public/text-format';
import { useSite } from './model';
// Existing source renderer body retained; only module paths adapt to the web workspace.
export function SourcePreview({
  file,
  content,
  wrap = true,
  numbers = false,
}: {
  file: { path: string; kind: string };
  content: string | undefined;
  wrap?: boolean;
  numbers?: boolean;
}) {
  const {
    t,
    l,
    ar,
    contents,
    syntaxTokens: tokens,
    renderMarkdown,
    integration,
  } = useSite();
  if (content === undefined)
    return (
      <div className="preview-unavailable">
        <h3 dir="auto">{t('Preview unavailable')}</h3>
        <p dir="auto">
          {t('This format is available as an original download.')}
        </p>
      </div>
    );
  if (['md', 'csv', 'code'].includes(file.kind) && !content.trim())
    return (
      <p dir="auto" className="empty-source">
        {l('This public file is empty.', 'هذا الملف العام فارغ.')}
      </p>
    );
  if (file.kind === 'md')
    return (
      <article
        className="markdown"
        dir={integration ? 'auto' : 'ltr'}
        lang={integration ? undefined : 'en'}
      >
        {renderMarkdown(content)}
      </article>
    );
  if (file.kind === 'csv') {
    const rows = csvRows(content) as string[][];
    if (!rows.length || !rows[0]?.length)
      return <p dir="auto">{t('No files match')}</p>;
    return (
      <div
        className="table-scroll"
        role="region"
        tabIndex={0}
        aria-label={t('File preview')}
      >
        <table dir="ltr">
          <caption dir={ar ? 'rtl' : 'ltr'}>
            <BidiValue kind="path">{file.path}</BidiValue> ·{' '}
            {l(
              rows.length - 1 + ' rows / ' + rows[0].length + ' columns',
              new Intl.NumberFormat('ar').format(rows.length - 1) +
                ' صفوف / ' +
                new Intl.NumberFormat('ar').format(rows[0].length) +
                ' أعمدة',
            )}
          </caption>
          <thead>
            <tr>
              {rows[0].map((v, i) => (
                <th dir="auto" key={i} scope="col">
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td dir="auto" key={j}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (file.kind === 'code') {
    const key = Object.keys(contents).find((k) => contents[k] === content),
      lines = (
        tokens as Record<string, { content: string; color: string }[][]>
      )[key || ''];
    return (
      <pre
        className="code"
        tabIndex={0}
        dir="ltr"
        data-wrap={wrap}
        aria-label={t('File preview')}
      >
        <code>
          {content.split(/(\r\n|\n|\r)/).map((part, i) =>
            i % 2 ? (
              part
            ) : (
              <span
                className="code-line"
                key={i}
                data-source-line-start={i / 2 + 1}
                data-source-line-end={i / 2 + 1}
              >
                {numbers && (
                  <span className="line-number" aria-hidden="true">
                    {i / 2 + 1}
                  </span>
                )}
                {lines?.[i / 2]?.map((x) => x.content).join('') === part ? (
                  lines![i / 2]!.map((token, j) => (
                    <span
                      key={j}
                      className="syntax-token"
                      style={{ color: token.color }}
                    >
                      <BidiValue kind="token">{token.content}</BidiValue>
                    </span>
                  ))
                ) : (
                  <BidiValue kind="code">{part}</BidiValue>
                )}
              </span>
            ),
          )}
        </code>
      </pre>
    );
  }
  if (file.kind === 'image')
    return <img className="preview-image" src={content} alt={file.path} />;
  if (file.kind === 'pdf')
    return <iframe className="pdf-viewer" title={file.path} src={content} />;
  return (
    <div className="preview-unavailable">
      <h3 dir="auto">{t('Preview unavailable')}</h3>
      <p dir="auto">{t('This format is available as an original download.')}</p>
    </div>
  );
}
