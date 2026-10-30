'use client';
import { CatalogueSort } from '../public-adoption/sort-select';
import {
  useEffect,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  parseDiscovery,
  discoveryUrl,
  type DiscoveryInput,
  type DiscoveryResult,
} from '@capstone/domain';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  Popover,
  PopoverTrigger,
  PopoverContent,
  ListFilter,
  ChevronDown,
  X,
} from '@capstone/ui/workspace-v2';
import { AnimatePresence, m, LazyMotion, MotionConfig } from 'motion/react';
import { ArchiveSearch } from './search';
import { domainLabel, type Locale } from './core';
const features = () => import('motion/react').then((x) => x.domMax),
  fields = [
    'university',
    'department',
    'academicYear',
    'domain',
    'author',
    'supervisor',
  ] as const;
type Field = (typeof fields)[number];
type Option = { value: string; label: string };
type View = Omit<DiscoveryResult, 'items'>;
function Facet({
  label,
  options,
  value,
  change,
  locale,
}: {
  label: string;
  options: Option[];
  value: string;
  change: (value: string) => void;
  locale: Locale;
}) {
  const t = useTranslations('Archive'),
    id = useId(),
    [open, setOpen] = useState(false),
    [search, setSearch] = useState('');
  if (options.length < 8)
    return (
      <label dir="auto" className="lra-facet">
        <span>{label}</span>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">{t('filters.all')}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  const shown = options.filter((o) =>
    o.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <div className="lra-facet">
      <span id={id}>{label}</span>
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          setSearch('');
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={id + '-list'}
            aria-labelledby={id}
          >
            {options.find((o) => o.value === value)?.label ?? t('filters.all')}
            <ChevronDown />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="lra lra-choice-popover"
          lang={locale}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <input
            className="lra-input"
            aria-label={t('filters.findOption')}
            placeholder={t('filters.findOption')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.currentTarget.parentElement
                  ?.querySelector<HTMLElement>('[role=option]')
                  ?.focus();
              }
            }}
          />
          <div
            id={id + '-list'}
            role="listbox"
            aria-label={label}
            onKeyDown={(e) => {
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const options = [
                    ...e.currentTarget.querySelectorAll<HTMLElement>(
                      '[role=option]',
                    ),
                  ],
                  index = options.indexOf(
                    document.activeElement as HTMLElement,
                  );
                options[
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? options.length - 1
                      : (index +
                          (e.key === 'ArrowDown' ? 1 : -1) +
                          options.length) %
                        options.length
                ]?.focus();
              }
            }}
          >
            {[{ value: '', label: t('filters.all') }, ...shown].map((o) => (
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                key={o.value}
                onClick={() => {
                  change(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
            {!shown.length && <p dir="auto">{t('filters.noOptions')}</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
export function ArchiveCatalogue({
  locale,
  query,
  view,
  error,
  children,
}: {
  locale: Locale;
  query: string;
  view?: View | undefined;
  error?: boolean | undefined;
  children: ReactNode;
}) {
  const t = useTranslations('Archive'),
    router = useRouter(),
    [pending, start] = useTransition(),
    [open, setOpen] = useState(false);
  let input: DiscoveryInput;
  try {
    input = parseDiscovery(new URLSearchParams(query));
  } catch {
    input = parseDiscovery(new URLSearchParams());
  }
  const signature = JSON.stringify(input),
    [draft, setDraft] = useState(input);
  useEffect(
    () => setDraft(JSON.parse(signature) as DiscoveryInput),
    [signature],
  );
  const options: Record<Field, Option[]> = {
      university:
        view?.facets.universities.map((u) => ({
          value: u.nameEn,
          label: locale === 'ar' ? u.nameAr : u.nameEn,
        })) ?? [],
      department: ['CE', 'CS', 'IS'].map((value) => ({
        value,
        label: t('departments.' + value.toLowerCase()),
      })),
      academicYear:
        view?.facets.academicYears.map((value) => ({ value, label: value })) ??
        [],
      domain:
        view?.facets.domains.map((value) => ({
          value,
          label: domainLabel(value, locale),
        })) ?? [],
      author:
        view?.facets.authors.map((value) => ({ value, label: value })) ?? [],
      supervisor:
        view?.facets.supervisors.map((value) => ({ value, label: value })) ??
        [],
    },
    active = fields.filter((k) => input[k]),
    dirty = fields.some((k) => input[k] !== draft[k]),
    label = (k: Field) => t('filters.' + (k === 'academicYear' ? 'year' : k));
  function navigate(changes: Partial<DiscoveryInput>) {
    start(() =>
      router.push(
        discoveryUrl(locale, input, {
          ...changes,
          ...(changes.q === '' ? { sort: 'newest' as const } : {}),
          page: changes.page ?? 1,
        }),
      ),
    );
  }
  function clear() {
    navigate(Object.fromEntries(fields.map((k) => [k, ''])));
  }
  const total = view?.total ?? 0,
    pages = view ? Math.ceil(total / view.pageSize) : 0;
  return (
    <>
      <header className="lra-catalogue-masthead">
        <div>
          <h1 dir="auto">{t('catalogue.title')}</h1>
        </div>
        <p dir="auto">{t('catalogue.description')}</p>
      </header>
      <ArchiveSearch
        key={input.q}
        locale={locale}
        query={input.q}
        hidden={Object.fromEntries(
          Object.entries(input).map(([k, v]) => [k, String(v)]),
        )}
        submit={(q) => navigate({ q })}
      />
      <div className="lra-discover-bar">
        <p dir="auto" role="status">
          {pending
            ? t('search.loading')
            : error
              ? t('catalogue.failedTitle')
              : t('catalogue.results', { count: total })}
        </p>
        <div>
          <Sheet
            open={open}
            onOpenChange={(value) => {
              setOpen(value);
              if (!value) setDraft(input);
            }}
          >
            <SheetTrigger asChild>
              <button className="lra-refine">
                <ListFilter />
                {t('filters.title')}
                {active.length > 0 && <span>{active.length}</span>}
              </button>
            </SheetTrigger>
            <SheetContent
              className="lra lra-sheet lra-facets-sheet"
              lang={locale}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
              closeLabel={t('common.close')}
            >
              <SheetTitle>{t('filters.title')}</SheetTitle>
              <SheetDescription>
                {t('filters.count', { count: active.length })}
              </SheetDescription>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(
                    Object.fromEntries(fields.map((k) => [k, draft[k]])),
                  );
                  setOpen(false);
                }}
              >
                <div className="lra-facet-fields">
                  {fields.slice(0, 4).map((k) => (
                    <Facet
                      key={k}
                      locale={locale}
                      label={label(k)}
                      value={draft[k]}
                      options={options[k]}
                      change={(value) => setDraft({ ...draft, [k]: value })}
                    />
                  ))}
                  <details>
                    <summary>{t('filters.more')}</summary>
                    {fields.slice(4).map((k) => (
                      <Facet
                        key={k}
                        locale={locale}
                        label={label(k)}
                        value={draft[k]}
                        options={options[k]}
                        change={(value) => setDraft({ ...draft, [k]: value })}
                      />
                    ))}
                  </details>
                </div>
                <div className="lra-facet-footer">
                  {dirty && (
                    <p dir="auto" role="status">
                      {t('filters.pending')}
                    </p>
                  )}
                  <button
                    className="lra-solid-action"
                    disabled={pending}
                    type="submit"
                  >
                    {t('filters.apply')}
                  </button>
                  {active.length > 0 && (
                    <button
                      type="button"
                      className="lra-text-action"
                      onClick={() => {
                        clear();
                        setOpen(false);
                      }}
                    >
                      {t('filters.clear')}
                    </button>
                  )}
                  {dirty && (
                    <button
                      type="button"
                      className="lra-text-action"
                      onClick={() => setDraft(input)}
                    >
                      {t('filters.cancel')}
                    </button>
                  )}
                </div>
              </form>
            </SheetContent>
          </Sheet>
          <CatalogueSort
            locale={locale}
            value={input.sort ?? 'newest'}
            busy={pending}
            onChange={(value) =>
              navigate({ sort: value as 'newest' | 'highest' | 'popular' })
            }
          />
        </div>
      </div>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={features}>
          <m.div className="lra-refinements" layout>
            <AnimatePresence initial={false}>
              {active.map((k) => (
                <m.button
                  layout
                  key={k}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="lra-chip"
                  aria-label={t('filters.remove', {
                    label:
                      label(k) +
                      ': ' +
                      (options[k].find((o) => o.value === input[k])?.label ??
                        input[k]),
                  })}
                  onClick={() => navigate({ [k]: '' })}
                >
                  {label(k)}:{' '}
                  <bdi>
                    {options[k].find((o) => o.value === input[k])?.label ??
                      input[k]}
                  </bdi>
                  <X />
                </m.button>
              ))}
            </AnimatePresence>
          </m.div>
        </LazyMotion>
      </MotionConfig>
      <noscript>
        <details className="lra-static-facets">
          <summary>{t('filters.title')}</summary>
          <form action={`/${locale}/catalogue`}>
            <input type="hidden" name="q" value={input.q} />
            {fields.map((k) => (
              <label dir="auto" key={k}>
                {label(k)}
                <select name={k} defaultValue={input[k]}>
                  <option value="">{t('filters.all')}</option>
                  {options[k].map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button>{t('filters.apply')}</button>
          </form>
        </details>
      </noscript>
      <section className="lra-results" aria-busy={pending}>
        <h2 dir="auto" className="lra-sr">
          {t('home.collectionTitle')}
        </h2>
        {error ? (
          <div className="lra-state" role="alert">
            <h3 dir="auto">{t('catalogue.failedTitle')}</h3>
            <p dir="auto">{t('catalogue.failedText')}</p>
            <button
              className="lra-text-action"
              onClick={() => router.refresh()}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : total === 0 ? (
          <div className="lra-state">
            <span className="lra-state-rule" aria-hidden="true" />
            <h3 dir="auto">
              {view?.publicCount === 0
                ? t('home.emptyTitle')
                : t('catalogue.noMatchesTitle')}
            </h3>
            <p dir="auto">
              {input.q
                ? t('catalogue.noMatchesQuery', { query: input.q })
                : view?.publicCount === 0
                  ? t('home.emptyText')
                  : t('catalogue.noMatchesHelp')}
            </p>
            <div className="ui-action-row">
              {active.length > 0 && (
                <button className="lra-text-action" onClick={clear}>
                  {t('filters.clear')}
                </button>
              )}
              {input.q && (
                <button
                  className="lra-text-action"
                  onClick={() => navigate({ q: '' })}
                >
                  {t('search.clear')}
                </button>
              )}
            </div>
          </div>
        ) : (
          children
        )}
      </section>
      {pages > 1 && (
        <nav
          className="lra-pagination"
          aria-label={t('catalogue.page', { page: input.page })}
        >
          {input.page > 1 && (
            <a href={discoveryUrl(locale, input, { page: input.page - 1 })}>
              {t('catalogue.previous')}
            </a>
          )}
          <span>{t('catalogue.page', { page: input.page })}</span>
          {input.page < pages && (
            <a href={discoveryUrl(locale, input, { page: input.page + 1 })}>
              {t('catalogue.next')} →
            </a>
          )}
        </nav>
      )}
    </>
  );
}
