'use client';
// Source: shadcn/ui new-york-v4 registry. MIT; scoped paths on existing pinned Radix family.
import * as React from 'react';
import { cn } from '../utils.js';
import { useClientInputReady } from './client-input-ready.js';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  const prepared = useClientInputReady(!!(props.onChange || props.onInput));
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content font-sans min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base text-inherit shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
      dir={props.dir ?? 'auto'}
      disabled={props.disabled || !prepared}
    />
  );
}

export { Textarea };
