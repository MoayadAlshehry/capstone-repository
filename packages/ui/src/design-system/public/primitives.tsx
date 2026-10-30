'use client';
import { BidiData, BidiLabel } from '../../bidi.js';
import { BidiFact, BidiFacts } from '../../bidi.js';
import { BidiValue } from '../../bidi.js';
import { BrandLogo } from '../../brand-logo.js';
import { formatScore } from '../../score-format.js';
import { useLayoutEffect } from 'react';
import { createCatalogueMorph } from './catalogue-flip.js';
import { AuthorCredit } from './authors.js';
import { useState, useEffect, useRef, useId, type ReactNode } from 'react';
import { Fade, useReducedMotion } from './native-motion.js';
import { Action, TextInput, PasswordField } from '../presentation.js';
import { flushSync } from 'react-dom';
import { reviewCount } from './counts.js';
import {
  useSite,
  facetKeys,
  facetLabel,
  type Project,
  type Catalogue,
  type Facet,
} from './model.js';
export function Logo() {
  const { href } = useSite();
  return (
    <a href={href('home')} className="logo">
      <BrandLogo label="Capstone Repository" />
    </a>
  );
}
export function Arrow() {
  return (
    <span className="arrow" aria-hidden="true">
      ↗
    </span>
  );
}
export function Cover({
  p,
  priority = false,
}: {
  p: Project;
  priority?: boolean;
}) {
  const { cover, t, integration } = useSite();
  const [failedSource, B] = useState<string | null>(null),
    source = cover(p);
  if (integration?.media) return integration.media(p, priority);
  return failedSource === source ? (
    <div className="cover-fallback">
      <span>{p.title}</span>
      <small>{t('Cover unavailable')}</small>
    </div>
  ) : (
    <img
      className="cover"
      key={source}
      src={source}
      alt={p.title}
      width="1600"
      height="1000"
      loading={priority ? 'eager' : 'lazy'}
      onError={() => B(source)}
    />
  );
}
export function Search({ state }: { state?: Catalogue }) {
  const { t, href, navigate, integration } = useSite();
  const [q, Q] = useState(state?.query || ''),
    input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const actual = input.current?.value;
    if (actual && actual !== (integration?.searchValue ?? q)) {
      Q(actual);
      integration?.onSearchValue?.(actual);
    }
  }, []);
  useEffect(() => {
    if (state) Q(state.query);
  }, [state?.query]);
  return (
    <>
      <form
        className="search"
        action={href('catalogue')}
        method="get"
        data-ui="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const submitted = String(
            new FormData(e.currentTarget).get('q') ?? '',
          );
          if (state) {
            state.update({ q: submitted });
            requestAnimationFrame(() =>
              document.getElementById('results-heading')?.focus(),
            );
          } else navigate(href('catalogue', undefined, { q: submitted }));
        }}
      >
        {integration?.nativeQuery?.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <label dir="auto" htmlFor="project-search">
          {t('searchLabel')}
        </label>
        <div>
          <TextInput
            ref={input}
            id="project-search"
            type="search"
            name="q"
            placeholder={t('searchPlaceholder')}
            value={integration?.searchValue ?? q}
            onChange={(e) => {
              Q(e.target.value);
              integration?.onSearchValue?.(e.target.value);
            }}
          />
          <button className="button" data-ui="primary-action" type="submit">
            {t('search')} <Arrow />
          </button>
        </div>
      </form>
      {integration?.aiDiscovery}
    </>
  );
}
export function Browse() {
  const { t, href } = useSite();
  return (
    <a className="browse" href={href('catalogue')}>
      {t('browseAll')} <Arrow />
    </a>
  );
}
export function Open({ p: supplied }: { p?: Project }) {
  const { t, href } = useSite();
  const p = supplied ?? useSite().flagship;
  if (!p) return null;
  return (
    <a
      className="button open-project"
      data-ui="project-action"
      href={href('project', p.id)}
    >
      {t('openProject')} <Arrow />
    </a>
  );
}
export function Score({ p: supplied }: { p?: Project }) {
  const { t, ar, eligible, l } = useSite();
  const p = supplied ?? useSite().flagship;
  if (!p) return null;
  return (
    <div className="score" data-ui="assessment" dir={ar ? 'rtl' : 'ltr'}>
      <span>{t('independentAssessment')}</span>
      {p.independentAssessment.unavailable ? (
        <span>{l('Assessment unavailable', 'التقييم غير متاح')}</span>
      ) : eligible(p) ? (
        <div>
          <strong dir="ltr">
            {formatScore(p.independentAssessment.score, ar ? 'ar' : 'en')}
            <small>/100</small>
          </strong>
          <span>
            {reviewCount(p.independentAssessment.completedReviews, ar)}
          </span>
        </div>
      ) : (
        <span className="assessment-pending">
          {t(
            p.independentAssessment.completedReviews
              ? 'incompleteAssessment'
              : 'noIndependentAssessment',
          )}
          {p.independentAssessment.completedReviews > 0 && (
            <small className="incomplete-count">
              {reviewCount(p.independentAssessment.completedReviews, ar)}
            </small>
          )}
        </span>
      )}
    </div>
  );
}
export function Byline({
  p: supplied,
  all = false,
}: {
  p?: Project;
  all?: boolean;
}) {
  const p = supplied ?? useSite().flagship;
  if (!p) return null;
  return <AuthorCredit p={p} all={all} />;
}
export function RankingInfo() {
  const { t, rankingExplanation } = useSite();
  return (
    <details className="ranking-info">
      <summary>{t('assessmentInfo')}</summary>
      <p dir="auto">{rankingExplanation}</p>
    </details>
  );
}
export function SectionHead({ kind = 'rank' }: { kind?: string }) {
  const { t, rankingHref, integration } = useSite();
  return (
    <header className="section-head">
      <h2 dir="auto">
        {t(
          kind === 'rank'
            ? 'moreHighlyRated'
            : kind === 'people'
              ? 'Meet the creators'
              : 'Why this platform',
        )}
      </h2>
      {kind === 'rank' && !integration?.hideRankingLink && (
        <a href={rankingHref}>
          {t('viewRanking')} <Arrow />
        </a>
      )}
    </header>
  );
}
export function Topics({ p: supplied }: { p?: Project }) {
  const { href, t, integration } = useSite();
  const p = supplied ?? useSite().flagship;
  if (!p) return null;
  return (
    <div className="topic-links">
      {p.topics.map((v) => (
        <a href={href('catalogue', undefined, { topic: v })} key={v}>
          {integration?.literalMetadata ? v : t(v)} <Arrow />
        </a>
      ))}
    </div>
  );
}
export function Modal({
  title,
  close,
  children,
  className = '',
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  const { t } = useSite();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      opener?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className={className}
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 dir="auto" id={id}>
          {title}
        </h2>
        <button type="button" onClick={close}>
          {t('close')} ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function QuickFilters({
  s,
  keys = ['domain', 'university'],
}: {
  s: Catalogue;
  keys?: Facet[];
}) {
  const { t } = useSite();
  return (
    <div className="quick-filters">
      {keys.map((k) => (
        <label dir="auto" key={k}>
          {t(facetLabel[k])}
          <select
            value={s.values[k]}
            onChange={(e) => s.update({ [k]: e.target.value })}
          >
            <option value="">{t('All')}</option>
            {s.options(k).map((v) => (
              <option key={v} value={v}>
                {t(v)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
export function QuickChips({
  s,
  facet = 'department',
}: {
  s: Catalogue;
  facet?: Facet;
}) {
  const { t } = useSite();
  return (
    <div className="quick-chips" role="group" aria-label={t(facetLabel[facet])}>
      <span>{t(facetLabel[facet])}</span>
      <button
        aria-pressed={!s.values[facet]}
        onClick={() => s.update({ [facet]: '' })}
      >
        {t('All')}
      </button>
      {s
        .options(facet)
        .slice(0, 4)
        .map((v) => (
          <button
            key={v}
            aria-pressed={s.values[facet] === v}
            onClick={() =>
              s.update({ [facet]: s.values[facet] === v ? '' : v })
            }
          >
            {s.optionLabel?.(facet, v) ?? t(v)}
          </button>
        ))}
    </div>
  );
}
export function Filters({
  s,
  inline = false,
}: {
  s: Catalogue;
  inline?: boolean;
}) {
  const { t, l, integration } = useSite();
  const [open, O] = useState(false),
    [draft, D] = useState(s.selections),
    [find, F] = useState(''),
    [personKeys, K] = useState(
      s.publicPersonKeys ?? { author: '', supervisor: '' },
    ),
    [peopleReset, ResetPeople] = useState(0),
    [dependencyNotice, Notice] = useState('');
  const opener = useRef<HTMLButtonElement>(null);
  const closeFilters = () => {
    O(false);
    requestAnimationFrame(() =>
      opener.current?.focus({ preventScroll: !integration?.personFacet }),
    );
  };
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const q = matchMedia('(min-width: 761px)');
    const f = () => setWide(q.matches);
    f();
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, []);
  const form = (
    <form
      className="advanced-form"
      onSubmit={(e) => {
        e.preventDefault();
        s.update({
          ...draft,
          ...(integration?.personFacet
            ? {
                authorKey: personKeys.author,
                supervisorKey: personKeys.supervisor,
              }
            : {}),
        });
        closeFilters();
      }}
    >
      <label dir="auto">
        {t('Search options')}
        <TextInput
          type="search"
          value={find}
          onChange={(e) => F(e.target.value)}
        />
      </label>
      <div className="advanced-fields">
        {(integration?.facets ?? facetKeys).map((k) => (
          <fieldset
            key={
              integration?.personFacet && ['author', 'supervisor'].includes(k)
                ? JSON.stringify([
                    k,
                    draft.university,
                    draft.department,
                    peopleReset,
                  ])
                : k
            }
          >
            <legend dir="auto">{t(facetLabel[k])}</legend>
            {(k === 'author' || k === 'supervisor') && integration?.personFacet
              ? integration.personFacet(
                  k,
                  {
                    value: draft[k][0] ?? '',
                    key: personKeys[k],
                    university: draft.university[0] ?? '',
                    department: draft.department[0] ?? '',
                  },
                  (value, key) => {
                    D((v) => ({ ...v, [k]: value ? [value] : [] }));
                    K((v) => ({ ...v, [k]: key }));
                  },
                )
              : s
                  .options(k)
                  .filter(
                    (v) =>
                      !find ||
                      (s.optionLabel?.(k, v) ?? t(v))
                        .toLowerCase()
                        .includes(find.toLowerCase()) ||
                      draft[k].includes(v),
                  )
                  .map((v) => (
                    <label dir="auto" key={v}>
                      <TextInput
                        type="checkbox"
                        value={v}
                        checked={draft[k].includes(v)}
                        onChange={(e) => {
                          const next = {
                            ...draft,
                            [k]: e.target.checked
                              ? integration?.multiple === false
                                ? [v]
                                : [...draft[k], v]
                              : draft[k].filter((x) => x !== v),
                          };
                          if (
                            integration?.personFacet &&
                            ['university', 'department'].includes(k)
                          ) {
                            next.author = [];
                            next.supervisor = [];
                            K({ author: '', supervisor: '' });
                            if (
                              k === 'university' &&
                              next.department[0] &&
                              !integration
                                .departmentsForUniversity?.(
                                  next.university[0] ?? '',
                                )
                                .includes(next.department[0])
                            )
                              next.department = [];
                            Notice(
                              l(
                                'People filters were cleared for this academic context. Any unavailable department was also cleared.',
                                'مُسحت عوامل تصفية الأسماء لتطابق السياق الأكاديمي الجديد، وأُزيل القسم إن لم يعد متاحًا.',
                              ),
                            );
                          }
                          D(next);
                        }}
                      />
                      <span>{s.optionLabel?.(k, v) ?? t(v)}</span>
                    </label>
                  ))}
          </fieldset>
        ))}
      </div>
      {dependencyNotice && (
        <p dir="auto" role="status">
          {dependencyNotice}
        </p>
      )}
      <div className="dialog-actions">
        {integration?.personFacet && (
          <button
            type="button"
            onClick={() => {
              D({
                university: [],
                department: [],
                academicYear: [],
                domain: [],
                author: [],
                supervisor: [],
                topic: [],
              });
              K({ author: '', supervisor: '' });
              ResetPeople((v) => v + 1);
              F('');
              Notice(
                l(
                  'Filters cleared. Show results to apply.',
                  'مُسحت عوامل التصفية. اعرض النتائج لتطبيق التغيير.',
                ),
              );
            }}
          >
            {l('Clear filters', 'مسح عوامل التصفية')}
          </button>
        )}
        <button type="button" onClick={closeFilters}>
          {t('cancel')}
        </button>
        <button className="button">{t('apply')}</button>
      </div>
    </form>
  );
  return (
    <div
      className={'filter-entry ' + (inline ? 'inline-tray' : '')}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open && inline && wide) {
          e.preventDefault();
          closeFilters();
        }
      }}
    >
      <button
        type="button"
        ref={opener}
        className="secondary"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            closeFilters();
            return;
          }
          D(
            Object.fromEntries(
              facetKeys.map((k) => [k, [...s.selections[k]]]),
            ) as typeof draft,
          );
          F('');
          K(s.publicPersonKeys ?? { author: '', supervisor: '' });
          Notice('');
          O(true);
        }}
      >
        {t('moreFilters')}{' '}
        <bdi dir="ltr" className="facet-count">
          {s.active.filter(([k]) => k !== 'q').length || '+'}
        </bdi>
      </button>
      {open &&
        (inline && wide ? (
          <Fade className="filter-tray">{form}</Fade>
        ) : (
          <Modal title={t('filters')} close={closeFilters}>
            {form}
          </Modal>
        ))}
    </div>
  );
}
export function Chips({ s }: { s: Catalogue }) {
  const { t } = useSite();
  return (
    <div className="chips">
      {s.active.map(([k, v]) => (
        <button
          key={k + v}
          onClick={() => s.remove(k, v)}
          aria-label={t('Remove') + ' ' + (s.optionLabel?.(k, v) ?? t(v))}
        >
          {s.optionLabel?.(k, v) ?? t(v)} ×
        </button>
      ))}
      {s.active.length > 0 && (
        <button className="clear" onClick={s.clear}>
          {t('clearAll')}
        </button>
      )}
    </div>
  );
}
export function ResultCount({ s }: { s: Catalogue }) {
  const { integration } = useSite();
  return (
    <h2 dir="auto" id="results-heading" tabIndex={-1} aria-live="polite">
      {integration?.resultCount ?? s.label}
    </h2>
  );
}
export function SortControl({ s }: { s: Catalogue }) {
  const { t, l, integration } = useSite();
  if (integration?.sortControl) return integration.sortControl;
  return (
    <label dir="auto" className="sort-control">
      {t('sort')}
      <select
        value={s.sort}
        onChange={(e) => s.update({ sort: e.target.value })}
      >
        {(
          integration?.sortOptions ?? [
            ['highest', 'sortIndependent'],
            ['newest', 'newest'],
            ['title', 'sortTitle'],
          ]
        ).map(([v, k]) => (
          <option value={v} key={v}>
            {v === 'independent'
              ? l('Independent score', 'التقييم المستقل')
              : t(k!)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ViewControl({ s }: { s: Catalogue }) {
  const { t, l } = useSite();
  const owner = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion(),
    coordinator = useRef<ReturnType<typeof createCatalogueMorph> | null>(null);
  if (!coordinator.current)
    coordinator.current = createCatalogueMorph(
      () => owner.current?.closest('[data-cr-ds]') ?? document,
    );
  useEffect(() => coordinator.current!.observeResize(), []);
  const select = (v: string, button?: HTMLButtonElement) => {
    button?.focus();
    if (s.view !== v)
      coordinator.current!.run(
        () => flushSync(() => s.update({ view: v })),
        !!reduced,
      );
  };
  return (
    <div
      ref={owner}
      className="view-switch"
      data-mode={s.view}
      role="radiogroup"
      aria-label={l('Result layout', 'تخطيط النتائج')}
      onKeyDown={(e) => {
        if (
          ![
            'ArrowRight',
            'ArrowDown',
            'ArrowLeft',
            'ArrowUp',
            'Home',
            'End',
          ].includes(e.key)
        )
          return;
        e.preventDefault();
        const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
          ],
          current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          ),
          next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : (current + 1) % 2;
        select(next ? 'list' : 'grid', buttons[next]);
      }}
    >
      <span className="mode-tracker" aria-hidden="true" />
      {['grid', 'list'].map((v) => (
        <button
          type="button"
          key={v}
          role="radio"
          aria-checked={s.view === v}
          tabIndex={s.view === v ? 0 : -1}
          onClick={(e) => select(v, e.currentTarget)}
        >
          <span aria-hidden="true">{v === 'grid' ? '▦' : '☷'}</span>{' '}
          {t(v === 'grid' ? 'grid' : 'list')}
        </button>
      ))}
    </div>
  );
}
export function Tools({ s }: { s: Catalogue }) {
  return (
    <div className="tools">
      <ResultCount s={s} />
      <div className="pav-display-controls" dir="ltr">
        <SortControl s={s} />
        <ViewControl s={s} />
      </div>
    </div>
  );
}
export function FacetRail({ s }: { s: Catalogue }) {
  const { t } = useSite();
  return (
    <aside className="facet-rail" data-ui="filter-panel">
      <h2 dir="auto">{t('filters')}</h2>
      {(['university', 'department', 'academicYear', 'domain'] as Facet[]).map(
        (k) => (
          <fieldset key={k}>
            <legend dir="auto">{t(facetLabel[k])}</legend>
            {s.options(k).map((v) => (
              <label dir="auto" key={v}>
                <TextInput
                  type="checkbox"
                  checked={s.selections[k].includes(v)}
                  onChange={(e) =>
                    s.update({
                      [k]: e.target.checked
                        ? [...s.selections[k], v]
                        : s.selections[k].filter((x) => x !== v),
                    })
                  }
                />
                <span>{t(v)}</span>
              </label>
            ))}
          </fieldset>
        ),
      )}
      <button type="button" onClick={s.clear}>
        {t('clearAll')}
      </button>
      <Filters s={s} />
    </aside>
  );
}

export function Empty({ s }: { s: Catalogue }) {
  const { t } = useSite();
  return (
    <div className="empty" role="status">
      <h2 dir="auto">{t('noResults')}</h2>
      <p dir="auto">{t('noResultsHelp')}</p>
      <button className="button" onClick={s.clear}>
        {t('clearAll')}
      </button>
    </div>
  );
}
export function Pagination({ s }: { s: Catalogue }) {
  const { t, l } = useSite();
  const unavailable = s.page < 1 || s.page > s.pages;
  return s.pages > 1 || unavailable ? (
    <nav className="pagination" aria-label={t('catalogue')}>
      <button
        disabled={s.page <= 1}
        onClick={() => {
          s.update({
            page: String(Math.min(s.pages, Math.max(1, s.page - 1))),
          });
          document.getElementById('results-heading')?.scrollIntoView();
        }}
      >
        {t('Previous')}
      </button>
      <span dir={unavailable ? 'auto' : 'ltr'} role="status">
        {unavailable
          ? l('Page unavailable', 'الصفحة غير متاحة')
          : `${s.page} / ${s.pages}`}
      </span>
      <button
        disabled={s.page >= s.pages}
        onClick={() => {
          s.update({
            page: String(Math.min(s.pages, Math.max(1, s.page + 1))),
          });
          document.getElementById('results-heading')?.scrollIntoView();
        }}
      >
        {t('Next')}
      </button>
    </nav>
  ) : null;
}
export function Facts({ p }: { p: Project }) {
  const { t, ar, l, integration } = useSite();
  const date = new Date(p.publicationDate),
    missing = l('Not recorded', 'غير مسجَّل');
  return (
    <BidiFacts className="facts" dir="ltr">
      {[
        ['University', p.university],
        ['Department', t(p.department)],
        ['Academic year', p.academicYear],
        ['Domain', t(p.domain)],
        [
          'Publication date',
          integration?.publicationLabel ??
            (Number.isFinite(date.getTime())
              ? new Intl.DateTimeFormat(ar ? 'ar' : 'en', {
                  dateStyle: 'medium',
                }).format(date)
              : missing),
        ],
      ].map(([k, v]) => (
        <BidiFact key={k} dir={ar ? 'rtl' : 'ltr'}>
          <BidiLabel dir="auto">{t(k!)}</BidiLabel>
          <BidiData dir="auto">
            <BidiValue
              kind={
                k === 'Academic year'
                  ? 'range'
                  : k === 'Publication date'
                    ? 'date'
                    : 'text'
              }
            >
              {k === 'Publication date' && v
                ? v.replace(/[\u200e\u200f\u061c]/g, '')
                : v || missing}
            </BidiValue>
          </BidiData>
        </BidiFact>
      ))}
    </BidiFacts>
  );
}
export function Overview({ p }: { p: Project }) {
  const { t, summary, l, integration, ar } = useSite();
  return (
    <section id="overview" className="overview">
      <span className="eyebrow">{t('overview')}</span>
      <h2 dir="auto">
        {integration?.literalMetadata
          ? l('Project abstract', 'ملخص المشروع')
          : t('About the project')}
      </h2>
      {!integration?.literalMetadata && (
        <>
          <p dir="auto" className="short-overview">
            {summary(p)}
          </p>
          <h3 dir="auto">{t('Full abstract')}</h3>
        </>
      )}
      {integration?.aiOverview}
      <small dir={ar ? 'rtl' : 'ltr'}>
        {integration?.sourceLabel ?? t('Source text · English')}
      </small>
      <p
        id="original-abstract"
        className="abstract"
        dir={integration ? 'auto' : 'ltr'}
        lang={integration ? undefined : 'en'}
      >
        {p.abstract ||
          l(
            'No source abstract is recorded for this public record.',
            'لا يتوفر ملخص أصلي في هذا السجل العام.',
          )}
      </p>
      <Topics p={p} />
    </section>
  );
}
export function People({ p }: { p: Project }) {
  const { t, href, l } = useSite();
  return (
    <section id="people" className="people">
      <h2 dir="auto">{t('people')}</h2>
      {p.authors.length ? (
        <Byline p={p} all />
      ) : (
        <p dir="auto">
          {l(
            'Creator details are not recorded.',
            'تفاصيل المؤلفين غير مسجَّلة.',
          )}
        </p>
      )}
      <BidiFacts className="supervisor">
        <BidiFact>
          <BidiLabel>{t('Supervisor')}</BidiLabel>
          <BidiData>
            {p.supervisor ? (
              <a
                href={href('catalogue', undefined, {
                  supervisor: p.supervisor,
                })}
              >
                <BidiValue>{p.supervisor}</BidiValue>
              </a>
            ) : (
              l('Not recorded', 'غير مسجَّل')
            )}
          </BidiData>
        </BidiFact>
      </BidiFacts>
    </section>
  );
}
export function Assessments({ p }: { p: Project }) {
  const { t, l, ar } = useSite();
  return (
    <section id="assessments" className="assessments">
      <h2 dir="auto">{t('assessments')}</h2>
      <div className="assessment-pair">
        <article dir={ar ? 'rtl' : 'ltr'}>
          <span>{t('internalAssessment')}</span>
          {p.internalAssessment.unavailable ? (
            <span>{l('Assessment unavailable', 'التقييم غير متاح')}</span>
          ) : typeof p.internalAssessment.score === 'number' &&
            Number.isFinite(p.internalAssessment.score) ? (
            <strong dir="ltr">
              {formatScore(p.internalAssessment.score, ar ? 'ar' : 'en')}
              <small>/100</small>
            </strong>
          ) : (
            <span>{l('Not assessed', 'لم يُقيَّم')}</span>
          )}
        </article>
        <Score p={p} />
      </div>
      <p dir="auto">{t('assessmentDisclaimer')}</p>
      <RankingInfo />
    </section>
  );
}
export function Rights({ p }: { p: Project }) {
  const { t, l } = useSite();
  return (
    <>
      {p.rights.uploadedLicense && (
        <section
          className="uploaded-license"
          aria-label={l('Uploaded LICENSE', 'ملف LICENSE المرفوع')}
        >
          <h2 dir="auto">{l('Uploaded LICENSE', 'ملف LICENSE المرفوع')}</h2>
          <p dir="auto">
            <bdi dir="ltr">{p.rights.uploadedLicense.path}</bdi>
          </p>
          <a href={p.rights.uploadedLicense.href} className="button secondary">
            {l('Download the uploaded original', 'تنزيل الأصل المرفوع')}
          </a>
        </section>
      )}
      <section id="rights" className="rights">
        <div>
          <span className="eyebrow">{t('rights')}</span>
          <h2 dir="auto">
            {l('Respect the authors’ rights', 'احترم حقوق المؤلفين')}
          </h2>
          <p dir="auto">{t('copyrightNote')}</p>
        </div>
        <p dir="auto">{t('restrictedExplanation')}</p>
      </section>
    </>
  );
}
export function SectionNav({
  items = ['overview', 'people', 'files', 'assessments', 'rights'],
}: { items?: string[] } = {}) {
  const { t } = useSite();
  const [active, A] = useState('overview');
  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) A(e.target.id);
      },
      { rootMargin: '-15% 0px -65% 0px' },
    );
    for (const id of items) {
      const e = document.getElementById(id);
      if (e) obs.observe(e);
    }
    return () => obs.disconnect();
  }, []);
  return (
    <nav className="section-nav" aria-label={t('About the project')}>
      {items.map((k) => (
        <a
          key={k}
          href={'#' + k}
          aria-current={active === k ? 'location' : undefined}
        >
          {t(k)}
        </a>
      ))}
    </nav>
  );
}
export function ProjectActions() {
  const { t, project: p, currentUrl, integration, l } = useSite();
  const [notice, N] = useState('');
  return (
    <div className="project-actions">
      {integration?.filesPending ? (
        <button className="button" disabled>
          {l('Loading public files…', 'جارٍ تحميل الملفات العامة…')}
        </button>
      ) : (
        <a
          data-ui="primary-action"
          className="button"
          href={p?.publicFiles.length ? '#files' : '#overview'}
        >
          {t(p?.publicFiles.length ? 'readFiles' : 'Overview')} ↓
        </a>
      )}
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(currentUrl);
            N(t('linkCopied'));
          } catch {
            N(t('Copy unavailable. Select this link:') + ' ' + currentUrl);
          }
        }}
      >
        {t('Copy project link')}
      </button>
      <span role="status">{notice}</span>
    </div>
  );
}

export function Back() {
  const { back, t } = useSite();
  return (
    <a className="back" href={back()}>
      <span className="back-arrow" aria-hidden="true">
        ←
      </span>{' '}
      {t('Back to results')}
    </a>
  );
}
export function LoginFields() {
  const { t, href, submitLogin, submitRecovery } = useSite();
  const [email, Email] = useState(''),
    [password, Password] = useState(''),
    [show, S] = useState(false),
    [busy, B] = useState(false),
    [errors, E] = useState({ email: '', password: '' }),
    [notice, N] = useState(''),
    [recover, R] = useState(false),
    [done, D] = useState('');
  return (
    <>
      <form
        className="login-form"
        data-ui="sign-in-form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const next = {
            email: !email
              ? t('emailRequired')
              : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                ? t('emailInvalid')
                : '',
            password: password ? '' : t('passwordRequired'),
          };
          E(next);
          N('');
          if (next.email || next.password) {
            e.currentTarget
              .querySelector<HTMLInputElement>(
                next.email ? '#email' : '#password',
              )
              ?.focus();
            return;
          }
          B(true);
          try {
            N(await submitLogin({ email, password }));
            Password('');
            S(false);
          } catch (error) {
            N(error instanceof Error ? error.message : t('error'));
          } finally {
            B(false);
          }
        }}
      >
        <label dir="auto" htmlFor="email">
          {t('email')}
        </label>
        <TextInput
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => Email(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          placeholder="you@example.test"
        />
        {errors.email && (
          <p dir="auto" id="email-error" className="error">
            {errors.email}
          </p>
        )}
        <label dir="auto" htmlFor="password">
          {t('password')}
        </label>
        <PasswordField
          shown={show}
          onToggleShown={() => S(!show)}
          showLabel={t('show')}
          hideLabel={t('hide')}
          id="password"
          name="password"
          dir="ltr"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => Password(e.target.value)}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
        />
        {errors.password && (
          <p dir="auto" id="password-error" className="error">
            {errors.password}
          </p>
        )}
        <button type="button" className="recovery-link" onClick={() => R(true)}>
          {t('forgot')}
        </button>
        <Action
          type="submit"
          className="button submit-login"
          data-ui="primary-action"
          disabled={busy}
        >
          {t(busy ? 'Checking form…' : 'signIn')} <Arrow />
        </Action>
        <p dir="auto" role="status" className="login-status">
          {notice}
        </p>
        <small>{t('demoNotice')}</small>
        <a href={href('catalogue')}>
          {t('returnDiscovery')} <Arrow />
        </a>
      </form>
      {recover && (
        <Modal
          title={t('forgot')}
          close={() => {
            R(false);
            D('');
          }}
        >
          <form
            className="recovery-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const email =
                new FormData(e.currentTarget)
                  .get('recovery-email')
                  ?.toString() ?? '';
              D(await submitRecovery(email));
            }}
          >
            <label dir="auto">
              {t('email')}
              <TextInput
                name="recovery-email"
                type="email"
                required
                autoComplete="email"
              />
            </label>
            <button className="button">{t('Reset')}</button>
            <p dir="auto" role="status">
              {done || t('demoNotice')}
            </p>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Nav() {
  const { href, t, ar, page, localeHref, integration } = useSite();
  const [open, O] = useState(false),
    [, R] = useState(0);
  useEffect(() => {
    const f = () => R((x) => x + 1);
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, []);
  return (
    <div className="nav-cluster">
      <a className="locale" href={localeHref} lang={ar ? 'en' : 'ar'}>
        {ar ? 'English' : 'العربية'}
      </a>
      <button
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="primary-nav"
        onClick={() => O(!open)}
      >
        {t('Menu')} ☰
      </button>
      <nav
        id="primary-nav"
        className={open ? 'menu-open' : ''}
        aria-label={t('Menu')}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            O(false);
            document.querySelector<HTMLButtonElement>('.menu-toggle')?.focus();
          }
        }}
      >
        <a
          href={href('home')}
          aria-current={page === 'home' ? 'page' : undefined}
        >
          {t('home')}
        </a>
        <a
          href={href('catalogue')}
          aria-current={page === 'catalogue' ? 'page' : undefined}
        >
          {t('catalogue')}
        </a>
        {page !== 'login' && (
          <a className="button" href={integration?.entryHref ?? href('login')}>
            {integration?.entryLabel ?? t('signIn')} <Arrow />
          </a>
        )}
      </nav>
    </div>
  );
}
export function FooterLinks() {
  const { t, href, integration } = useSite();
  return (
    <>
      <a href={href('catalogue')}>{t('catalogue')}</a>
      <a href={integration?.entryHref ?? href('login')}>
        {integration?.entryLabel ?? t('signIn')}
      </a>
    </>
  );
}
export function FictionalNotice() {
  const { previewNotice } = useSite();
  return previewNotice ? (
    <details className="development-note">
      <summary>{previewNotice.title}</summary>
      <div>
        <p dir="auto">{previewNotice.body}</p>
        <a href={previewNotice.linkHref}>{previewNotice.linkLabel}</a>
      </div>
    </details>
  ) : null;
}
