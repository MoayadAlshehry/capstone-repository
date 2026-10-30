'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
  Eye,
  EyeOff,
  Alert,
  AlertTitle,
  AlertDescription,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
} from '@capstone/ui/workspace-v2';
export type Locale = 'en' | 'ar';
export type PasswordPolicy = { minimum: number; maximum: number };
export const copy = (locale: Locale, en: string, ar: string) =>
  locale === 'ar' ? ar : en;
export const emailValid = (value: string) =>
  value.length <= 254 && /^\S+@\S+\.\S+$/.test(value.trim());
export function passwordValid(value: string, policy: PasswordPolicy) {
  return (
    Array.from(value).length >= policy.minimum &&
    Array.from(value).length <= policy.maximum
  );
}
export function PasswordControl({
  id,
  label,
  value,
  onChange,
  error,
  locale,
  newPassword = false,
  description,
  onBlur,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  locale: Locale;
  newPassword?: boolean;
  description?: string;
  onBlur?: () => void;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false),
    [preparedLocale, setPreparedLocale] = useState<Locale | null>(null);
  useEffect(() => {
    setShow(false);
    setPreparedLocale(locale);
  }, [locale]);
  const unavailable = disabled || preparedLocale !== locale;
  return (
    <Field data-invalid={!!error} className="as-field">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="as-input-group" dir="ltr">
        <InputGroupInput
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          maxLength={256}
          data-secret="true"
          aria-invalid={!!error}
          aria-describedby={
            [
              description ? id + '-hint' : '',
              error ? id + '-error' : '',
              newPassword ? 'password-guidance' : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
          disabled={unavailable}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            className="as-reveal"
            size="icon-sm"
            type="button"
            onClick={() => setShow(!show)}
            aria-label={copy(
              locale,
              `${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`,
              `${show ? 'إخفاء' : 'إظهار'} ${label}`,
            )}
            aria-controls={id}
            aria-pressed={show}
            disabled={unavailable}
          >
            {show ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description && (
        <FieldDescription id={id + '-hint'}>{description}</FieldDescription>
      )}
      {error && <FieldError id={id + '-error'}>{error}</FieldError>}
    </Field>
  );
}
export function ResultAlert({
  title,
  children,
  kind = 'info',
}: {
  title: string;
  children: ReactNode;
  kind?: 'info' | 'error' | 'success' | 'pending';
}) {
  const Icon =
    kind === 'success'
      ? CircleCheck
      : kind === 'pending'
        ? LoaderCircle
        : CircleAlert;
  return (
    <Alert
      className={'as-result as-result-' + kind}
      variant={kind === 'error' ? 'destructive' : 'default'}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
    >
      <Icon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
export function PasswordGuidance({
  locale,
  policy,
  value,
}: {
  locale: Locale;
  policy: PasswordPolicy;
  value: string;
}) {
  const n = Array.from(value).length,
    ready = passwordValid(value, policy),
    needed = Math.max(0, policy.minimum - n),
    excess = n - policy.maximum;
  return (
    <div className="as-password-guidance" id="password-guidance">
      <div className="as-password-check">
        <CircleCheck className={ready ? 'as-check-ready' : ''} />
        <span>
          {copy(
            locale,
            `${policy.minimum}–${policy.maximum} characters; spaces are welcome.`,
            `${policy.minimum}–${policy.maximum} حرفًا، ويمكن استخدام المسافات.`,
          )}
        </span>
      </div>
      <p dir="auto" aria-live="polite">
        {n > 0
          ? n > policy.maximum
            ? copy(
                locale,
                `Remove ${excess} ${excess === 1 ? 'character' : 'characters'} to meet the maximum length.`,
                excess === 1
                  ? 'احذف حرفًا واحدًا للالتزام بالحد الأقصى للطول.'
                  : excess === 2
                    ? 'احذف حرفين للالتزام بالحد الأقصى للطول.'
                    : `احذف ${excess} ${excess <= 10 ? 'أحرف' : 'حرفًا'} للالتزام بالحد الأقصى للطول.`,
              )
            : ready
              ? copy(
                  locale,
                  'Minimum length met. Choose a unique password.',
                  'تحقق الحد الأدنى للطول. اختر كلمة مرور فريدة.',
                )
              : copy(
                  locale,
                  `${needed} more ${needed === 1 ? 'character' : 'characters'} needed.`,
                  needed === 1
                    ? 'يلزم حرف إضافي واحد.'
                    : needed === 2
                      ? 'يلزم حرفان إضافيان.'
                      : `يلزم ${needed} ${needed <= 10 ? 'أحرف إضافية' : 'حرفًا إضافيًا'}.`,
                )
          : copy(
              locale,
              'A memorable passphrase or a password manager works well.',
              'يمكن استخدام عبارة سهلة التذكر أو مدير كلمات المرور.',
            )}
      </p>
    </div>
  );
}
