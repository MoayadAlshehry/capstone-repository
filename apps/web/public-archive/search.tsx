'use client';
import { useTranslations } from 'next-intl';
import type { Locale } from './core';
export function ArchiveSearch({
  locale,
  query = '',
  hidden = {},
  submit,
}: {
  locale: Locale;
  query?: string;
  hidden?: Record<string, string>;
  submit?: (value: string) => void;
}) {
  const t = useTranslations('Archive');
  return (
    <form
      className="lra-search"
      role="search"
      action={`/${locale}/catalogue`}
      onSubmit={(event) => {
        if (submit) {
          event.preventDefault();
          submit(String(new FormData(event.currentTarget).get('q') ?? ''));
        }
      }}
    >
      <label dir="auto" htmlFor="archive-search">
        {t('search.label')}
      </label>
      {Object.entries(hidden)
        .filter(([key, value]) => value && key !== 'q' && key !== 'page')
        .map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
      <div className="lra-search-line">
        <input
          id="archive-search"
          name="q"
          type="search"
          maxLength={200}
          defaultValue={query}
          dir="auto"
          placeholder={
            locale === 'ar'
              ? 'ما الذي يثير فضولك؟'
              : 'What are you curious about?'
          }
        />
        <button type="submit">
          {t('search.submit')} <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  );
}
