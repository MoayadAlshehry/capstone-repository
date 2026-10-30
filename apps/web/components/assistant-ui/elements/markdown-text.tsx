'use client';

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  type MarkdownTextPrimitiveProps,
  memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { type FC, memo, useMemo, useRef } from 'react';
import { useAuiState, type TextMessagePartProps } from '@assistant-ui/react';
import { Citation } from '@/components/assistant-ui/elements/inline-citation';
import { StreamingText } from './streaming-text';
import { Children } from 'react';
import type { AICitation } from '@/ai/types';
import { CheckIcon, CopyIcon } from 'lucide-react';

import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { cn } from '@/lib/utils';

type MarkdownTextProps = Partial<TextMessagePartProps> & {
  components?: Parameters<typeof memoizeMarkdownComponents>[0];
  componentsByLanguage?: MarkdownTextPrimitiveProps['componentsByLanguage'];
};

const useShallowStable = <T extends Record<string, unknown> | undefined>(
  value: T,
): T => {
  const ref = useRef(value);
  if (value !== ref.current) {
    const prev = ref.current;
    const stable =
      value !== undefined &&
      prev !== undefined &&
      Object.keys(prev).length === Object.keys(value).length &&
      Object.keys(value).every((key) => prev[key] === value[key]);
    if (!stable) ref.current = value;
  }
  return ref.current;
};

const MarkdownTextImpl: FC<MarkdownTextProps> = ({
  components,
  componentsByLanguage,
}) => {
  const stableComponents = useShallowStable(components);
  const stableComponentsByLanguage = useShallowStable(componentsByLanguage);
  const markdownComponents = useMemo(() => {
    if (!stableComponents) return defaultComponents;
    return {
      ...defaultComponents,
      ...memoizeMarkdownComponents(stableComponents),
    };
  }, [stableComponents]);

  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={markdownComponents}
      componentsByLanguage={stableComponentsByLanguage}
      smooth={false}
      defer
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root border-border/50 bg-muted/50 mt-3 flex items-center justify-between rounded-t-xl border border-b-0 px-3.5 py-1.5 text-xs">
      <span className="aui-code-header-language text-muted-foreground font-medium lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && (
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        )}
        {isCopied && (
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        )}
      </TooltipIconButton>
    </div>
  );
};

// Preview content is an exact prefix of the verified excerpt; full original
// passages remain in Sources and the authorized native reader.
function citationExcerpt(quote: string) {
  const prefix = Array.from(quote).slice(0, 280).join('');
  if (prefix.length === quote.length) return quote;
  const sentence = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('؟ '));
  const end =
    sentence > 80
      ? sentence + 1
      : prefix.lastIndexOf(' ') > 100
        ? prefix.lastIndexOf(' ')
        : prefix.length;
  return prefix.slice(0, end).trimEnd() + '…';
}
const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        'aui-md-h1 mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        'aui-md-h2 mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        'aui-md-h3 mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        'aui-md-h4 mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        'aui-md-h5 mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        'aui-md-h6 mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0',
        className,
      )}
      {...props}
    />
  ),
  p: function ArrivedParagraph({ className, children, ...props }) {
    const running = useAuiState(
      (state) => state.message.status?.type === 'running',
    );
    return (
      <p
        className={cn(
          'aui-md-p my-3 leading-relaxed first:mt-0 last:mb-0',
          className,
        )}
        {...props}
      >
        {Children.map(children, (child) =>
          running && typeof child === 'string' ? (
            <StreamingText
              as="span"
              className="inline"
              segments={[{ text: child }]}
              count={child.split(' ').length}
              streaming={true}
            />
          ) : (
            child
          ),
        )}
      </p>
    );
  },
  a: function SourceAnchor({ className, href, children, ...props }) {
    const references = useAuiState(
      (state) => state.message.metadata.custom?.['references'],
    ) as AICitation[] | undefined;
    const number = Number(
      String(children).replace(/[٠-٩]/g, (digit) =>
        String(digit.charCodeAt(0) - 0x660),
      ),
    );
    const source =
      Number.isSafeInteger(number) && number > 0
        ? references?.[number - 1]
        : undefined;
    if (source && source.href === href)
      return (
        <Citation
          index={number - 1}
          source={{
            title: source.label,
            snippet: citationExcerpt(source.quote),
            url: source.href,
          }}
        />
      );
    return (
      <a
        className={cn(
          'aui-md-a text-primary hover:text-primary/80 underline underline-offset-2',
          className,
        )}
        href={href}
        {...props}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        'aui-md-blockquote border-muted-foreground/30 text-muted-foreground my-3 border-s-2 ps-4',
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        'aui-md-ul marker:text-muted-foreground my-3 ms-5 list-disc [&>li]:mt-1',
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        'aui-md-ol marker:text-muted-foreground my-3 ms-5 list-decimal [&>li]:mt-1',
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn('aui-md-hr border-muted-foreground/20 my-3', className)}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <div className="aui-md-table-wrapper my-3 overflow-x-auto">
      <table
        className={cn(
          'aui-md-table w-full border-separate border-spacing-0',
          className,
        )}
        {...props}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        'aui-md-th bg-muted px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right',
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        'aui-md-td border-muted-foreground/20 border-s border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right',
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        'aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg',
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn('aui-md-li leading-relaxed', className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong
      className={cn('aui-md-strong font-semibold', className)}
      {...props}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn('aui-md-sup [&>a]:text-xs [&>a]:no-underline', className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        'aui-md-pre border-border/50 bg-muted/30 overflow-x-auto rounded-t-none rounded-b-xl border border-t-0 p-3.5 text-[13px] leading-relaxed',
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        dir="ltr"
        className={cn(
          !isCodeBlock &&
            'aui-md-inline-code bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.85em]',
          className,
        )}
        {...props}
      />
    );
  },
  CodeHeader,
});
