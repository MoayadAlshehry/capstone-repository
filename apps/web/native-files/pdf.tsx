'use client';
import { useMemo, useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@capstone/ui';
import { useTranslations } from 'next-intl';
import { PublicPdfToolbar } from './public-pdf-toolbar';
import { ShadcnPdfToolbar } from '../public-ui/pdf-toolbar';
import { useIsPublicUI } from '../public-ui/scope';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
const options = {
  isEvalSupported: false,
  enableXfa: false,
  disableStream: true,
  disableAutoFetch: true,
  useWorkerFetch: false,
  useSystemFonts: true,
  cMapUrl: '/pdfjs/6.3.289/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/6.3.289/standard_fonts/',
  wasmUrl: '/pdfjs/6.3.289/wasm/',
  isOffscreenCanvasSupported: false,
};
export default function PdfPreview({
  url,
  failed,
  studioLocale,
  publicView,
  onPublicViewChange,
  publicOriginal,
  readingMemory,
  readingKey,
}: {
  url: string;
  failed: () => void;
  studioLocale?: 'en' | 'ar' | undefined;
  publicView?: { page: number; zoom: number; fit: 'width' | 'page' };
  onPublicViewChange?: (view: {
    page: number;
    zoom: number;
    fit: 'width' | 'page';
  }) => void;
  publicOriginal?: string;
  readingMemory?: Record<string, string>;
  readingKey?: string;
}) {
  const PublicToolbar = useIsPublicUI() ? ShadcnPdfToolbar : PublicPdfToolbar;
  // Only reading position is retained in the existing actor-scoped volatile vault.
  // File bytes and authority are always re-read; sign-out/pagehide clears the vault.
  const saved = (() => {
    try {
      const value = JSON.parse(readingMemory?.[readingKey ?? ''] ?? '{}') as {
        page?: number;
        fit?: string;
      };
      return {
        page:
          Number.isSafeInteger(value.page) && value.page! > 0 ? value.page! : 1,
        fit: value.fit === 'page' ? ('page' as const) : ('width' as const),
      };
    } catch {
      return { page: 1, fit: 'width' as const };
    }
  })();
  const t = useTranslations('NativeFiles'),
    [pages, setPages] = useState(0),
    [localPage, setLocalPage] = useState(saved.page),
    [width, setWidth] = useState(500),
    [localFit, setLocalFit] = useState<'width' | 'page'>(saved.fit),
    [aspect, setAspect] = useState(595 / 842),
    container = useRef<HTMLDivElement>(null);
  const page = publicView?.page ?? localPage,
    fit = publicView?.fit ?? localFit;
  useEffect(() => {
    if (readingMemory && readingKey && !publicView)
      readingMemory[readingKey] = JSON.stringify({ page, fit });
  }, [readingMemory, readingKey, publicView, page, fit]);
  useEffect(() => {
    if (pages && localPage > pages) setLocalPage(pages);
  }, [pages, localPage]);
  function setPage(value: number | ((n: number) => number)) {
    const next = typeof value === 'function' ? value(page) : value;
    if (publicView) onPublicViewChange?.({ ...publicView, page: next });
    else setLocalPage(next);
  }
  function setFit(value: 'width' | 'page') {
    if (publicView)
      onPublicViewChange?.({ ...publicView, fit: value, zoom: 1 });
    else setLocalFit(value);
  }
  const file = useMemo(() => ({ url, withCredentials: true }), [url]);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setWidth(
        Math.min(
          900,
          Math.max(100, node.clientWidth - 16),
          studioLocale && fit === 'page'
            ? Math.max(240, Math.min(700, window.innerHeight * 0.65)) * aspect
            : Infinity,
        ),
      ),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fit, aspect, studioLocale]);
  return (
    <div
      ref={container}
      className={'native-pdf' + (publicView ? ' public-pdf' : '')}
    >
      {publicView && onPublicViewChange ? (
        <PublicToolbar
          locale={studioLocale ?? 'en'}
          view={publicView}
          pages={pages}
          change={onPublicViewChange}
          {...(publicOriginal ? { original: publicOriginal } : {})}
        />
      ) : (
        <div className="admin-actions">
          {publicView && (
            <>
              <label dir="auto">
                {studioLocale === 'ar' ? 'الانتقال إلى الصفحة' : 'Go to page'}
                <input
                  type="number"
                  min={1}
                  max={pages || 1}
                  value={page}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 1 && n <= pages) setPage(n);
                  }}
                />
              </label>
              <Button
                variant="outline"
                disabled={publicView.zoom <= 0.5}
                onClick={() =>
                  onPublicViewChange?.({
                    ...publicView,
                    zoom: Math.max(0.5, publicView.zoom - 0.25),
                  })
                }
              >
                {studioLocale === 'ar' ? 'تصغير' : 'Zoom out'}
              </Button>
              <span>{Math.round(publicView.zoom * 100)}%</span>
              <Button
                variant="outline"
                disabled={publicView.zoom >= 3}
                onClick={() =>
                  onPublicViewChange?.({
                    ...publicView,
                    zoom: Math.min(3, publicView.zoom + 0.25),
                  })
                }
              >
                {studioLocale === 'ar' ? 'تكبير' : 'Zoom in'}
              </Button>
            </>
          )}
          {studioLocale && (
            <div className="ss-pdf-fit">
              <Button
                variant="outline"
                aria-pressed={fit === 'width'}
                onClick={() => setFit('width')}
              >
                {studioLocale === 'ar' ? 'ملاءمة العرض' : 'Fit width'}
              </Button>
              <Button
                variant="outline"
                aria-pressed={fit === 'page'}
                onClick={() => setFit('page')}
              >
                {studioLocale === 'ar' ? 'ملاءمة الصفحة' : 'Fit page'}
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            disabled={!pages || page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            {studioLocale === 'ar' ? 'الصفحة السابقة' : t('previous')}
          </Button>
          <span role={!pages ? 'status' : undefined}>
            {!pages
              ? studioLocale === 'ar'
                ? 'جارٍ تحميل المستند…'
                : 'Loading document…'
              : studioLocale === 'ar'
                ? `الصفحة ${page} من ${pages}`
                : t('page', { page, total: pages })}
          </span>
          <Button
            variant="outline"
            disabled={!pages || page >= pages}
            onClick={() => setPage((n) => n + 1)}
          >
            {studioLocale === 'ar' ? 'الصفحة التالية' : t('next')}
          </Button>
        </div>
      )}
      <div
        className={studioLocale ? 'ss-pdf-stage' : undefined}
        role={studioLocale ? 'region' : undefined}
        tabIndex={studioLocale ? 0 : undefined}
        aria-label={
          studioLocale
            ? studioLocale === 'ar'
              ? 'الصفحة الأصلية · مرّر للقراءة'
              : 'Original PDF page · scroll to read'
            : undefined
        }
      >
        <Document
          file={file}
          options={options}
          suspense={false}
          onLoadSuccess={(pdf) => {
            setPages(pdf.numPages);
          }}
          onLoadError={failed}
          onSourceError={failed}
          onPassword={() => failed()}
          loading={
            publicView ? (
              <p dir="auto" role="status">
                {studioLocale === 'ar'
                  ? 'جارٍ تحميل المستند…'
                  : 'Loading document…'}
              </p>
            ) : studioLocale === 'ar' ? (
              'جارٍ تحميل الملف…'
            ) : (
              t('loading')
            )
          }
          error={
            studioLocale === 'ar'
              ? 'تعذر عرض الملف. يمكنك إعادة المحاولة أو تنزيل الأصل.'
              : t('malformed')
          }
        >
          <Page
            pageNumber={page}
            width={width * (publicView?.zoom ?? 1)}
            renderAnnotationLayer={false}
            renderTextLayer={true}
            onRenderError={failed}
            onLoadError={failed}
            loading={
              studioLocale === 'ar' ? 'جارٍ تحميل الصفحة…' : t('loading')
            }
            onLoadSuccess={(page) => {
              const v = page.getViewport({ scale: 1 });
              setAspect(v.width / v.height);
            }}
          />
        </Document>
      </div>
    </div>
  );
}
