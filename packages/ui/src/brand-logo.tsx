import { cn } from './utils.js';
import { useId } from 'react';
import { primaryLogoMarkup } from './primary-logo.generated.js';

/** The complete supplied identity, including its bilingual wordmark. */
export function BrandLogo({
  compact = false,
  decorative = false,
  label,
  className,
}: {
  compact?: boolean;
  decorative?: boolean;
  label: string;
  className?: string;
}) {
  const id = 'brand-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const markup = primaryLogoMarkup
    .replace(
      /\b(fill|stroke):\s*(#[0-9a-fA-F]{3,8})/g,
      '$1:var(--brand-logo-paint, $2)',
    )
    .replace(
      /\b(fill|stroke)="(#[0-9a-fA-F]{3,8})"/g,
      '$1="var(--brand-logo-paint, $2)"',
    )
    .replace(
      '<svg',
      '<svg aria-hidden="true" focusable="false" style="fill:var(--brand-logo-paint,#000000)"',
    )
    .replace(
      /\bid="([^"]+)"/g,
      (_match, value: string) => `id="${id}-${value}"`,
    )
    .replace(
      'aria-labelledby="title desc"',
      `aria-labelledby="${id}-title ${id}-desc"`,
    );
  return (
    <span
      className={cn(
        'ui-primary-logo',
        compact && 'ui-primary-logo-compact',
        className,
      )}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      data-brand-source="/brand/Primary_Logo.svg"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
