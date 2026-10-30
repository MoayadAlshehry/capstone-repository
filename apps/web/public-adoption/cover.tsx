'use client';
import { useEffect, useRef, useState } from 'react';
import type { VisualImageView } from '@capstone/ui/visual-media';
import { Button } from '@/components/ui/button';
/** Resolve identity before rendering. A pending/error cover never borrows another image. */
export function PublicCover({
  id,
  title,
  src,
  priority,
  image,
  locale,
}: {
  id: string;
  title: string;
  src: string;
  priority: boolean;
  image?: VisualImageView | null;
  locale: 'en' | 'ar';
}) {
  const [retry, setRetry] = useState(0),
    [failed, setFailed] = useState<string | null>(null),
    [inLink, setInLink] = useState(false);
  const actual = src.startsWith('/api/visual-media/image?') ? src : '';
  const pixels = useRef<HTMLImageElement>(null);
  const fail = (node: HTMLImageElement) => {
    setInLink(!!node.closest('a'));
    setFailed(actual);
  };
  useEffect(() => {
    // A server-rendered image can fail before React attaches its error listener.
    const node = pixels.current;
    if (actual && node?.complete && node.naturalWidth === 0) fail(node);
  }, [actual, retry]);
  return (
    <div
      className="cover p3-project-media"
      data-project-cover={id}
      data-media-state={
        !actual ? 'empty' : failed === actual ? 'error' : 'identity-known'
      }
    >
      {actual && failed !== actual && (
        <img
          ref={pixels}
          key={actual + retry}
          className="cover"
          src={actual}
          srcSet={
            image && image.smallWidth !== image.width
              ? `${image.smallSrc} ${image.smallWidth}w, ${actual} ${image.width}w`
              : undefined
          }
          sizes={
            priority
              ? '(max-width: 760px) 100vw, 65vw'
              : '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 480px'
          }
          width={image?.width ?? 1600}
          height={image?.height ?? 1000}
          alt={title}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onError={(event) => fail(event.currentTarget)}
        />
      )}
      {failed === actual &&
        actual &&
        (inLink ? (
          <span className="cover-retry cover-error">
            <bdi>{title}</bdi>
            <span>
              {locale === 'ar'
                ? 'الصورة غير متاحة. افتح المشروع للمحاولة مجددًا.'
                : 'Cover unavailable. Open the project to retry.'}
            </span>
          </span>
        ) : (
          <Button
            variant="outline"
            type="button"
            className="cover-retry"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setFailed(null);
              setRetry((n) => n + 1);
            }}
            aria-label={
              title + (locale === 'ar' ? ' · إعادة المحاولة' : ' · Retry')
            }
          >
            ↻ <span>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
          </Button>
        ))}
    </div>
  );
}
