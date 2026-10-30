'use client';
import { BidiValue } from '@capstone/ui/bidi';
import Markdown from 'react-markdown';
import { sourcePosition } from './source-locator';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { safeMarkdownUrl } from '@capstone/domain';
import { useTranslations } from 'next-intl';
export function SafeMarkdown({
  text,
  resolvePublic,
}: {
  text: string;
  resolvePublic?: (value: string, image: boolean) => string | undefined;
}) {
  const t = useTranslations('NativeFiles');
  return (
    <div className="native-markdown" dir="auto">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        urlTransform={(value, key) =>
          resolvePublic?.(value, key === 'src') ?? safeMarkdownUrl(value)
        }
        components={{
          h1: ({ children, node }) => (
            <h1 {...sourcePosition(node)} dir="auto">
              {children}
            </h1>
          ),
          h2: ({ children, node }) => (
            <h2 {...sourcePosition(node)} dir="auto">
              {children}
            </h2>
          ),
          h3: ({ children, node }) => (
            <h3 {...sourcePosition(node)} dir="auto">
              {children}
            </h3>
          ),
          h4: ({ children, node }) => (
            <h4 {...sourcePosition(node)} dir="auto">
              {children}
            </h4>
          ),
          h5: ({ children, node }) => (
            <h5 {...sourcePosition(node)} dir="auto">
              {children}
            </h5>
          ),
          h6: ({ children, node }) => (
            <h6 {...sourcePosition(node)} dir="auto">
              {children}
            </h6>
          ),
          p: ({ children, node }) => (
            <p {...sourcePosition(node)} dir="auto">
              {children}
            </p>
          ),
          li: ({ children, node }) => (
            <li {...sourcePosition(node)} dir="auto">
              {children}
            </li>
          ),
          blockquote: ({ children, node }) => (
            <blockquote {...sourcePosition(node)} dir="auto">
              {children}
            </blockquote>
          ),
          table: ({ children, node }) => (
            <table {...sourcePosition(node)} dir="ltr">
              {children}
            </table>
          ),
          th: ({ children, node }) => (
            <th {...sourcePosition(node)} dir="auto">
              {children}
            </th>
          ),
          td: ({ children, node }) => (
            <td {...sourcePosition(node)} dir="auto">
              {children}
            </td>
          ),
          ...(resolvePublic
            ? {
                h1: ({
                  children,
                  node,
                }: {
                  children?: import('react').ReactNode;
                  node?: Parameters<typeof sourcePosition>[0];
                }) => (
                  <h4
                    {...sourcePosition(node)}
                    dir="auto"
                    className="native-document-title"
                  >
                    {children}
                  </h4>
                ),
                h2: ({
                  children,
                  node,
                }: {
                  children?: import('react').ReactNode;
                  node?: Parameters<typeof sourcePosition>[0];
                }) => (
                  <h5
                    {...sourcePosition(node)}
                    dir="auto"
                    className="native-document-subtitle"
                  >
                    {children}
                  </h5>
                ),
                h3: ({
                  children,
                  node,
                }: {
                  children?: import('react').ReactNode;
                  node?: Parameters<typeof sourcePosition>[0];
                }) => (
                  <h6 {...sourcePosition(node)} dir="auto">
                    {children}
                  </h6>
                ),
              }
            : {}),
          img: ({ alt, src }) =>
            resolvePublic &&
            typeof src === 'string' &&
            src.startsWith('/api/public-files?') ? (
              <img src={src} alt={alt ?? ''} loading="lazy" />
            ) : (
              <span>{t('imageBlocked', { alt: alt ?? '' })}</span>
            ),
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                target={
                  href.startsWith('#') || href.startsWith('/')
                    ? undefined
                    : '_blank'
                }
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          pre: ({ children, node }) => (
            <pre {...sourcePosition(node)} dir="ltr">
              {children}
            </pre>
          ),
          code: ({ children, className }) => (
            <code dir="ltr">
              <BidiValue
                kind={
                  className &&
                  /language-(?:text|plaintext|plain)$/.test(className)
                    ? 'text'
                    : 'code'
                }
              >
                {children}
              </BidiValue>
            </code>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
