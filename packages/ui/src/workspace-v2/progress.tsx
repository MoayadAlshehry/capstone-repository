// shadcn/ui Radix progress composition on the existing pinned primitive family.
'use client';
import { Progress as Primitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../utils.js';
export function Progress({
  value = 0,
  className,
  ...props
}: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        className,
      )}
      {...props}
    >
      <Primitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </Primitive.Root>
  );
}
