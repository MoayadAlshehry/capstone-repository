'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type ComponentProps,
  type ComponentPropsWithRef,
} from 'react';
import {
  Dialog as DialogPrimitive,
  DropdownMenu as MenuPrimitive,
  Tooltip as TooltipPrimitive,
  Tabs as TabsPrimitive,
  Select as SelectPrimitive,
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioPrimitive,
  Switch as SwitchPrimitive,
  Label as LabelPrimitive,
  Separator as SeparatorPrimitive,
} from 'radix-ui';
import {
  Check,
  ChevronDown,
  Circle,
  LoaderCircle,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
  Sun,
  Moon,
} from 'lucide-react';
import { cva } from 'class-variance-authority';
import { Toaster as Sonner, toast } from 'sonner';
import { cn } from './utils.js';
import {
  applyAppearance,
  resolveAppearance,
  resolveTheme,
  themeStorageKey,
  type Theme,
} from './theme.js';
export { cn, toast };
export {
  Palette,
  Layers,
  RefreshCw,
  MoreHorizontal,
  FolderOpen,
  Menu as MenuIcon,
} from 'lucide-react';
export { Info };
export { tokens } from './tokens.generated.js';
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setState] = useState<Theme>('light');
  useEffect(() => {
    const update = () =>
      setState(resolveTheme(document.documentElement.dataset['theme']));
    update();
    const storage = (event: StorageEvent) => {
      if (event.key === themeStorageKey) {
        applyAppearance(resolveAppearance(event.newValue));
        update();
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    window.addEventListener('storage', storage);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', storage);
    };
  }, []);
  const setTheme = (next: Theme) => {
    applyAppearance(next);
    setState(next);
  };
  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw Error('ThemeProvider required');
  return value;
}
export function ThemeToggle({
  lightLabel,
  darkLabel,
  compact = false,
}: {
  lightLabel: string;
  darkLabel: string;
  compact?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      aria-pressed={theme === 'dark'}
      aria-label={theme === 'light' ? darkLabel : lightLabel}
    >
      {theme === 'light' ? <Moon aria-hidden /> : <Sun aria-hidden />}
      {!compact && (theme === 'light' ? darkLabel : lightLabel)}
    </Button>
  );
}
export function Toaster({
  label,
  closeLabel,
}: {
  label: string;
  closeLabel: string;
}) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      containerAriaLabel={label}
      closeButton
      position="bottom-right"
      icons={{
        success: <CheckCircle2 aria-hidden />,
        info: <Info aria-hidden />,
        warning: <TriangleAlert aria-hidden />,
        error: <AlertCircle aria-hidden />,
      }}
      toastOptions={{
        unstyled: true,
        className: 'ui-toast',
        closeButtonAriaLabel: closeLabel,
      }}
    />
  );
}
const buttonVariants = cva('ui-button', {
  variants: {
    variant: {
      primary: 'ui-primary',
      secondary: 'ui-secondary',
      outline: 'ui-outline',
      ghost: 'ui-ghost',
      destructive: 'ui-destructive',
    },
    size: {
      default: 'ui-size-default',
      small: 'ui-size-small',
      icon: 'ui-size-icon',
    },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});
type ButtonBase = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  loading?: boolean;
  loadingLabel?: string;
};
export type ButtonProps = ButtonBase &
  ({ size: 'icon'; 'aria-label': string } | { size?: 'default' | 'small' });
export function Button({
  variant,
  size,
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  if (size === 'icon' && !props['aria-label']?.trim())
    throw Error('Icon-only action requires an accessible label');
  if (loading && !loadingLabel)
    throw Error('Loading action requires a localized label');
  return (
    <button
      {...props}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner label={loadingLabel!} /> : null}
      {children}
    </button>
  );
}
export function Spinner({ label }: { label: string }) {
  return (
    <span className="ui-spinner" role="status">
      <LoaderCircle aria-hidden />
      <span className="ui-sr-only">{label}</span>
    </span>
  );
}
export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root {...props} className={cn('ui-label', className)} />
  );
}
export function Input({ className, ...props }: ComponentPropsWithRef<'input'>) {
  return <input {...props} className={cn('ui-input', className)} />;
}
export function Textarea({
  className,
  ...props
}: ComponentPropsWithRef<'textarea'>) {
  return (
    <textarea {...props} className={cn('ui-input ui-textarea', className)} />
  );
}
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}
export function Field({
  id,
  label,
  help,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: (props: FieldControlProps) => ReactNode;
  className?: string;
}) {
  const description = [help ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cn('ui-field', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </Label>
      {children({
        id,
        ...(description ? { 'aria-describedby': description } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
        ...(required ? { 'aria-required': true } : {}),
      })}
      {help ? (
        <div id={`${id}-help`} className="ui-help">
          {help}
        </div>
      ) : null}
      {error ? (
        <div id={`${id}-error`} className="ui-field-error">
          <AlertCircle aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
export function Text({
  language = 'en',
  className,
  children,
  ...props
}: ComponentPropsWithRef<'span'> & { language?: 'en' | 'ar' }) {
  return (
    <span
      {...props}
      lang={language}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className={cn('ui-text', language === 'ar' && 'ui-arabic', className)}
    >
      {children}
    </span>
  );
}
export function Code({ className, ...props }: ComponentPropsWithRef<'code'>) {
  return <code {...props} dir="ltr" className={cn('ui-code', className)} />;
}
export function Card({
  className,
  ...props
}: ComponentPropsWithRef<'section'>) {
  return <section {...props} className={cn('ui-card', className)} />;
}
type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'info';
export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentPropsWithRef<'span'> & { tone?: Tone }) {
  return (
    <span {...props} className={cn('ui-badge', `ui-tone-${tone}`, className)} />
  );
}
export const StatusBadge = Badge;
const icons = {
  neutral: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
  info: Info,
};
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  return (
    <div
      className={cn('ui-alert', `ui-tone-${tone}`, className)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon aria-hidden />
      <div>
        <strong>{title}</strong>
        {children ? (
          <div className="ui-alert-description">{children}</div>
        ) : null}
        {action}
      </div>
    </div>
  );
}
export function Separator(
  props: ComponentProps<typeof SeparatorPrimitive.Root>,
) {
  return (
    <SeparatorPrimitive.Root
      {...props}
      className={cn('ui-separator', props.className)}
    />
  );
}
export function Skeleton({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn('ui-skeleton', className)}
    />
  );
}
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      {icon ? (
        <div aria-hidden="true" className="ui-empty-icon">
          {icon}
        </div>
      ) : null}
      <h3 dir="auto">{title}</h3>
      <p dir="auto">{description}</p>
      {action}
    </div>
  );
}
export const Select = SelectPrimitive.Root;
export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      {...props}
      dir="ltr"
      className={cn('ui-input ui-select-trigger', className)}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export const SelectValue = SelectPrimitive.Value;
export function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        {...props}
        dir="ltr"
        position="popper"
        sideOffset={6}
        collisionPadding={16}
        className={cn('ui-menu ui-select-content', className)}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item {...props} className={cn('ui-menu-item', className)}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator>
        <Check aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
export function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root {...props} className={cn('ui-checkbox', className)}>
      <CheckboxPrimitive.Indicator>
        <Check aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
export function RadioGroup({
  className,
  onKeyDownCapture,
  ...props
}: ComponentProps<typeof RadioPrimitive.Root>) {
  return (
    <RadioPrimitive.Root
      {...props}
      dir="ltr"
      className={cn('ui-radio-group', className)}
      onKeyDownCapture={(event) => {
        onKeyDownCapture?.(event);
        if (
          event.defaultPrevented ||
          ![
            'ArrowDown',
            'ArrowUp',
            'ArrowLeft',
            'ArrowRight',
            'Home',
            'End',
          ].includes(event.key)
        )
          return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            '[role="radio"]:not([disabled]):not([aria-disabled="true"])',
          ),
        );
        const current = items.findIndex((item) => item === event.target);
        if (current < 0 || !items.length) return;
        const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (current + (forward ? 1 : -1) + items.length) % items.length;
        event.preventDefault();
        // Select synchronously; accelerated keyup must not cancel Radix's deferred focus activation.
        items[index]!.click();
        items[index]!.focus();
      }}
    />
  );
}
export function RadioItem({
  className,
  ...props
}: ComponentProps<typeof RadioPrimitive.Item>) {
  return (
    <RadioPrimitive.Item {...props} className={cn('ui-radio', className)}>
      <RadioPrimitive.Indicator>
        <Circle aria-hidden fill="currentColor" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Item>
  );
}
export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      {...props}
      dir="ltr"
      className={cn('ui-switch', className)}
    >
      <SwitchPrimitive.Thumb className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
export const Dialog = DialogPrimitive.Root,
  DialogTrigger = DialogPrimitive.Trigger,
  DialogClose = DialogPrimitive.Close;
export function DialogContent({
  closeLabel,
  children,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { closeLabel: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="ui-overlay" />
      <DialogPrimitive.Content
        {...props}
        dir="ltr"
        className={cn('ui-dialog', className)}
      >
        {children}
        <DialogPrimitive.Close
          className="ui-dialog-close"
          aria-label={closeLabel}
        >
          <X aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      {...props}
      className={cn('ui-dialog-title', className)}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      {...props}
      className={cn('ui-muted', className)}
    />
  );
}
export const DropdownMenu = MenuPrimitive.Root,
  DropdownTrigger = MenuPrimitive.Trigger;
export function DropdownContent({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        {...props}
        sideOffset={6}
        collisionPadding={16}
        className={cn('ui-menu', className)}
      />
    </MenuPrimitive.Portal>
  );
}
export function DropdownItem({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item {...props} className={cn('ui-menu-item', className)} />
  );
}
export const TooltipProvider = TooltipPrimitive.Provider;
const TooltipFocus = createContext<{
  focus: React.MutableRefObject<boolean>;
  change: (open: boolean) => void;
} | null>(null);
export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const focus = useRef(false);
  const change = (next: boolean) => {
    setOpen(next);
    props.onOpenChange?.(next);
  };
  return (
    <TooltipFocus value={{ focus, change }}>
      <TooltipPrimitive.Root
        {...props}
        open={props.open ?? open}
        onOpenChange={(next) => {
          if (next || !focus.current) change(next);
        }}
      />
    </TooltipFocus>
  );
}
export function TooltipTrigger({
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const context = useContext(TooltipFocus);
  if (!context) throw Error('Tooltip root required');
  return (
    <TooltipPrimitive.Trigger
      {...props}
      onFocus={(event) => {
        onFocus?.(event);
        context.focus.current = true;
        context.change(true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        context.focus.current = false;
        context.change(false);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Escape') {
          context.focus.current = false;
          context.change(false);
        }
      }}
    />
  );
}
export function TooltipContent({
  className,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        {...props}
        sideOffset={6}
        collisionPadding={16}
        className={cn('ui-tooltip', className)}
      />
    </TooltipPrimitive.Portal>
  );
}
export const Tabs = TabsPrimitive.Root;
export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List {...props} className={cn('ui-tabs-list', className)} />
  );
}
export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      {...props}
      className={cn('ui-tabs-trigger', className)}
    />
  );
}
export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      {...props}
      className={cn('ui-tabs-content', className)}
    />
  );
}
export function Table({ className, ...props }: ComponentPropsWithRef<'table'>) {
  return (
    <div className="ui-table-scroll">
      <table dir="ltr" {...props} className={cn('ui-table', className)} />
    </div>
  );
}
export function Pagination({
  label,
  page,
  totalPages,
  onPageChange,
  previousLabel,
  nextLabel,
}: {
  label: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <nav aria-label={label} className="ui-pagination" dir="ltr">
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {previousLabel}
      </Button>
      <span aria-live="polite" dir="ltr">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {nextLabel}
      </Button>
    </nav>
  );
}
export { BrandLogo } from './brand-logo.js';
