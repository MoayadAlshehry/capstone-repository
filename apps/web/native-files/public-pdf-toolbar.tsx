'use client';
export type PublicPdfView = {
  page: number;
  zoom: number;
  fit: 'width' | 'page';
};
export function PublicPdfToolbar({
  locale,
  view,
  pages,
  change,
  original,
}: {
  locale: 'en' | 'ar';
  view: PublicPdfView;
  pages: number;
  change: (value: PublicPdfView) => void;
  original?: string;
}) {
  const l = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const loaded = pages > 0,
    count = l(
      `Page ${view.page} of ${pages}`,
      `الصفحة ${view.page} من ${pages}`,
    );
  const sizing =
    view.fit === 'page' && view.zoom === 1
      ? 'page'
      : view.zoom === 1
        ? 'width'
        : String(view.zoom);
  return (
    <div
      className="public-pdf-toolbar"
      aria-label={l('PDF reading controls', 'أدوات قراءة ملف PDF')}
    >
      <div className="pdf-page-navigation" dir="ltr">
        <button
          type="button"
          disabled={!loaded || view.page <= 1}
          aria-label={l('Previous page', 'الصفحة السابقة')}
          onClick={() => change({ ...view, page: view.page - 1 })}
        >
          ‹
        </button>
        {loaded ? (
          <output aria-live="polite" aria-label={count} title={count}>
            <bdi dir="ltr">
              {view.page} / {pages}
            </bdi>
          </output>
        ) : (
          <span className="pdf-pending" role="status">
            {l('Loading document…', 'جارٍ تحميل المستند…')}
          </span>
        )}
        <button
          type="button"
          disabled={!loaded || view.page >= pages}
          aria-label={l('Next page', 'الصفحة التالية')}
          onClick={() => change({ ...view, page: view.page + 1 })}
        >
          ›
        </button>
      </div>
      <label dir="auto" className="pdf-sizing">
        <span className="sr-only">
          {l('Zoom and fit', 'التكبير والملاءمة')}
        </span>
        <select
          disabled={!loaded}
          value={sizing}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'width' || v === 'page')
              change({ ...view, fit: v, zoom: 1 });
            else change({ ...view, fit: 'width', zoom: Number(v) });
          }}
        >
          <option value="width">{l('Fit width', 'ملاءمة العرض')}</option>
          <option value="page">{l('Fit page', 'ملاءمة الصفحة')}</option>
          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3].map((n) => (
            <option key={n} value={n}>
              {n * 100}%
            </option>
          ))}
        </select>
      </label>
      <details
        className="pdf-more"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && e.currentTarget.open) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.open = false;
            e.currentTarget.querySelector('summary')?.focus();
          }
        }}
      >
        <summary
          aria-label={l('More reading options', 'خيارات قراءة إضافية')}
          title={l('More reading options', 'خيارات قراءة إضافية')}
        >
          •••
        </summary>
        <div className="pdf-more-panel">
          <label dir="auto">
            {l('Go to page', 'الانتقال إلى الصفحة')}
            <input
              type="number"
              dir="ltr"
              min={1}
              max={pages || 1}
              value={view.page}
              disabled={!loaded}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= pages)
                  change({ ...view, page: n });
              }}
            />
          </label>
          <button
            type="button"
            disabled={!loaded || view.zoom <= 0.5}
            onClick={() =>
              change({ ...view, zoom: Math.max(0.5, view.zoom - 0.25) })
            }
          >
            {l('Zoom out', 'تصغير')}
          </button>
          <button
            type="button"
            disabled={!loaded || view.zoom >= 3}
            onClick={() =>
              change({ ...view, zoom: Math.min(3, view.zoom + 0.25) })
            }
          >
            {l('Zoom in', 'تكبير')}
          </button>
          <button
            type="button"
            disabled={!loaded}
            onClick={() => change({ ...view, fit: 'width', zoom: 1 })}
          >
            {l('Reset zoom / fit width', 'إعادة التكبير وملاءمة العرض')}
          </button>
          {original && (
            <a className="secondary" href={original} download>
              {l('Download original file', 'تنزيل الملف الأصلي')} ↓
            </a>
          )}
        </div>
      </details>
    </div>
  );
}
