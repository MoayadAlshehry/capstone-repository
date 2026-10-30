import { createElement, type HTMLAttributes } from 'react';
type Locale = 'en' | 'ar';
export function LocalText({
  locale,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { locale: Locale }) {
  return createElement('span', {
    ...props,
    lang: locale,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    className: `shell-text ${locale === 'ar' ? 'ui-arabic' : ''} ${props.className ?? ''}`,
  });
}
export function TechnicalText({
  kind = 'identifier',
  ...props
}: HTMLAttributes<HTMLElement> & {
  kind?: 'identifier' | 'email' | 'url' | 'code' | 'path';
}) {
  return createElement('bdi', {
    ...props,
    dir: 'ltr',
    'data-technical': kind,
    className: `shell-technical ${props.className ?? ''}`,
  });
}
export function MixedText(props: HTMLAttributes<HTMLElement>) {
  return createElement('bdi', { ...props, dir: 'auto' });
}
