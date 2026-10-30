import { Suspense } from 'react';
import { Skeleton, SkeletonTemplate } from '../public-ui/skeleton';
import { PublicRoute } from './route';
import { StreamError } from './stream-error';
import type { PublicData } from './types';
async function DataSection({
  promise,
  part,
  locale,
}: {
  promise: Promise<PublicData>;
  part: string;
  locale: 'en' | 'ar';
}) {
  try {
    return <PublicRoute data={await promise} region={part} />;
  } catch {
    return <StreamError part={part} locale={locale} />;
  }
}
export function streamSection(
  promise: Promise<PublicData>,
  part: string,
  locale: 'en' | 'ar',
  view = 'grid',
) {
  const label =
    locale === 'ar' ? 'جارٍ تحميل المحتوى العام' : 'Loading public content';
  const fallback =
    part === 'featured' ? (
      <SkeletonTemplate template="home" />
    ) : part === 'reader' ? (
      <section id="files" className="public-reader" aria-busy="true">
        <h2 dir="auto">{locale === 'ar' ? 'الملفات' : 'Files'}</h2>
        <SkeletonTemplate template="file-tree" />
        <SkeletonTemplate template="file-preview" />
      </section>
    ) : part === 'results' || part === 'selection' ? (
      <SkeletonTemplate
        template={
          part === 'selection' || view === 'list'
            ? 'catalogue-list'
            : 'catalogue-grid'
        }
      />
    ) : (
      <span aria-hidden="true">
        <Skeleton className="h-4 w-48" />
      </span>
    );
  return (
    <Suspense
      fallback={
        <>
          <span
            className="sr-only"
            role={
              part === 'featured' || part === 'reader' ? 'status' : undefined
            }
          >
            {label}
          </span>
          {fallback}
        </>
      }
    >
      <DataSection promise={promise} part={part} locale={locale} />
    </Suspense>
  );
}
