'use client';
import type { ComponentProps, ReactNode } from 'react';
import * as W from '../workspace-v2/index.js';
import { scopeAttributes, useDesignScope, ScopedPortal } from './scope.js';
import { StatusLabel, type FeedbackKind } from './presentation.js';
function usePortalProps(className = '') {
  const value = useDesignScope();
  return {
    ...scopeAttributes(value),
    className:
      'wsv2 ds-overlay ' + (value.locale === 'ar' ? 'arabic ' : '') + className,
  };
}
export function ScopedSheetContent({
  className,
  ...props
}: ComponentProps<typeof W.SheetContent>) {
  const scope = useDesignScope(),
    attrs = usePortalProps(className);
  return (
    <W.SheetContent
      closeLabel={scope.locale === 'ar' ? 'إغلاق' : 'Close'}
      {...props}
      {...attrs}
    />
  );
}
export function Dialog({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const attrs = usePortalProps(),
    scope = useDesignScope();
  return (
    <W.Dialog
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <W.DialogTrigger asChild>{trigger}</W.DialogTrigger>
      <W.DialogContent
        {...attrs}
        closeLabel={scope.locale === 'ar' ? 'إغلاق' : 'Close'}
      >
        <W.DialogHeader>
          <W.DialogTitle>{title}</W.DialogTitle>
          <W.DialogDescription>{description}</W.DialogDescription>
        </W.DialogHeader>
        {children}
      </W.DialogContent>
    </W.Dialog>
  );
}
export function Sheet({
  trigger,
  title,
  description,
  children,
  side = 'left',
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  side?: 'left' | 'right';
}) {
  return (
    <W.Sheet>
      <W.SheetTrigger asChild>{trigger}</W.SheetTrigger>
      <ScopedSheetContent side={side}>
        <W.SheetHeader>
          <W.SheetTitle>{title}</W.SheetTitle>
          <W.SheetDescription>{description}</W.SheetDescription>
        </W.SheetHeader>
        {children}
      </ScopedSheetContent>
    </W.Sheet>
  );
}
export function Menu({
  trigger,
  label,
  items,
}: {
  trigger: ReactNode;
  label: string;
  items: ReadonlyArray<{
    label: string;
    disabled?: boolean;
    onSelect: () => void;
  }>;
}) {
  const attrs = usePortalProps();
  return (
    <W.DropdownMenu dir="ltr">
      <W.DropdownMenuTrigger asChild>{trigger}</W.DropdownMenuTrigger>
      <W.DropdownMenuContent {...attrs} aria-label={label}>
        {items.map((item, i) => (
          <W.DropdownMenuItem
            key={i}
            disabled={!!item.disabled}
            onSelect={item.onSelect}
          >
            <bdi dir="auto">{item.label}</bdi>
          </W.DropdownMenuItem>
        ))}
      </W.DropdownMenuContent>
    </W.DropdownMenu>
  );
}
export function Popover({
  trigger,
  children,
  label,
  open,
  onOpenChange,
  onOpenAutoFocus,
  onInteractOutside,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
} & Pick<
  ComponentProps<typeof W.PopoverContent>,
  'onOpenAutoFocus' | 'onInteractOutside'
>) {
  const attrs = usePortalProps();
  return (
    <W.Popover
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <W.PopoverTrigger asChild>{trigger}</W.PopoverTrigger>
      <W.PopoverContent
        {...attrs}
        {...(onOpenAutoFocus ? { onOpenAutoFocus } : {})}
        {...(onInteractOutside ? { onInteractOutside } : {})}
        aria-label={label}
      >
        {children}
      </W.PopoverContent>
    </W.Popover>
  );
}
export function Tooltip({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  const attrs = usePortalProps();
  return (
    <W.TooltipProvider delayDuration={0}>
      <W.Tooltip>
        <W.TooltipTrigger asChild>{trigger}</W.TooltipTrigger>
        <W.TooltipContent {...attrs}>{children}</W.TooltipContent>
      </W.Tooltip>
    </W.TooltipProvider>
  );
}
export function Select({
  label,
  value,
  onValueChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  const attrs = usePortalProps();
  return (
    <W.Select
      dir="ltr"
      value={value}
      onValueChange={onValueChange}
      disabled={!!disabled}
    >
      <W.SelectTrigger aria-label={label}>
        <W.SelectValue />
      </W.SelectTrigger>
      <W.SelectContent {...attrs} position="popper">
        {options.map((item) => (
          <W.SelectItem value={item.value} key={item.value}>
            <bdi dir="auto">{item.label}</bdi>
          </W.SelectItem>
        ))}
      </W.SelectContent>
    </W.Select>
  );
}
export function ToastNotice({
  kind,
  message,
  dismissLabel,
  onDismiss,
}: {
  kind: FeedbackKind;
  message: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <ScopedPortal>
      <aside className="ds-toast" role="status">
        <StatusLabel kind={kind}>{message}</StatusLabel>
        <W.Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          ×
        </W.Button>
      </aside>
    </ScopedPortal>
  );
}
