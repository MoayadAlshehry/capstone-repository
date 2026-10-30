import { BrandLogo } from '../brand-logo.js';
import type { ComponentProps, ReactNode } from 'react';
export type FeedbackKind =
  'info' | 'success' | 'warning' | 'danger' | 'pending' | 'unavailable';
/** Native semantics and supplied state only. No permission, route or outcome inference. */
export function Action({
  pending,
  children,
  variant = 'primary',
  className = variant === 'primary'
    ? 'button'
    : variant === 'secondary' || variant === 'outline'
      ? 'secondary'
      : 'ds-action-' + variant,
  disabled,
  ...props
}: ComponentProps<'button'> & {
  pending?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'quiet' | 'danger';
}) {
  return (
    <button
      type="button"
      {...props}
      className={className}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending && <span className="action-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function AnchorAction({
  className = 'button',
  disabled = false,
  href,
  onClick,
  ...props
}: ComponentProps<'a'> & { disabled?: boolean }) {
  return (
    <a
      {...props}
      className={className}
      href={disabled ? undefined : href}
      role={disabled ? 'link' : props.role}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : props.tabIndex}
      onClick={disabled ? undefined : onClick}
    />
  );
}
export function IconAction({
  label,
  children,
  ...props
}: Omit<ComponentProps<typeof Action>, 'children'> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Action {...props} aria-label={label}>
      <span aria-hidden="true">{children}</span>
    </Action>
  );
}
export function TextInput(props: ComponentProps<'input'>) {
  return <input {...props} />;
}
export function PasswordField({
  shown,
  onToggleShown,
  showLabel,
  hideLabel,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & {
  shown: boolean;
  onToggleShown: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <div className="password-field">
      <TextInput {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        aria-label={shown ? hideLabel : showLabel}
        title={shown ? hideLabel : showLabel}
        aria-controls={props.id}
        aria-pressed={shown}
        disabled={props.disabled}
        onClick={onToggleShown}
      >
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  );
}
export function TextArea({
  className = '',
  ...props
}: ComponentProps<'textarea'>) {
  return <textarea {...props} className={'ds-textarea ' + className} />;
}
export function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ds-field">
      <label dir="auto" htmlFor={id}>
        {label}
      </label>
      {children}
      {help && (
        <p dir="auto" id={id + '-help'}>
          {help}
        </p>
      )}
      {error && (
        <p
          dir="auto"
          id={id + '-error'}
          className="ds-field-error"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
export function NativeSelect(props: ComponentProps<'select'>) {
  return <select {...props} />;
}
export function CheckControl({
  className = '',
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { type?: 'checkbox' | 'radio' }) {
  return (
    <input type="checkbox" {...props} className={'ds-check ' + className} />
  );
}
const symbols: Record<FeedbackKind, string> = {
  info: 'ⓘ',
  success: '✓',
  warning: '!',
  danger: '×',
  pending: '…',
  unavailable: '-',
};
export function StatusLabel({
  kind,
  children,
}: {
  kind: FeedbackKind;
  children: ReactNode;
}) {
  return (
    <span className="ds-status" data-kind={kind}>
      <span aria-hidden="true">{symbols[kind]}</span>
      <bdi dir="auto">{children}</bdi>
    </span>
  );
}
export function StatusMessage({
  kind,
  children,
}: {
  kind: FeedbackKind;
  children: ReactNode;
}) {
  return (
    <div
      role={kind === 'danger' ? 'alert' : 'status'}
      className="ds-message"
      data-kind={kind}
    >
      <StatusLabel kind={kind}>{children}</StatusLabel>
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="ds-empty">
      <h2 dir="auto">{title}</h2>
      {children && <p dir="auto">{children}</p>}
      {action}
    </section>
  );
}
export function Panel({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ds-panel">
      {title && <h2 dir="auto">{title}</h2>}
      {children}
    </section>
  );
}
export function AvatarFallback({ name }: { name: string }) {
  return (
    <span className="ds-avatar" role="img" aria-label={name}>
      {name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}
export function Brand({
  compact = false,
  href,
  label = 'Capstone Repository',
}: {
  compact?: boolean;
  href?: string;
  label?: string;
}) {
  const img = (
    <BrandLogo label={label} compact={compact} className="ds-brand" />
  );
  return href ? <a href={href}>{img}</a> : img;
}
export function BackLink(props: ComponentProps<'a'>) {
  return <a {...props} className={'ds-back ' + (props.className ?? '')} />;
}
export function Breadcrumb({
  label,
  items,
}: {
  label: string;
  items: ReadonlyArray<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label={label} dir="ltr">
      <ol className="ds-breadcrumb">
        {items.map((item, i) => (
          <li key={i}>
            {item.href ? (
              <a href={item.href}>{item.label}</a>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
            {i < items.length - 1 && <span aria-hidden="true"> / </span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function ReaderChrome({
  title,
  tree,
  toolbar,
  children,
}: {
  title: string;
  tree: ReactNode;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ds-reader" aria-label={title}>
      <aside>{tree}</aside>
      <div>
        <header className="reader-toolbar">
          <h2 dir="auto" className="ds-reader-title">
            {title}
          </h2>
          {toolbar}
        </header>
        <div className="ds-original" dir="auto">
          {children}
        </div>
      </div>
    </section>
  );
}
export function UnavailablePreview({
  title,
  message,
  original,
}: {
  title: string;
  message: string;
  original?: ReactNode;
}) {
  return (
    <EmptyState title={title} action={original}>
      {message}
    </EmptyState>
  );
}
