'use client';
import { useContext, useState, useEffect, useRef } from 'react';
import { OfficialContext, useOfficialText } from '@/ai/official-locale';
import { useAssistantOverlayPortal } from '@/lib/assistant-portal';

import type { ComponentProps } from 'react';
import { PreviewCard } from '@base-ui/react/preview-card';
import { cn } from '@/lib/utils';
import { floating, mono } from './surfaces';
import { hostOf, safeHref } from '../utils/href';

export interface Source {
  domain?: string | undefined;
  title: string;
  snippet: string;
  url?: string | undefined;
  publishedAt?: string | undefined;
}

export interface CitationProps extends Omit<
  ComponentProps<'a'>,
  'aria-label' | 'children' | 'className' | 'type'
> {
  index: number;
  source: Source;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  className?: string | undefined;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

function formatPublishedAt(publishedAt: string | undefined) {
  if (publishedAt === undefined) return undefined;
  const date = new Date(publishedAt);
  return Number.isNaN(date.getTime()) ? undefined : dateFormatter.format(date);
}

export function Citation({
  index,
  source,
  open,
  onOpenChange,
  className,
  ...props
}: CitationProps) {
  const { locale } = useContext(OfficialContext);
  const text = useOfficialText();
  const portal = useAssistantOverlayPortal();
  const [localOpen, setLocalOpen] = useState(false),
    trigger = useRef<HTMLAnchorElement | null>(null);
  const isOpen = open ?? localOpen;
  const changeOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        changeOpen(false);
      }
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen || !trigger.current) return;
    const viewport = trigger.current.closest(
      '[data-slot="aui_thread-viewport"]',
    );
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0] && !entries[0].isIntersecting) changeOpen(false);
      },
      { root: viewport, threshold: 0.1 },
    );
    observer.observe(trigger.current);
    return () => observer.disconnect();
  }, [isOpen]);
  const number = new Intl.NumberFormat(locale).format(index + 1);
  const domain = source.domain ?? hostOf(source.url);
  const href = safeHref(source.url);
  const publishedAt = formatPublishedAt(source.publishedAt);
  const hasMetadata = domain !== undefined || publishedAt !== undefined;

  return (
    <PreviewCard.Root open={isOpen} onOpenChange={changeOpen}>
      <PreviewCard.Trigger
        delay={0}
        render={<a href={href} ref={trigger} {...props} />}
        aria-label={text('Source') + ' ' + number + ': ' + source.title}
        className={cn(
          'bg-foreground/[0.06] text-muted-foreground hover:text-foreground/90 data-[popup-open]:bg-foreground data-[popup-open]:text-background ms-0.5 inline-flex h-4 min-w-4 translate-y-[-2px] cursor-default items-center justify-center rounded-[5px] px-1 align-middle font-mono text-[10px] font-medium tabular-nums transition-colors motion-reduce:transition-none',
          className,
        )}
      >
        {number}
      </PreviewCard.Trigger>
      <PreviewCard.Portal container={portal}>
        <PreviewCard.Positioner
          side="top"
          sideOffset={8}
          collisionPadding={12}
          positionMethod="fixed"
          className="aui-citation-positioner"
        >
          <PreviewCard.Popup
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
            className={cn(
              floating,
              'aui-citation-popup w-80 origin-(--transform-origin) rounded-2xl p-3.5 outline-none',
              'transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
              'data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0',
            )}
          >
            {hasMetadata ? (
              <div className="flex items-center gap-1.5">
                {domain ? (
                  <>
                    <span className="bg-foreground/[0.06] text-muted-foreground flex size-4 items-center justify-center rounded text-[9px] font-medium">
                      {domain[0]?.toUpperCase()}
                    </span>
                    <span className={cn(mono, 'text-muted-foreground')}>
                      {domain}
                    </span>
                  </>
                ) : null}
                {publishedAt ? (
                  <span className={cn(mono, 'text-muted-foreground')}>
                    {publishedAt}
                  </span>
                ) : null}
              </div>
            ) : null}
            <p
              className={cn(
                'text-[13px] leading-snug font-medium',
                hasMetadata && 'mt-2',
              )}
            >
              {source.title}
            </p>
            <p
              dir="auto"
              className="text-muted-foreground mt-1 text-[13px] leading-relaxed"
            >
              {source.snippet.slice(0, 460)}
              {source.snippet.length > 460 ? '…' : ''}
            </p>
            {href ? (
              <a
                href={href}
                target={href.startsWith('/') ? undefined : '_blank'}
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground mt-3 inline-flex text-xs underline-offset-2 transition-colors hover:underline motion-reduce:transition-none"
              >
                {text('Open source')}{' '}
                {!href.startsWith('/') && (
                  <span className="sr-only">
                    {locale === 'ar'
                      ? '(يُفتح في علامة تبويب جديدة)'
                      : '(opens in a new tab)'}
                  </span>
                )}
              </a>
            ) : null}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

export type InlineCitationProps = ComponentProps<'p'>;

export function InlineCitation({
  children,
  className,
  ...props
}: InlineCitationProps) {
  return (
    <p
      data-slot="inline-citation"
      className={cn(
        'text-foreground/90 max-w-sm text-sm leading-relaxed',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}
