'use client';
import { BidiValue } from '@capstone/ui/bidi';
import { useState, type CSSProperties } from 'react';
import { Button, Copy } from '@capstone/ui/workspace-v2';
import { t, type Locale } from './common';
import { copyOriginalText } from './clipboard';
export function CodeReader({
  locale,
  text,
  tokens,
  language,
  truncated,
}: {
  locale: Locale;
  text: string;
  tokens?: { content: string; light: string; dark: string }[][] | undefined;
  language?: string | undefined;
  truncated: boolean;
}) {
  const sourceCode =
    !!language && !['text', 'plaintext', 'plain'].includes(language);
  const [wrap, setWrap] = useState(false),
    [lines, setLines] = useState(true),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false),
    copy = (en: string, ar: string) => t(locale, en, ar);
  // Render original line separators as text. Gutter is never part of copied source.
  const raw = text.split(/(\r\n|\n|\r)/),
    sourceLines = raw.filter((_, i) => i % 2 === 0),
    valid =
      tokens &&
      tokens.length === sourceLines.length &&
      tokens.every(
        (line, i) => line.map((x) => x.content).join('') === sourceLines[i],
      );
  return (
    <section
      className="ss-code-surface"
      data-wrap={wrap}
      aria-label={copy(
        'Read-only original source',
        'المصدر الأصلي للقراءة فقط',
      )}
    >
      <div className="ss-code-toolbar">
        <span>{language || copy('Plain text', 'نص عادي')}</span>
        <Button
          variant="ghost"
          aria-pressed={wrap}
          onClick={() => setWrap((v) => !v)}
        >
          {copy('Wrap lines', 'التفاف الأسطر')}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={lines}
          onClick={() => setLines((v) => !v)}
        >
          {copy('Line numbers', 'أرقام الأسطر')}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            const success = await copyOriginalText(text);
            setCopied(success);
            setCopyError(!success);
          }}
        >
          <Copy />
          {copied
            ? copy(
                truncated ? 'Preview copied' : 'Code copied',
                truncated ? 'نُسخت المعاينة' : 'نُسخ النص',
              )
            : copy('Copy code', 'نسخ النص')}
        </Button>
      </div>
      <div
        className="ss-code-scroll"
        role="region"
        tabIndex={0}
        aria-label={copy(
          'Original source · scroll horizontally or enable Wrap lines',
          'المصدر الأصلي · مرّر أفقيًا أو فعّل التفاف الأسطر',
        )}
      >
        <pre dir="ltr">
          <code>
            {sourceLines.length > 2000 && !wrap ? (
              <span className="ss-code-line">
                {lines && (
                  <span className="ss-code-gutter" aria-hidden="true">
                    {sourceLines.map((_, i) => i + 1).join('\n')}
                  </span>
                )}
                <span className="ss-code-text">
                  <BidiValue kind={sourceCode ? 'code' : 'text'}>
                    {text}
                  </BidiValue>
                </span>
              </span>
            ) : (
              sourceLines.map((line, i) => (
                <span className="ss-code-line" key={i}>
                  {lines && (
                    <span className="ss-code-gutter" aria-hidden="true">
                      {i + 1}
                    </span>
                  )}
                  <span className="ss-code-text">
                    {valid ? (
                      tokens![i]!.map((token, n) => (
                        <span
                          key={n}
                          className="ss-code-token"
                          style={
                            {
                              '--code-light': token.light,
                              // Dark Plus punctuation gray needs a small contrast lift at 14px.
                              '--code-dark':
                                token.dark.toLowerCase() === '#808080'
                                  ? '#8a8a8a'
                                  : token.dark,
                            } as CSSProperties
                          }
                        >
                          <BidiValue kind={sourceCode ? 'token' : 'text'}>
                            {token.content}
                          </BidiValue>
                        </span>
                      ))
                    ) : (
                      <BidiValue kind={sourceCode ? 'code' : 'text'}>
                        {line}
                      </BidiValue>
                    )}
                    {raw[i * 2 + 1] ?? ''}
                  </span>
                </span>
              ))
            )}
          </code>
        </pre>
      </div>
      {(truncated || copyError || copied) && (
        <p dir="auto" className="ss-code-message" role="status">
          {copyError
            ? copy(
                'Copy was unavailable. Select the source text or download the original.',
                'تعذر النسخ. حدد النص أو نزّل الأصل.',
              )
            : copied
              ? copy(
                  truncated ? 'Preview copied.' : 'Original source copied.',
                  truncated ? 'نُسخت المعاينة.' : 'نُسخ المصدر الأصلي.',
                )
              : copy(
                  'Preview is truncated. Copy code copies this excerpt only. Download original for complete content.',
                  'المعاينة مختصرة. ينسخ زر النص هذا المقتطف فقط. نزّل الأصل للمحتوى الكامل.',
                )}
        </p>
      )}
    </section>
  );
}
