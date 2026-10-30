'use client';
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type ComponentProps,
} from 'react';
type Locale = 'en' | 'ar';
const Bidi = createContext<Locale>('en');
/** Direction belongs to text/field units. This provider adds no structural DOM wrapper. */
export function BidiProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <Bidi.Provider value={locale}>{children}</Bidi.Provider>;
}
export function useBidi() {
  const locale = useContext(Bidi);
  return useMemo(
    () => ({
      locale,
      direction: locale === 'ar' ? ('rtl' as const) : ('ltr' as const),
    }),
    [locale],
  );
}
export type BidiKind =
  | 'text'
  | 'number'
  | 'range'
  | 'date'
  | 'identifier'
  | 'email'
  | 'url'
  | 'path'
  | 'code'
  | 'token';
/** Keep source separators in their logical LTR order while shaping each name naturally. */
export function bidiPathParts(text: string) {
  return text.split(/([/\\.])/u).filter((part) => part !== '');
}
/** Presentation-only lexical units. No normalization, parsing, evaluation or text mutation. */
export function bidiCodeParts(text: string) {
  const rtl = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
  if (!rtl.test(text)) return [text];
  const word = /[\p{L}\p{M}\p{N}_$]/u,
    parts: string[] = [],
    pending: string[] = [];
  const point = (index: number) =>
    String.fromCodePoint(text.codePointAt(index)!);
  let i = 0,
    linePrefix = true;
  const emit = (value: string) => {
    if (rtl.test(value)) {
      if (pending.length) {
        parts.push(pending.join(''));
        pending.length = 0;
      }
      parts.push(value);
    } else pending.push(value);
    const last = Math.max(value.lastIndexOf('\n'), value.lastIndexOf('\r'));
    if (last >= 0) linePrefix = /^\s*$/u.test(value.slice(last + 1));
    else if (/\S/u.test(value)) linePrefix = false;
  };
  while (i < text.length) {
    const start = i,
      ch = text[i]!;
    if (ch === '"' || ch === "'" || ch.charCodeAt(0) === 96) {
      const quote = ch;
      i++;
      while (i < text.length) {
        const current = text[i++]!;
        if (current === '\\') {
          if (i < text.length) i++;
        } else if (current === quote) break;
      }
    } else if (text.startsWith('//', i) || (ch === '#' && linePrefix)) {
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (word.test(point(i))) {
      do {
        i += point(i).length;
      } while (i < text.length && word.test(point(i)));
    } else {
      i += point(i).length;
      while (
        i < text.length &&
        !word.test(point(i)) &&
        !['"', "'", '#'].includes(text[i]!) &&
        text.charCodeAt(i) !== 96 &&
        !text.startsWith('//', i) &&
        !text.startsWith('/*', i)
      )
        i += point(i).length;
    }
    emit(text.slice(start, i));
  }
  if (pending.length) parts.push(pending.join(''));
  return parts;
}

/** Isolate scalar identity/numeric values without translating, reversing or reformatting them. */
export function BidiValue({
  kind = 'text',
  className = '',
  children,
  ...props
}: Omit<ComponentProps<'bdi'>, 'dir'> & { kind?: BidiKind }) {
  return (
    <bdi
      {...props}
      dir={kind === 'text' ? 'auto' : 'ltr'}
      data-bidi-kind={kind}
      className={'ui-bidi-value ' + className}
    >
      {typeof children === 'string' && kind === 'path'
        ? bidiPathParts(children).map((part, index) => (
            <bdi
              key={index}
              dir={/^[\\/.]$/.test(part) ? 'ltr' : 'auto'}
              data-bidi-segment={/^[\\/.]$/.test(part) ? 'separator' : 'name'}
            >
              {part}
            </bdi>
          ))
        : typeof children === 'string' && kind === 'code'
          ? bidiCodeParts(children).map((part, index) => (
              <bdi key={index} dir="ltr" data-bidi-code-unit>
                {part}
              </bdi>
            ))
          : children}
    </bdi>
  );
}

/** A metadata grid keeps its column geometry while labels and values form one local text unit. */
export function BidiFacts(props: ComponentProps<'dl'>) {
  const { locale } = useBidi();
  return <dl {...props} dir="ltr" lang={locale} data-bidi-facts />;
}
export function BidiFact(props: ComponentProps<'div'>) {
  const { direction, locale } = useBidi();
  return <div dir={direction} lang={locale} {...props} />;
}
export function BidiLabel(props: ComponentProps<'dt'>) {
  const { locale, direction } = useBidi();
  return <dt {...props} dir={direction} lang={locale} />;
}
export function BidiData({ children, ...props }: ComponentProps<'dd'>) {
  const { locale, direction } = useBidi(),
    plain = typeof children === 'number' || typeof children === 'string',
    numeric = plain && /^[\p{N}\s.,:/–—+%()-]+$/u.test(String(children));
  return (
    <dd {...props} dir={direction} lang={locale} data-bidi-data>
      {plain ? (
        <BidiValue kind={numeric ? 'number' : 'text'}>{children}</BidiValue>
      ) : (
        children
      )}
    </dd>
  );
}
