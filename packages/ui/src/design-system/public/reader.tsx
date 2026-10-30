'use client';
import { BidiValue } from '../../bidi.js';
import { useState, useEffect, useRef } from 'react';
import { matchingFiles } from './utilities.js';
import { csvRows } from './text-format.js';
import { useSite, useUrlFile, type Project, type FileEntry } from './model.js';
import { Modal } from './primitives.js';
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
        <p dir="auto">{t('This format is available as an original download.')}</p>
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
    if (!rows.length || !rows[0]?.length) return <p dir="auto">{t('No files match')}</p>;
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
                  <td dir="auto" key={j}>{v}</td>
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
              <span className="code-line" key={i} data-source-line-start={i / 2 + 1} data-source-line-end={i / 2 + 1}>
                {numbers && (
                  <span className="line-number" aria-hidden="true">
                    {i / 2 + 1}
                  </span>
                )}
                {lines?.[i / 2]?.map((x) => x.content).join('') === part
                  ? lines![i / 2]!.map((token, j) => (
                      <span
                        key={j}
                        className="syntax-token"
                        style={{ color: token.color }}
                      >
                        <BidiValue kind="token">{token.content}</BidiValue>
                      </span>
                    ))
                  : <BidiValue kind="code">{part}</BidiValue>}
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
export function Reader({
  p,
  pinnable = false,
}: {
  p: Project;
  pinnable?: boolean;
}) {
  const {
    t,
    l,
    currentUrl,
    contents,
    fileSelection,
    downloadAll,
    fileLink,
    integration,
  } = useSite();
  const { file, select } = useUrlFile(p);
  const requested = fileSelection.requested,
    invalidFile =
      !!requested && !p.publicFiles.some((f) => f.path === requested);
  const [query, Q] = useState(''),
    [folder, F] = useState(integration?.initialDirectory ?? ''),
    [sheet, S] = useState(false),
    [focus, E] = useState(false),
    [wrap, W] = useState(true),
    [numbers, N] = useState(false),
    [notice, T] = useState(''),
    [pinned, P] = useState(true);
  const inline = useRef<HTMLDivElement>(null),
    focusBody = useRef<HTMLDivElement>(null),
    savedScroll = useRef(0),
    focusStart = useRef(0),
    focusTouched = useRef(false);
  const choose = (path: string) => {
    if (path !== file?.path) {
      savedScroll.current = 0;
      focusStart.current = 0;
      focusTouched.current = false;
      if (inline.current) inline.current.scrollTop = 0;
      if (focusBody.current) focusBody.current.scrollTop = 0;
    }
    select(path);
    S(false);
    T('');
  };
  const copy = async (code = false) => {
    if (!file) return;
    if (code && contents[file.contentKey] === undefined) {
      T(t('Preview unavailable'));
      return;
    }
    const value = code ? contents[file.contentKey] : fileLink(p, file.path);
    try {
      await navigator.clipboard.writeText(value ?? '');
      T(t('linkCopied'));
    } catch {
      T(t('Copy unavailable. Select this link:') + ' ' + value);
    }
  };
  const inventory = (
    <div className="file-inventory">
      <label dir="auto">
        {t('findFile')}
        <input
          type="search"
          value={query}
          onChange={(e) => Q(e.target.value)}
          placeholder={t('findFile')}
        />
      </label>
      <label dir="auto">
        {t('Folder')}
        <select dir="ltr" value={folder} onChange={(e) => F(e.target.value)}>
          <option value="">{t('All folders')}</option>
          {[
            ...new Set(
              p.publicFiles.map((f) =>
                f.path.includes('/')
                  ? f.path.slice(0, f.path.lastIndexOf('/'))
                  : '/',
              ),
            ),
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <nav aria-label={t('chooseFile')}>
        {matchingFiles(p.publicFiles, query, folder).map((f: FileEntry) => (
          <button
            key={f.path}
            onClick={() => choose(f.path)}
            aria-pressed={file?.path === f.path}
          >
            <span className="file-kind">{f.kind.toUpperCase()}</span>
            <strong dir="ltr"><BidiValue kind="path">{f.path.split('/').pop()}</BidiValue></strong>
            <small dir="ltr">
              <BidiValue kind="path">{f.path.includes('/')
                ? f.path.slice(0, f.path.lastIndexOf('/')) + '/'
                : '/'}</BidiValue>{' '}
              · {f.sizeBytes} B
            </small>
          </button>
        ))}
      </nav>
      {!matchingFiles(p.publicFiles, query, folder).length && (
        <p dir="auto" role="status">{t('No files match')}</p>
      )}
    </div>
  );
  const toolbar = (
    <div className={'reader-toolbar'+(integration?.literalMetadata&&file?.kind==='pdf'?' reader-pdf-meta':'')}>
      <div>
        {integration ? (
          <h3 dir="ltr" className="p3-reader-title"><BidiValue kind="path">
            {file?.path.split('/').pop()}
          </BidiValue></h3>
        ) : (
          <strong dir="ltr"><BidiValue kind="path">{file?.path.split('/').pop()}</BidiValue></strong>
        )}
        <details onKeyDown={e=>{if(e.key==='Escape'&&e.currentTarget.open){e.preventDefault();e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
          <summary>{t('File details')}</summary>
          <p dir="ltr"><BidiValue kind="path">{file?.path}</BidiValue></p>
          <span>
            {file?.kind.toUpperCase()} · {file?.sizeBytes} B
          </span>
          {integration?.literalMetadata&&file?.kind==='pdf'&&<button onClick={()=>copy()}>{t('copyLink')}</button>}
        </details>
      </div>
      <div className="file-actions" hidden={integration?.literalMetadata&&file?.kind==='pdf'}>
        <a className="button" download href={file?.originalUrl}>
          {t('download')} ↓
        </a>
        <button onClick={() => copy()}>{t('copyLink')}</button>
      </div>
    </div>
  );
  const viewer = (
    <>
      <div className="code-toolbar" hidden={file?.kind !== 'code'}>
        <button aria-pressed={wrap} onClick={() => W(!wrap)}>
          {t('Wrap lines')}
        </button>
        <button aria-pressed={numbers} onClick={() => N(!numbers)}>
          {t('Line numbers')}
        </button>
        <button onClick={() => copy(true)}>{t('copyCode')}</button>
      </div>
      <div className="source-language" hidden={integration?.literalMetadata&&file?.kind==='pdf'}>
        {integration?.sourceLabel ?? t('Source file · English')}
      </div>
      {integration?.readerNotice}
      {integration?.preview ?? (
        <SourcePreview
          file={file!}
          content={contents[file?.contentKey ?? '']}
          wrap={wrap}
          numbers={numbers}
        />
      )}
    </>
  );
  useEffect(() => {
    if (focus)
      requestAnimationFrame(() => {
        if (focusBody.current) {
          focusBody.current.scrollTop = savedScroll.current;
          focusStart.current = focusBody.current.scrollTop;
          focusTouched.current = false;
        }
      });
  }, [focus]);
  useEffect(() => {
    if (new URL(currentUrl).hash === '#files')
      document.fonts.ready.then(() =>
        requestAnimationFrame(() =>
          document.getElementById('files')?.scrollIntoView(),
        ),
      );
  }, []);
  if (!file)
    return (
      <section
        id="files"
        ref={integration?.readerRootRef}
        className="public-reader reader-empty"
        data-ui="file-reader"
      >
        <span className="eyebrow">{t('Public files')}</span>
        <h2 dir="auto">{t('files')}</h2>
        <p dir="auto">{t('publicFilesEmpty')}</p>
        <a className="secondary" href="#overview">
          {t('Overview')} ↑
        </a>
      </section>
    );
  return (
    <section id="files" ref={integration?.readerRootRef} className="public-reader" data-ui="file-reader" data-file-kind={file.kind}>
      <header className="reader-heading">
        <div>
          <span className="eyebrow">
            {l(
              p.publicFiles.length +
                (p.publicFiles.length === 1 ? ' public file' : ' public files'),
              p.publicFiles.length === 1
                ? 'ملف عام واحد'
                : p.publicFiles.length === 2
                  ? 'ملفان عامان'
                  : p.publicFiles.length + ' ملفات عامة',
            )}
          </span>
          <h2 dir="auto">{t('files')}</h2>
        </div>
        <div className="ui-action-row">
          <button
            className="secondary"
            aria-label={t('focusReading')}
            onClick={() => {
              savedScroll.current = inline.current?.scrollTop || 0;
              E(true);
            }}
          >
            {integration?.literalMetadata?l('Focus mode','وضع القراءة'):t('focusReading')} ⛶
          </button>
          <button
            aria-label={integration?.literalMetadata?l('Download all public files','تنزيل الكل — الملفات العامة'):t('Download all public files')}
            onClick={async () => {
              try {
                await downloadAll(p);
              } catch (error) {
                T(
                  error instanceof Error
                    ? error.message
                    : t('Preview unavailable'),
                );
              }
            }}
          >
            {integration?.literalMetadata?l('Download all','تنزيل الكل'):t('Download all public files')}
          </button>
        </div>
      </header>
      <div className="reader-mobile-controls">
        <button onClick={() => S(true)}>{t('chooseFile')} ☷</button>
        <strong dir="ltr"><BidiValue kind="path">{file.path.split('/').pop()}</BidiValue></strong>
      </div>
      {pinnable && (
        <button
          className="pin-files"
          aria-pressed={pinned}
          onClick={() => P(!pinned)}
        >
          {t(pinned ? 'Show all files' : 'Files')} ☷
        </button>
      )}
      <div className="reader-grid" data-pinned={pinned}>
        <aside className="desktop-inventory">{inventory}</aside>
        <article className="file-reading">
          {toolbar}
          <div
            tabIndex={0}
            role="region"
            aria-label={t('File preview')}
            className="reader-scroll"
            key={file.path}
            ref={inline}
          >
            {viewer}
          </div>
        </article>
      </div>
      <p dir="auto" role="status" className="reader-notice">
        {notice ||
          (invalidFile
            ? l(
                'That file is unavailable. Showing the first public file.',
                'هذا الملف غير متاح. يُعرَض أول ملف عام.',
              )
            : '')}
      </p>
      {sheet && (
        <Modal
          title={t('chooseFile')}
          close={() => S(false)}
          className="file-sheet"
        >
          {inventory}
        </Modal>
      )}
      {focus && (
        <Modal
          title={t('focusReading')}
          close={() => {
            if (focusTouched.current)
              savedScroll.current = focusBody.current?.scrollTop || 0;
            E(false);
            requestAnimationFrame(() => {
              if (inline.current)
                inline.current.scrollTop = savedScroll.current;
            });
          }}
          className="reading-mode"
        >
          <button className="secondary focus-files" onClick={() => S(true)}>
            {t('chooseFile')} ☷
          </button>
          {toolbar}
          <div
            className="focus-scroll"
            key={file.path}
            onScroll={() => {
              if (
                focusBody.current &&
                Math.abs(focusBody.current.scrollTop - focusStart.current) > 1
              )
                focusTouched.current = true;
            }}
            tabIndex={0}
            role="region"
            aria-label={t('File preview')}
            ref={focusBody}
          >
            {viewer}
          </div>
          <p dir="auto" role="status">{notice}</p>
        </Modal>
      )}
    </section>
  );
}
