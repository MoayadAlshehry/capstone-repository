'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
export function ShareLink({ path, label }: { path: string; label: string }) {
  const t = useTranslations('Archive'),
    [message, setMessage] = useState(''),
    [fallback, setFallback] = useState('');
  useEffect(() => {
    setMessage('');
    setFallback('');
  }, [path]);
  return (
    <span className="lra-share">
      <button
        className="lra-text-action"
        onClick={async () => {
          const url = location.origin + path;
          try {
            await navigator.clipboard.writeText(url);
            setMessage(t('common.copied'));
            setFallback('');
          } catch {
            setMessage(t('common.copyFailed'));
            setFallback(url);
          }
        }}
      >
        {label}
        <span aria-hidden="true">↗</span>
      </button>
      <span role="status">{message}</span>
      {fallback && (
        <input
          className="lra-input"
          readOnly
          value={fallback}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </span>
  );
}
