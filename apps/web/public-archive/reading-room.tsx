'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFacts } from '@capstone/ui/bidi';
import { usePublicReadingRoom } from './use-reading-room';
import { NativeFileViewer } from './native-viewer';
import { ShareLink } from './actions';
import {
  byteSize,
  fileSharePath,
  type Locale,
  type PublicFileItem,
} from './core';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  Folder,
  ChevronRight,
  Download,
  Info,
  BookOpen,
  FileText,
  FileCode2,
  FileSpreadsheet,
  FileImage,
  FileAudio,
  FileVideo,
  ArrowLeft,
  Search,
} from '@capstone/ui/workspace-v2';
function FamilyIcon({ file }: { file: PublicFileItem }) {
  const Icon = file.mime.startsWith('image/')
    ? FileImage
    : file.mime.startsWith('audio/')
      ? FileAudio
      : file.mime.startsWith('video/')
        ? FileVideo
        : /\.csv$/i.test(file.path)
          ? FileSpreadsheet
          : /\.(ts|tsx|js|py|html|css|json|sql)$/i.test(file.path)
            ? FileCode2
            : FileText;
  return <Icon aria-hidden="true" />;
}
export function ProjectReadingRoom(props: {
  locale: Locale;
  project: string;
  version: string;
  files: PublicFileItem[];
  error?: boolean;
}) {
  const r = usePublicReadingRoom(props),
    { locale, project, files, error } = props,
    t = r.t;
  const navigation = (
    <div className="lra-file-browser" ref={r.nav}>
      <nav className="lra-file-breadcrumb" aria-label={t('files.folders')}>
        <button
          onClick={() => {
            r.setFolder('');
            r.setSearch('');
          }}
        >
          {t('files.root')}
        </button>
        {r.folder
          .split('/')
          .filter(Boolean)
          .map((name, i, parts) => (
            <span key={i}>
              <ChevronRight />
              <button
                className="lra-path"
                onClick={() => {
                  r.setFolder(parts.slice(0, i + 1).join('/'));
                  r.setSearch('');
                }}
              >
                {name}
              </button>
            </span>
          ))}
      </nav>
      <label dir="auto" className="lra-file-search">
        <Search />
        <span className="lra-sr">{t('files.search')}</span>
        <input
          type="search"
          value={r.search}
          placeholder={t('files.searchPlaceholder')}
          onChange={(e) => r.setSearch(e.target.value)}
        />
      </label>
      <ul className="lra-file-list">
        {r.entries.files.map((file) => (
          <li
            key={file.id}
            className="lra-file-row"
            aria-current={file.id === r.selected ? 'true' : undefined}
          >
            <button
              className="lra-file-select"
              aria-label={t('files.previewNamed', { filename: file.path })}
              onClick={() => r.select(file.id)}
            >
              <FamilyIcon file={file} />
              <span>
                <bdi className="lra-path">{file.name}</bdi>
                {r.search && file.name !== file.path && (
                  <small className="lra-path">
                    {file.path.slice(0, file.path.lastIndexOf('/'))}
                  </small>
                )}
                <small>
                  {file.name.includes('.')
                    ? file.name.split('.').at(-1)?.toUpperCase()
                    : t('files.plainText')}{' '}
                  / {byteSize(file.size, locale)}
                </small>
              </span>
            </button>
            <a
              className="lra-file-download"
              href={r.base + '&mode=original&file=' + file.id}
              download
              aria-label={t('files.downloadNamed', { filename: file.path })}
            >
              <Download />
            </a>
          </li>
        ))}
        {r.entries.folders.map((folder) => (
          <li key={folder}>
            <button
              className="lra-folder"
              aria-label={t('files.openFolder', { folder })}
              onClick={() => {
                r.setFolder(folder);
                r.setSearch('');
              }}
            >
              <Folder />
              <bdi dir="auto">{folder.split('/').at(-1)}</bdi>
              <ChevronRight />
            </button>
          </li>
        ))}
      </ul>
      {!r.entries.files.length && !r.entries.folders.length && (
        <p dir="auto" className="lra-quiet">
          {t('files.noSearchMatches')}
        </p>
      )}
    </div>
  );
  const reader = (
    <div className="lra-reader">
      <header className="lra-document-heading">
        <div className="lra-document-name">
          <span>
            {r.selection?.name.split('.').at(-1)?.toUpperCase() ??
              t('files.preview')}
          </span>
          <h3
            dir="auto"
            className="lra-path"
            tabIndex={-1}
            ref={(node) => {
              r.heading.current = node;
              r.focusReader(node);
            }}
          >
            {r.selection?.name ?? t('files.chooseTitle')}
          </h3>
          {r.selection && (
            <p dir="auto">
              {r.selection.path !== r.selection.name && (
                <>
                  <bdi className="lra-path">{r.selection.path}</bdi> /{' '}
                </>
              )}
              {byteSize(r.selection.size, locale)}
            </p>
          )}
        </div>
        <div className="lra-reader-actions">
          {!r.wide && !r.reading && (
            <button onClick={r.back}>
              <ArrowLeft />
              {t('files.backToList')}
            </button>
          )}
          {r.selection && r.state !== 'unavailable' && (
            <>
              <a href={r.original} download>
                <Download />
                {t('files.downloadOriginal')}
              </a>
              <ShareLink
                key={r.selected}
                path={fileSharePath(locale, project, r.selection.id)}
                label={t('files.share')}
              />
              <Sheet>
                <SheetTrigger asChild>
                  <button aria-label={t('files.details')}>
                    <Info />
                  </button>
                </SheetTrigger>
                <SheetContent
                  className="lra lra-sheet"
                  lang={locale}
                  dir={locale === 'ar' ? 'rtl' : 'ltr'}
                  closeLabel={t('common.close')}
                >
                  <SheetTitle>{t('files.details')}</SheetTitle>
                  <SheetDescription className="lra-path">
                    {r.selection.name}
                  </SheetDescription>
                  <BidiFacts className="lra-file-details">
                    <BidiLabel dir="auto">{t('files.path')}</BidiLabel>
                    <BidiData dir="auto" className="lra-path">
                      {r.selection.path}
                    </BidiData>
                    <BidiLabel dir="auto">{t('files.type')}</BidiLabel>
                    <BidiData dir="auto">{r.selection.mime}</BidiData>
                    <BidiLabel dir="auto">{t('files.size')}</BidiLabel>
                    <BidiData dir="auto">
                      {byteSize(r.selection.size, locale)}
                    </BidiData>
                  </BidiFacts>
                </SheetContent>
              </Sheet>
            </>
          )}
        </div>
      </header>
      <div className="lra-reader-canvas">
        <NativeFileViewer
          locale={locale}
          data={r.data}
          state={r.state}
          asset={r.asset}
          name={r.selection?.name ?? ''}
          retry={() => r.setRetry((n) => n + 1)}
          failed={() => r.setState('failed')}
          resolve={r.resolve}
          imageFit={r.imageFit}
          setImageFit={r.setImageFit}
          csvHead={r.csvHead}
          setCsvHead={r.setCsvHead}
          pdfView={r.pdfView}
          setPdfView={r.setPdfView}
        />
      </div>
    </div>
  );
  return (
    <section className="lra-reading-room" id="public-files" ref={r.section}>
      <div className="lra-reading-masthead">
        <div>
          <p dir="auto" className="lra-eyebrow">
            {locale === 'ar' ? 'غرفة القراءة' : 'THE READING ROOM'}
          </p>
          <h2 dir="auto">{t('files.title')}</h2>
          {!error && (
            <p dir="auto" className="lra-quiet">
              {t('files.count', { count: files.length })}
              {files.length > 0 && <> / {t('files.description')}</>}
            </p>
          )}
        </div>
        {files.length > 0 && (
          <div className="lra-reading-controls">
            <a
              href={r.base + '&mode=zip'}
              download
              className="lra-text-action"
              onClick={(e) => void r.downloadZip(e)}
            >
              <Download />
              {t('files.downloadZip')} <small>ZIP</small>
            </a>
            <Dialog open={r.reading} onOpenChange={r.setReading}>
              <DialogTrigger asChild>
                <button
                  className="lra-text-action"
                  disabled={!r.selection}
                  onClick={() => r.setNear(true)}
                >
                  <BookOpen />
                  {t('files.focusMode')}
                </button>
              </DialogTrigger>
              <DialogContent
                className="lra lra-reading-dialog"
                lang={locale}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                closeLabel={t('files.closeReading')}
              >
                <DialogTitle className="lra-sr">
                  {t('files.focusMode')}
                </DialogTitle>
                <DialogDescription className="lra-sr">
                  {r.selection?.name}
                </DialogDescription>
                {r.reading && reader}
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
      <p dir="auto" className="lra-quiet" role="status">
        {r.zipState}
      </p>
      {error ? (
        <div className="lra-state" role="alert">
          <h3 dir="auto">{t('files.failedTitle')}</h3>
          <button className="lra-text-action" onClick={() => location.reload()}>
            {t('common.retry')}
          </button>
        </div>
      ) : !files.length ? (
        <div className="lra-files-empty">
          <div aria-hidden="true">↗</div>
          <h3 dir="auto">{t('files.emptyTitle')}</h3>
          <p dir="auto">{t('files.emptyText')}</p>
        </div>
      ) : (
        <>
          <div className="lra-reading-enhanced">
            {r.wide ? (
              <div className="lra-reading-panels">
                <ResizablePanelGroup orientation="horizontal" dir="ltr">
                  <ResizablePanel defaultSize="33%" minSize="260px">
                    <div
                      className="lra-browser-panel"
                      dir={locale === 'ar' ? 'rtl' : 'ltr'}
                    >
                      {navigation}
                    </div>
                  </ResizablePanel>
                  <ResizableHandle
                    withHandle
                    aria-label={
                      locale === 'ar'
                        ? 'تغيير عرض قائمة الملفات'
                        : 'Resize file navigation'
                    }
                  />
                  <ResizablePanel minSize="480px">
                    <div
                      className="lra-preview-panel"
                      dir={locale === 'ar' ? 'rtl' : 'ltr'}
                    >
                      {!r.reading && reader}
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            ) : (
              <Tabs
                value={r.tab}
                onValueChange={(value) => {
                  r.setTab(value);
                  if (value === 'preview') r.setNear(true);
                }}
                className="lra-reader-tabs"
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              >
                <TabsList>
                  <TabsTrigger value="files">{t('files.fileList')}</TabsTrigger>
                  <TabsTrigger value="preview">
                    {t('files.preview')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="files">{navigation}</TabsContent>
                <TabsContent value="preview">
                  {!r.reading && reader}
                </TabsContent>
              </Tabs>
            )}
          </div>
          <noscript>
            <style>{'.lra-reading-enhanced{display:none}'}</style>
            <p dir="auto">
              {locale === 'ar'
                ? 'تتوفر الملفات الأصلية للتنزيل أدناه. تتطلب المعاينة تفعيل JavaScript.'
                : 'Public originals are available below. Preview requires JavaScript.'}
            </p>
            <ul className="lra-static-files">
              {files.map((file) => (
                <li key={file.id}>
                  <a href={r.base + '&mode=original&file=' + file.id} download>
                    <bdi className="lra-path">{file.path}</bdi> /{' '}
                    {byteSize(file.size, locale)}
                  </a>
                </li>
              ))}
            </ul>
          </noscript>
        </>
      )}
    </section>
  );
}
