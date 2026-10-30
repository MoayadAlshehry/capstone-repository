'use client';
import { useId } from 'react';
import { MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { usePublicPortal } from './scope';
import type { PublicPdfView } from '../native-files/public-pdf-toolbar';
export function ShadcnPdfToolbar({
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
  const l = (en: string, ar: string) => (locale === 'ar' ? ar : en),
    portal = usePublicPortal(),
    id = useId(),
    loaded = pages > 0;
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
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!loaded || view.page <= 1}
          aria-label={l('Previous page', 'الصفحة السابقة')}
          onClick={() => change({ ...view, page: view.page - 1 })}
        >
          <ChevronLeft />
        </Button>
        {loaded ? (
          <output
            aria-live="polite"
            aria-label={l(
              `Page ${view.page} of ${pages}`,
              `الصفحة ${view.page} من ${pages}`,
            )}
          >
            <bdi dir="ltr">
              {view.page} / {pages}
            </bdi>
          </output>
        ) : (
          <span role="status" className="flex items-center gap-2 text-sm">
            <Spinner />
            {l('Loading document…', 'جارٍ تحميل المستند…')}
          </span>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!loaded || view.page >= pages}
          aria-label={l('Next page', 'الصفحة التالية')}
          onClick={() => change({ ...view, page: view.page + 1 })}
        >
          <ChevronRight />
        </Button>
      </div>
      <Select
        value={sizing}
        disabled={!loaded}
        onValueChange={(v) =>
          v === 'width' || v === 'page'
            ? change({ ...view, fit: v, zoom: 1 })
            : change({ ...view, fit: 'width', zoom: Number(v) })
        }
      >
        <SelectTrigger
          aria-label={l('Zoom and fit', 'التكبير والملاءمة')}
          className="w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent {...portal}>
          <SelectItem value="width">
            {l('Fit width', 'ملاءمة العرض')}
          </SelectItem>
          <SelectItem value="page">{l('Fit page', 'ملاءمة الصفحة')}</SelectItem>
          {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3].map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n * 100}%
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={l('More reading options', 'خيارات قراءة إضافية')}
          >
            <MoreHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          {...portal}
          className={portal.className + ' grid gap-3'}
        >
          <Field>
            <FieldLabel htmlFor={id}>
              {l('Go to page', 'الانتقال إلى الصفحة')}
            </FieldLabel>
            <Input
              id={id}
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
          </Field>
          <Button
            variant="outline"
            disabled={!loaded || view.zoom <= 0.5}
            onClick={() =>
              change({ ...view, zoom: Math.max(0.5, view.zoom - 0.25) })
            }
          >
            {l('Zoom out', 'تصغير')}
          </Button>
          <Button
            variant="outline"
            disabled={!loaded || view.zoom >= 3}
            onClick={() =>
              change({ ...view, zoom: Math.min(3, view.zoom + 0.25) })
            }
          >
            {l('Zoom in', 'تكبير')}
          </Button>
          <Button
            variant="ghost"
            disabled={!loaded}
            onClick={() => change({ ...view, fit: 'width', zoom: 1 })}
          >
            {l('Reset zoom / fit width', 'إعادة التكبير وملاءمة العرض')}
          </Button>
          {original && (
            <Button asChild>
              <a href={original} download>
                {l('Download original file', 'تنزيل الملف الأصلي')} ↓
              </a>
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
