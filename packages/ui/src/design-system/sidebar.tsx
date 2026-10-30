'use client';
import * as React from 'react';
import {
  useSidebar,
  Sheet,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../workspace-v2/index.js';
import { ScopedSheetContent as SheetContent } from './overlays.js';
import { useDesignScope } from './scope.js';
import { cn } from '../utils.js';
const SIDEBAR_WIDTH_MOBILE = '18rem';
export const ScopedSidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    closeLabel?: string;
    navigationLabel?: string;
    navigationDescription?: string;
    side?: 'left' | 'right';
    variant?: 'sidebar' | 'floating' | 'inset';
    collapsible?: 'offcanvas' | 'icon' | 'none';
  }
>(
  (
    {
      closeLabel = 'Close',
      navigationLabel = 'Navigation',
      navigationDescription = 'Workspace navigation',
      side = 'left',
      variant = 'sidebar',
      collapsible = 'offcanvas',
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
    const scope = useDesignScope();

    if (collapsible === 'none') {
      return (
        <div
          className={cn(
            'flex h-full w-[var(--sidebar-width)] flex-col bg-sidebar text-sidebar-foreground',
            className,
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      );
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              scope.root.current
                ?.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')
                ?.focus();
            }}
            closeLabel={closeLabel}
            data-sidebar="sidebar"
            data-mobile="true"
            className="wsv2 w-[var(--sidebar-width)] bg-sidebar p-0 text-sidebar-foreground"
            style={
              {
                '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
              } as React.CSSProperties
            }
            side={side}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{navigationLabel}</SheetTitle>
              <SheetDescription>{navigationDescription}</SheetDescription>
            </SheetHeader>
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        className="group peer hidden text-sidebar-foreground md:block"
        data-state={state}
        data-collapsible={state === 'collapsed' ? collapsible : ''}
        data-variant={variant}
        data-side={side}
      >
        {/* This is what handles the sidebar gap on desktop */}
        <div
          className={cn(
            'relative w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear',
            'group-data-[collapsible=offcanvas]:w-0',
            'group-data-[side=right]:rotate-180',
            variant === 'floating' || variant === 'inset'
              ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]'
              : 'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]',
          )}
        />
        <div
          className={cn(
            'fixed inset-y-0 z-10 hidden h-svh w-[var(--sidebar-width)] transition-[left,right,width] duration-200 ease-linear md:flex',
            side === 'left'
              ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
              : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
            // Adjust the padding for floating and inset variants.
            variant === 'floating' || variant === 'inset'
              ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]'
              : 'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)] group-data-[side=left]:border-r group-data-[side=right]:border-l',
            className,
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow"
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);

ScopedSidebar.displayName = 'ScopedSidebar';
