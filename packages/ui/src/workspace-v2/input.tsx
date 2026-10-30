'use client';
import * as React from 'react';

import { cn } from '../utils.js';
import { useClientInputReady } from './client-input-ready.js';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    const prepared = useClientInputReady(!!(props.onChange || props.onInput));
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base text-inherit shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className,
        )}
        ref={ref}
        {...props}
        dir={
          props.dir ??
          (['email', 'url', 'number', 'tel', 'password'].includes(type ?? '') ||
          ['numeric', 'decimal'].includes(props.inputMode ?? '') ||
          props.autoComplete === 'one-time-code'
            ? 'ltr'
            : 'auto')
        }
        disabled={props.disabled || !prepared}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
