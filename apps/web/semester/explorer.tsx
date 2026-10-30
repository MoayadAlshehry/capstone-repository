'use client';
import { BidiValue } from '@capstone/ui/bidi';
import 'react-pdf/dist/Page/TextLayer.css';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { SkeletonTemplate } from '@capstone/ui/design-system';
import dynamic from 'next/dynamic';
import type { SemesterFile } from '@capstone/domain';
import {
  Button,
  Badge,
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
  Skeleton,
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  ItemGroup,
  Item,
  ScrollArea,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  Folder,
  FolderOpen,
  FileText,
  FileImage,
  FileCode2,
  FileSpreadsheet,
  FileAudio,
  FileVideo,
  File,
  Search,
  List,
  Grid2X2,
  Info,
  ArrowLeft,
  Copy,
} from '@capstone/ui/workspace-v2';
import { Notice, t, size, type Locale } from './common';
import { useSemesterMemory } from './memory';
import { CodeReader } from './code-reader';
import { copyOriginalText } from './clipboard';
import { scopedEntries, scopeKey, type ExplorerView } from './explorer-model';
const PdfPreview = dynamic(() => import('../native-files/pdf'), {
  ssr: false,
  loading: () => <Skeleton className="ss-preview-loading" />,
});
interface Preview {
  family: string;
  text?: string;
  tokens?: { content: string; light: string; dark: string }[][];
  language?: string;
  rows?: string[][];
  truncated: boolean;
  columnsTruncated?: boolean;
  cellsTruncated?: boolean;
  error?: string;
  meta: {
    id: string;
    path: string;
    name: string;
    mime: string;
    size: number;
    sha256: string;
    visibility: string;
    uploader?: string;
    uploadedAt?: string;
  };
}
const icon = (mime: string) =>
  mime.startsWith('image/')
    ? FileImage
    : mime.startsWith('audio/')
      ? FileAudio
      : mime.startsWith('video/')
        ? FileVideo
        : mime.includes('csv')
          ? FileSpreadsheet
          : /json|javascript|html/.test(mime)
            ? FileCode2
            : /text|pdf|document/.test(mime)
              ? FileText
              : File;
const initialView: ExplorerView = {
  folder: '',
  query: '',
  search: 'folder',
  sort: 'name',
  mode: 'list',
  selected: '',
  reading: false,
  scroll: 0,
};
function entryCount(
  locale: Locale,
  count: number,
  kind: 'matches' | 'items' | 'files',
) {
  const english = {
    matches: ['match', 'matches'],
    items: ['item', 'items'],
    files: ['file', 'files'],
  };
  const arabic = {
    matches: ['نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة'],
    items: ['عنصر واحد', 'عنصران', 'عناصر', 'عنصر'],
    files: ['ملف واحد', 'ملفان', 'ملفات', 'ملف'],
  };
  if (locale === 'en') return `${count} ${english[kind][count === 1 ? 0 : 1]}`;
  if (count === 1 || count === 2) return arabic[kind][count - 1]!;
  return `${count} ${arabic[kind][count === 0 || (count % 100 >= 3 && count % 100 <= 10) ? 2 : 3]}`;
}
export function AcademicExplorer({
  locale,
  actor,
  project,
  version,
  submission,
  files,
  selected,
  onSelect,
  queryUrl,
  details,
  readerOnly = false,
  unavailable = false,
  onDenied,
  onFolderChange,
  reveal,
  sheetClassName = '',
  recordNavigation = false,
  fileContext = '',
  publicLabel,
}: {
  locale: Locale;
  actor: string;
  project: string;
  version: string;
  submission?: string | undefined;
  files: SemesterFile[];
  selected: string;
  onSelect: (id: string) => void;
  queryUrl: (mode: string, file?: string) => string;
  details: (preview: Preview | null) => ReactNode;
  sheetClassName?: string | undefined;
  recordNavigation?: boolean | undefined;
  fileContext?: string | undefined;
  publicLabel?: string | undefined;
  readerOnly?: boolean | undefined;
  unavailable?: boolean | undefined;
  onDenied: () => void;
  onFolderChange?: ((folder: string) => void) | undefined;
  reveal?: { file: string; nonce: string; reading?: boolean } | undefined;
}) {
  const scope = scopeKey(actor, project, version, submission),
    memory = useSemesterMemory(actor, project),
    key = 'explorer.' + scope,
    [view, setView] = useState<ExplorerView>(() => {
      try {
        return { ...initialView, ...JSON.parse(memory[key] ?? '{}') };
      } catch {
        return initialView;
      }
    }),
    [recordTab, setRecordTab] = useState('preview'),
    [sheet, setSheet] = useState<'folders' | 'files' | 'details' | null>(null),
    [width, setWidth] = useState(0),
    [preview, setPreview] = useState<{
      scope: string;
      file: string;
      data: Preview;
    } | null>(null),
    [failure, setFailure] = useState(false),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  const container = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    focusReader = useRef(false),
    sequence = useRef(0),
    historyViews = useRef(new Map<string, ExplorerView>()),
    historyOwned = useRef(false),
    opener = useRef<HTMLElement | null>(null),
    openedFromSheet = useRef(false),
    active = useRef(true);
  const copy = (en: string, ar: string) => t(locale, en, ar),
    current = files.find((f) => f.id === selected),
    data =
      !unavailable &&
      current &&
      preview?.scope === scope &&
      preview.file === current.id
        ? preview.data
        : null;
  useEffect(() => {
    onFolderChange?.(view.folder);
  }, [view.folder]);
  useEffect(() => {
    const f = files.find((f) => f.id === reveal?.file);
    if (f) {
      setView((v) => ({
        ...v,
        folder: f.path.split('/').slice(0, -1).join('/'),
        selected: f.id,
        reading: reveal?.reading ?? false,
        query: '',
      }));
      onSelect(f.id);
      if (reveal?.reading) focusReader.current = true;
    }
  }, [reveal?.nonce]);
  function change(patch: Partial<ExplorerView>) {
    setView((v) => ({ ...v, ...patch }));
  }
  useEffect(() => {
    if (unavailable) {
      sequence.current++;
      setPreview(null);
      setView({ ...initialView });
      setSheet(null);
      historyViews.current.clear();
      delete memory[key];
    }
  }, [unavailable]);
  useEffect(() => {
    memory[key] = JSON.stringify(view);
  }, [memory, key, view]);
  useEffect(() => {
    active.current = true;
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => {
      active.current = false;
      observer.disconnect();
      sequence.current++;
    };
  }, [scope]);
  useEffect(() => {
    const close = () => setSheet(null);
    window.addEventListener('semester-policy-confirm', close);
    return () => window.removeEventListener('semester-policy-confirm', close);
  }, []);
  useEffect(() => {
    const clear = () => {
      sequence.current++;
      setPreview(null);
      setSheet(null);
      historyViews.current.clear();
      change({ ...initialView });
      onSelect('');
    };
    window.addEventListener('semester-memory-cleared', clear);
    return () => window.removeEventListener('semester-memory-cleared', clear);
  }, [scope]);
  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      setSheet(null);
      const nonce = event.state?.semesterExplorer;
      const saved = historyViews.current.get(nonce);
      if (!saved) return;
      const valid = files.some((f) => f.id === saved.selected);
      setView({
        ...saved,
        selected: valid ? saved.selected : '',
        reading: valid && saved.reading,
      });
      onSelect(valid ? saved.selected : '');
      requestAnimationFrame(() => {
        if (list.current) list.current.scrollTop = saved.scroll;
      });
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [scope, files]);
  useEffect(() => {
    const seq = ++sequence.current;
    const controller = new AbortController();
    setPreview(null);
    setFailure(false);
    setCopied(false);
    setCopyError(false);
    if (!current || unavailable) {
      setBusy(false);
      return;
    }
    setBusy(true);
    void fetch(queryUrl('preview', current.id), {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if ([401, 403, 404].includes(response.status)) {
          if (!controller.signal.aborted && seq === sequence.current)
            onDenied();
          throw Error();
        }
        if (!response.ok) throw Error();
        const value = (await response.json()) as Preview;
        if (
          !controller.signal.aborted &&
          seq === sequence.current &&
          active.current &&
          value.meta.id === current.id
        )
          setPreview({ scope, file: current.id, data: value });
      })
      .catch(() => {
        if (!controller.signal.aborted && seq === sequence.current)
          setFailure(true);
      })
      .finally(() => {
        if (!controller.signal.aborted && seq === sequence.current)
          setBusy(false);
      });
    return () => controller.abort();
  }, [scope, selected, current?.sha256, unavailable, retry]);
  useEffect(() => {
    if (focusReader.current && view.reading && current) {
      heading.current?.focus({ preventScroll: true });
      focusReader.current = false;
    }
  }, [selected, view.reading, sheet]);
  useEffect(() => {
    if (selected && !current) {
      setPreview(null);
      onSelect('');
      change({ reading: false, selected: '' });
    }
  }, [files, current, selected]);
  function open(file: SemesterFile) {
    openedFromSheet.current = sheet !== null;
    const before = {
        ...view,
        selected,
        scroll: list.current?.scrollTop ?? view.scroll,
      },
      nonce = crypto.randomUUID();
    historyViews.current.set(nonce, before);
    history.replaceState(
      { ...history.state, semesterExplorer: nonce },
      '',
      location.href,
    );
    const next = { ...before, selected: file.id, reading: true },
      nextNonce = crypto.randomUUID();
    historyViews.current.set(nextNonce, next);
    history.pushState(
      { ...history.state, semesterExplorer: nextNonce },
      '',
      location.href,
    );
    historyOwned.current = true;
    if (historyViews.current.size > 64)
      historyViews.current.delete(historyViews.current.keys().next().value!);
    setView(next);
    onSelect(file.id);
    setSheet(null);
    setRecordTab('preview');
    focusReader.current = true;
  }
  function back() {
    if (
      historyOwned.current &&
      historyViews.current.has(history.state?.semesterExplorer)
    )
      history.back();
    else {
      change({ reading: false });
      requestAnimationFrame(() => {
        list.current
          ?.querySelector<HTMLButtonElement>('[data-file="' + selected + '"]')
          ?.focus();
      });
    }
  }
  const entries = scopedEntries(files, view, locale),
    folderParts = view.folder.split('/').filter(Boolean),
    folders = [
      ...new Set(
        files.flatMap((f) => {
          const s = f.path.split('/');
          s.pop();
          return s.map((_, i) => s.slice(0, i + 1).join('/'));
        }),
      ),
    ];
  function FolderDisclosure({ path = '' }: { path?: string }) {
    const direct = folders
      .filter((f) => f.split('/').slice(0, -1).join('/') === path)
      .sort((a, b) => a.localeCompare(b, locale, { numeric: true }));
    return (
      <ul className="ss-folder-disclosures">
        {direct.map((f) => (
          <li key={f}>
            {folders.some((c) => c.startsWith(f + '/')) ? (
              <details>
                <summary>
                  <Folder size={18} />
                  <BidiValue kind="path">{f.split('/').at(-1)}</BidiValue>
                </summary>
                <Button
                  variant="ghost"
                  aria-current={view.folder === f ? 'location' : undefined}
                  onClick={() => {
                    change({ folder: f, query: '', reading: false });
                    setSheet(null);
                  }}
                >
                  {copy('Open folder', 'فتح المجلد')}{' '}
                  <BidiValue kind="path">{f.split('/').at(-1)}</BidiValue>
                </Button>
                <FolderDisclosure path={f} />
              </details>
            ) : (
              <Button
                variant="ghost"
                aria-current={view.folder === f ? 'location' : undefined}
                onClick={() => {
                  change({ folder: f, query: '', reading: false });
                  setSheet(null);
                }}
              >
                <Folder size={18} />
                <BidiValue kind="path">{f.split('/').at(-1)}</BidiValue>
              </Button>
            )}
          </li>
        ))}
      </ul>
    );
  }
  const browse = (
    <div className="ss-explorer-browse">
      <div className="ss-browse-top">
        <Button
          variant="ghost"
          onClick={(e) => {
            opener.current = e.currentTarget;
            setSheet('folders');
          }}
        >
          <FolderOpen />
          {copy('Folders', 'المجلدات')}
        </Button>
        <Tabs
          value={view.mode}
          onValueChange={(mode) => change({ mode: mode as 'list' | 'grid' })}
        >
          <TabsList aria-label={copy('File presentation', 'عرض الملفات')}>
            <TabsTrigger
              value="list"
              aria-controls="workspace-file-records"
              aria-label={copy('List view', 'عرض القائمة')}
            >
              <List />
            </TabsTrigger>
            <TabsTrigger
              value="grid"
              aria-controls="workspace-file-records"
              aria-label={copy('Grid view', 'عرض الشبكة')}
            >
              <Grid2X2 />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Breadcrumb className="ss-explorer-breadcrumb">
        <BreadcrumbList>
          <BreadcrumbItem>
            <Button
              variant="ghost"
              onClick={() => change({ folder: '', query: '' })}
            >
              {copy('Files', 'الملفات')}
            </Button>
          </BreadcrumbItem>
          {folderParts.map((part, i) => (
            <Fragment key={i}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <Button
                  variant="ghost"
                  aria-current={
                    i === folderParts.length - 1 ? 'page' : undefined
                  }
                  onClick={() =>
                    change({
                      folder: folderParts.slice(0, i + 1).join('/'),
                      query: '',
                    })
                  }
                >
                  <BidiValue kind="path">{part}</BidiValue>
                </Button>
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ss-explorer-filter">
        <label dir="auto" className="ss-search-scope">
          <select
            value={view.search}
            onChange={(e) =>
              change({ search: e.target.value as 'folder' | 'edition' })
            }
            aria-label={copy('Search scope', 'نطاق البحث')}
          >
            <option value="folder">
              {copy('Search this folder', 'البحث في هذا المجلد')}
            </option>
            <option value="edition">
              {copy(
                'Search all permitted files',
                'البحث في كل الملفات المصرح بها',
              )}
            </option>
          </select>
        </label>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={
              view.search === 'folder'
                ? copy('Search this folder', 'البحث في هذا المجلد')
                : copy(
                    'Search all permitted files',
                    'البحث في كل الملفات المصرح بها',
                  )
            }
            placeholder={copy(
              'Find a document or artifact',
              'ابحث عن مستند أو ملف',
            )}
            value={view.query}
            onChange={(e) => change({ query: e.target.value })}
          />
        </InputGroup>
        <div className="ss-sort-row">
          <span>
            {entryCount(
              locale,
              entries.length,
              view.query ? 'matches' : 'items',
            )}
          </span>
          <label dir="auto">
            <span className="sr-only">
              {copy('Sort files', 'ترتيب الملفات')}
            </span>
            <select
              aria-label={copy('Sort files', 'ترتيب الملفات')}
              value={view.sort}
              onChange={(e) =>
                change({ sort: e.target.value as 'name' | 'size' })
              }
            >
              <option value="name">
                {copy('Folders first · name', 'المجلدات أولًا · الاسم')}
              </option>
              <option value="size">
                {copy('Folders first · size', 'المجلدات أولًا · الحجم')}
              </option>
            </select>
          </label>
          {view.query && (
            <Button variant="ghost" onClick={() => change({ query: '' })}>
              {copy('Clear search', 'مسح البحث')}
            </Button>
          )}
        </div>
      </div>
      <div
        ref={list}
        className="ss-explorer-list"
        data-view={view.mode}
        onScroll={(e) => change({ scroll: e.currentTarget.scrollTop })}
      >
        <ItemGroup
          id="workspace-file-records"
          aria-label={copy(
            'Authorized folder contents',
            'محتويات المجلد المصرح بها',
          )}
        >
          {entries.map((entry, i) => {
            const Icon =
              entry.kind === 'folder' ? Folder : icon(entry.file.mime);
            return (
              <Item
                key={entry.key}
                role="listitem"
                className="ss-file-item-wrap"
              >
                <button
                  className="ss-explorer-item"
                  key={entry.key}
                  data-file={entry.kind === 'file' ? entry.file.id : undefined}
                  aria-pressed={
                    entry.kind === 'file'
                      ? selected === entry.file.id
                      : undefined
                  }
                  title={entry.path}
                  onClick={() =>
                    entry.kind === 'folder'
                      ? change({ folder: entry.path, query: '', scroll: 0 })
                      : open(entry.file)
                  }
                  onKeyDown={(e) => {
                    if (
                      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)
                    ) {
                      e.preventDefault();
                      const n =
                        e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? entries.length - 1
                            : Math.max(
                                0,
                                Math.min(
                                  entries.length - 1,
                                  i + (e.key === 'ArrowDown' ? 1 : -1),
                                ),
                              );
                      list.current
                        ?.querySelectorAll<HTMLButtonElement>(
                          '.ss-explorer-item',
                        )
                        [n]?.focus();
                    }
                  }}
                >
                  <span className="ss-file-icon">
                    <Icon />
                  </span>
                  <span className="ss-entry-copy">
                    <strong>
                      <BidiValue kind="path">{entry.name}</BidiValue>
                    </strong>
                    <small>
                      {entry.kind === 'folder' ? (
                        entryCount(locale, entry.count, 'files')
                      ) : (
                        <>
                          <BidiValue kind="path">
                            {entry.file.path.split('.').at(-1)?.toUpperCase()} ·{' '}
                            {size(entry.file.size)}
                          </BidiValue>
                          {view.query && view.search === 'edition' && (
                            <code dir="ltr">
                              <BidiValue kind="path">
                                {entry.path.split('/').slice(0, -1).join('/') ||
                                  '/'}
                              </BidiValue>
                            </code>
                          )}
                        </>
                      )}
                    </small>
                  </span>
                </button>
              </Item>
            );
          })}
        </ItemGroup>
        {!entries.length && !unavailable && (
          <Empty>
            <EmptyHeader>
              <FolderOpen />
              <EmptyTitle>
                {view.query
                  ? copy('No matches', 'لا توجد نتائج')
                  : copy('This folder is empty', 'هذا المجلد فارغ')}
              </EmptyTitle>
              <EmptyDescription>
                {view.query
                  ? copy(
                      'Try another name or clear the search.',
                      'جرّب اسمًا آخر أو امسح البحث.',
                    )
                  : copy(
                      'Ready, authorized originals appear here.',
                      'تظهر هنا الملفات الأصلية المقبولة والمصرح بها.',
                    )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
  const reader = (
    <section
      className="ss-explorer-reader"
      aria-label={copy('Selected file preview', 'معاينة الملف المختار')}
    >
      <div className="ss-reader-navigation">
        <Button className="ss-reader-back" variant="ghost" onClick={back}>
          <ArrowLeft />
          {copy('Back to', 'العودة إلى')}{' '}
          <BidiValue kind="path">
            {view.folder.split('/').at(-1) || copy('Files', 'الملفات')}
          </BidiValue>
        </Button>
        {readerOnly && (
          <Button
            variant="outline"
            onClick={(e) => {
              opener.current = e.currentTarget;
              setSheet('files');
            }}
          >
            <FolderOpen />
            {copy('Choose file', 'اختيار ملف')}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={(e) => {
            opener.current = e.currentTarget;
            setSheet('details');
          }}
          disabled={!current}
        >
          <Info />
          {copy('Details', 'التفاصيل')}
        </Button>
      </div>
      {current && !unavailable ? (
        <>
          <header className="ss-reader-heading">
            <div>
              <h2 dir="ltr" ref={heading} tabIndex={-1}>
                <BidiValue kind="path">
                  {current.path.split('/').at(-1)}
                </BidiValue>
              </h2>
              <code dir="ltr">
                <BidiValue kind="path">{current.path}</BidiValue>
              </code>
              {fileContext && (
                <p dir="auto" className="ss-muted ac-file-format">
                  {fileContext} ·{' '}
                  <bdi dir="ltr">
                    {current.mime} · {size(current.size)}
                  </bdi>
                </p>
              )}
            </div>
            <Badge variant="outline">
              {current.visibility === 'restricted'
                ? copy('Restricted', 'مقيّد')
                : (publicLabel ??
                  copy('Public after publication', 'عام بعد النشر'))}
            </Badge>
          </header>
          <div className="ss-reader-actions">
            <Button asChild variant="outline">
              <a
                href={queryUrl('original', current.id)}
                download
                referrerPolicy="no-referrer"
              >
                {copy('Download original', 'تنزيل الأصل')}
              </a>
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const success = await copyOriginalText(current.path);
                setCopied(success);
                setCopyError(!success);
              }}
            >
              <Copy />
              {copied
                ? copy('Path copied', 'تم نسخ المسار')
                : copy('Copy path', 'نسخ المسار')}
            </Button>
          </div>
          {(copied || copyError) && (
            <p dir="auto" role="status" className="ss-muted">
              {copyError
                ? copy(
                    'Copy was unavailable. Select the path above to copy it.',
                    'تعذر النسخ. حدد المسار أعلاه لنسخه.',
                  )
                : copy('Path copied.', 'نُسخ المسار.')}
            </p>
          )}
          <div
            className="ss-reader-body"
            key={scope + ':' + current.id}
            aria-busy={busy}
          >
            {busy ? (
              <div
                role="status"
                aria-label={copy('Loading preview', 'جارٍ تحميل المعاينة')}
              >
                <SkeletonTemplate template="file-preview" pulse />
              </div>
            ) : failure || data?.error ? (
              <Notice
                locale={locale}
                error
                title={copy('Preview is unavailable', 'المعاينة غير متاحة')}
              >
                <p dir="auto">
                  {copy(
                    'The original could not be read. Retry or download the authorized original.',
                    'تعذرت قراءة الأصل. أعد المحاولة أو نزّل الأصل المصرح به.',
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setRetry((n) => n + 1)}
                >
                  {copy('Retry preview', 'إعادة المعاينة')}
                </Button>
              </Notice>
            ) : data?.family === 'pdf' ? (
              <div className="ss-reader">
                <PdfPreview
                  key={scope + current.id}
                  url={queryUrl('asset', current.id)}
                  failed={() => setFailure(true)}
                  studioLocale={locale}
                  readingMemory={memory}
                  readingKey={'pdf.view.' + scope + ':' + current.id}
                />
              </div>
            ) : data?.text !== undefined && !data.rows ? (
              <CodeReader
                key={scope + ':' + current.id}
                locale={locale}
                text={data.text}
                tokens={data.tokens}
                language={data.language}
                truncated={data.truncated}
              />
            ) : data?.rows ? (
              <div
                className="ss-data-preview"
                role="region"
                tabIndex={0}
                aria-label={copy(
                  'Table preview · scroll to read columns',
                  'معاينة جدول · مرّر لقراءة الأعمدة',
                )}
              >
                <table dir="ltr">
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, n) => (
                          <td dir="auto" key={n}>
                            <bdi dir="auto">{cell}</bdi>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : data?.family === 'image' ? (
              <img
                className="ss-image-preview"
                src={queryUrl('asset', current.id)}
                alt={current.path.split('/').at(-1)}
                onError={() => setFailure(true)}
              />
            ) : data?.family === 'audio' ? (
              <audio
                controls
                preload="metadata"
                src={queryUrl('asset', current.id)}
                onError={() => setFailure(true)}
              />
            ) : data?.family === 'video' ? (
              <video
                controls
                preload="metadata"
                src={queryUrl('asset', current.id)}
                onError={() => setFailure(true)}
              />
            ) : data ? (
              <Empty>
                <EmptyHeader>
                  <FileText />
                  <EmptyTitle>
                    {copy(
                      'Read this original in its native app',
                      'اقرأ الأصل في تطبيقه المناسب',
                    )}
                  </EmptyTitle>
                  <EmptyDescription>
                    <bdi dir="ltr">{current.mime}</bdi> ·{' '}
                    {copy(
                      'Secure preview is not available for this format. Download the original above.',
                      'لا تتوفر معاينة آمنة لهذا النوع. نزّل الأصل أعلاه.',
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
            {(data?.truncated ||
              data?.columnsTruncated ||
              data?.cellsTruncated) && (
              <Notice
                locale={locale}
                title={copy('Preview is truncated', 'المعاينة مختصرة')}
              >
                <p dir="auto">
                  {copy(
                    'Download original for the complete text or table.',
                    'نزّل الأصل لقراءة النص أو الجدول الكامل.',
                  )}
                </p>
              </Notice>
            )}
          </div>
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <BookPlaceholder />
            <EmptyTitle>
              {unavailable
                ? copy(
                    'File access is unavailable',
                    'الوصول إلى الملفات غير متاح',
                  )
                : copy('Choose a file to read', 'اختر ملفًا للقراءة')}
            </EmptyTitle>
            <EmptyDescription>
              {unavailable
                ? copy(
                    'No previous file content is displayed. Retry the authorized read.',
                    'لا يُعرض محتوى سابق. أعد محاولة القراءة المصرح بها.',
                  )
                : copy(
                    'Browse folders or search project files.',
                    'تصفح المجلدات أو ابحث في ملفات المشروع.',
                  )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
  return (
    <div
      ref={container}
      className="ss-explorer"
      data-reading={view.reading}
      data-reader-only={readerOnly}
      data-scope={submission ? 'frozen' : 'working'}
    >
      {recordNavigation && width < 780 && !unavailable ? (
        <Tabs className="gap-0" value={recordTab} onValueChange={setRecordTab}>
          <TabsList
            className="ac-record-tabs"
            aria-label={copy('Archived file reading', 'قراءة ملفات الأرشيف')}
          >
            <TabsTrigger value="files">{copy('Files', 'الملفات')}</TabsTrigger>
            <TabsTrigger value="preview">
              {copy('Preview', 'المعاينة')}
            </TabsTrigger>
            <TabsTrigger value="details">
              {copy('Details', 'التفاصيل')}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            className="mt-0"
            value="files"
            forceMount
            hidden={recordTab !== 'files'}
          >
            {browse}
          </TabsContent>
          <TabsContent
            className="mt-0"
            value="preview"
            forceMount
            hidden={recordTab !== 'preview'}
          >
            {reader}
          </TabsContent>
          <TabsContent
            className="mt-0"
            value="details"
            forceMount
            hidden={recordTab !== 'details'}
          >
            {details(data)}
          </TabsContent>
        </Tabs>
      ) : unavailable || readerOnly ? (
        reader
      ) : width >= 780 ? (
        <ResizablePanelGroup
          role="group"
          orientation="horizontal"
          id={'explorer-' + version + (submission ?? 'working')}
          aria-label={copy('Files and preview', 'الملفات والمعاينة')}
        >
          <ResizablePanel defaultSize="40%" minSize="290px" maxSize="55%">
            {browse}
          </ResizablePanel>
          <ResizableHandle
            withHandle
            aria-label={copy(
              'Resize browsing and reading areas',
              'تغيير عرض التصفح والقراءة',
            )}
          />
          <ResizablePanel minSize="350px">{reader}</ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>{view.reading ? reader : browse}</>
      )}
      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
      >
        <SheetContent
          className={'wsv2 ss-explorer-sheet ' + sheetClassName}
          side="right"
          closeLabel={copy('Close panel', 'إغلاق اللوحة')}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (openedFromSheet.current) {
              heading.current?.focus();
              openedFromSheet.current = false;
            } else opener.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>
              {sheet === 'details'
                ? copy('File details', 'تفاصيل الملف')
                : sheet === 'files'
                  ? copy('Frozen files', 'الملفات المحفوظة')
                  : copy('Folder navigation', 'تصفح المجلدات')}
            </SheetTitle>
            <SheetDescription>
              {sheet === 'details'
                ? copy(
                    'Original provenance and permitted working policy.',
                    'مصدر الأصل والسياسة المسموح بها.',
                  )
                : copy(
                    'Browse only this authorized manifest.',
                    'تصفح هذه القائمة المصرح بها فقط.',
                  )}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="ss-sheet-scroll">
            {sheet === 'details' ? (
              details(data)
            ) : sheet === 'files' ? (
              browse
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    change({ folder: '', query: '', reading: false });
                    setSheet(null);
                  }}
                >
                  <FolderOpen />
                  {copy('Files root', 'جذر الملفات')}
                </Button>
                <FolderDisclosure />
              </>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
function BookPlaceholder() {
  return <FileText size={28} />;
}
