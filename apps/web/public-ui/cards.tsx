'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Search as SearchIcon,
  Sparkles,
  LoaderCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AIBeta } from '@/components/ui/ai-beta';
import { searchSuggestions } from './search-copy';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { useSite, type Project, type Catalogue } from './model';
import { formatScore } from '../../../packages/ui/src/score-format';
import { reviewCount } from '../../../packages/ui/src/design-system/public/counts';
import { usePublicPortal } from './scope';
import {
  SearchLane,
  useCancelSearch,
  useSearchPresentation,
} from '../ai/search-client';
export function PublicSearch({ state }: { state?: Catalogue }) {
  const { t, href, integration, ar, page, catalogue } = useSite();
  const current = state ?? catalogue,
    home = page === 'home';
  const cancelRefinement = useCancelSearch(),
    searchState = useSearchPresentation();
  const searching = !!integration?.busy || searchState.running;
  const [q, setQ] = useState(current.query || ''),
    input = useRef<HTMLTextAreaElement>(null),
    composing = useRef(false),
    submitting = useRef(false);
  const value = integration?.searchValue ?? q;
  useLayoutEffect(() => {
    const control = input.current;
    if (!control) return;
    const resize = () => {
      control.style.height = 'auto';
      control.style.height = Math.min(control.scrollHeight, 116) + 'px';
    };
    resize();
    let width = control.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width !== control.clientWidth) {
        width = control.clientWidth;
        resize();
      }
    });
    observer.observe(control);
    return () => observer.disconnect();
  }, [value]);
  useLayoutEffect(() => {
    const actual = input.current?.value;
    if (actual && actual !== (integration?.searchValue ?? q)) {
      setQ(actual);
      integration?.onSearchValue?.(actual);
    }
  }, []);
  useEffect(() => {
    setQ(current.query);
  }, [current.query]);
  const submit = (submitted: string) => {
    if (
      searching ||
      submitting.current ||
      composing.current ||
      !submitted.trim()
    )
      return;
    submitting.current = true;
    queueMicrotask(() => {
      submitting.current = false;
    });
    searchState.prepareSubmit(submitted);
    const ordinary =
      current.query === submitted &&
      new URL(location.href).searchParams.get('assistance') === 'ordinary';
    current.update({ q: submitted, assistance: ordinary ? 'ordinary' : '' });
  };
  const suggestions = searchSuggestions(ar);
  const visibleResult =
    !!current.query.trim() && value === current.query && !searching;
  const matches =
    visibleResult && (searchState.ready || searchState.phase === 'idle');
  const allParams = new URLSearchParams(integration?.nativeQuery ?? []);
  allParams.set('q', current.query);
  const allHref = href('catalogue', undefined, Object.fromEntries(allParams));
  return (
    <Card
      className="pu-ai-search-card"
      dir={ar ? 'rtl' : 'ltr'}
      data-search-context={home ? 'home' : 'catalogue'}
      data-card-state={
        searching
          ? 'busy'
          : matches
            ? 'ready'
            : searchState.phase === 'error'
              ? 'error'
              : 'idle'
      }
    >
      <CardHeader className="pu-ai-search-header">
        <div className="pu-ai-search-title">
          <Sparkles aria-hidden="true" className="pu-ai-search-emblem" />
          <FieldLabel htmlFor="project-search">
            {home
              ? ar
                ? 'اسأل مساعدنا الذكي'
                : 'Ask our AI assistant'
              : t('searchLabel')}
          </FieldLabel>
          <AIBeta />
        </div>
        <p dir={ar ? 'rtl' : 'ltr'}>
          {ar
            ? 'اعثر على المشاريع باستخدام اللغة الطبيعية.'
            : 'Find projects using natural language.'}
        </p>
      </CardHeader>
      <CardContent className="pu-ai-search-content">
        <form
          action={home ? href('home') : href('catalogue')}
          method="get"
          data-ui="search"
          dir={ar ? 'rtl' : 'ltr'}
          role="search"
          aria-busy={searching}
          onSubmit={(e) => {
            e.preventDefault();
            submit(String(new FormData(e.currentTarget).get('q') ?? ''));
          }}
        >
          {integration?.nativeQuery?.map(([key, v]) => (
            <input key={key} type="hidden" name={key} value={v} />
          ))}
          <Field className="gap-0">
            <InputGroup className="pu-search-group">
              <InputGroupTextarea
                ref={input}
                id="project-search"
                rows={1}
                name="q"
                dir="auto"
                aria-label={t('searchLabel')}
                placeholder={
                  ar
                    ? 'ابحث عن موضوع أو جامعة أو مشروع…'
                    : 'Describe a topic, university, or project…'
                }
                value={value}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229 &&
                    !composing.current
                  ) {
                    event.preventDefault();
                    if (event.currentTarget.value.trim() && !searching)
                      event.currentTarget.form?.requestSubmit();
                  }
                }}
                onChange={(e) => {
                  cancelRefinement();
                  setQ(e.target.value);
                  integration?.onSearchValue?.(e.target.value);
                }}
              />
              <SearchIcon className="pu-search-leading" aria-hidden="true" />
              <InputGroupAddon align="block-end">
                <InputGroupButton
                  size="sm"
                  type="submit"
                  variant="default"
                  className="pu-search-action"
                  aria-busy={searching}
                  disabled={searching || !value.trim()}
                  aria-label={
                    searching
                      ? ar
                        ? 'جارٍ البحث…'
                        : 'Searching…'
                      : t('search')
                  }
                  data-ui="primary-action"
                >
                  {searching ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Sparkles aria-hidden="true" />
                  )}
                  <span>
                    {searching
                      ? ar
                        ? 'جارٍ البحث…'
                        : 'Searching…'
                      : t('search')}
                  </span>
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          {searching && !searchState.running && (
            <div className="pu-search-progress" role="status">
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              <span>
                {ar
                  ? 'جارٍ العثور على المشاريع المنشورة ذات الصلة…'
                  : 'Finding relevant published projects…'}
              </span>
            </div>
          )}
          <SearchLane
            compact={home}
            hidden={!searching && value !== current.query}
          />
          {matches && !searchState.assisted && (
            <p className="pu-search-match-label" role="status">
              {ar ? 'المشاريع المطابقة' : 'Matching published projects'} ·{' '}
              {current.label}
            </p>
          )}
          {home && matches && (
            <div
              className="pu-home-search-results animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none"
              data-search-total={current.count}
            >
              {current.count ? (
                <div className="pu-search-previews">
                  {current.rows.slice(0, 3).map((p) => (
                    <Link
                      key={p.id}
                      className="pu-search-preview"
                      href={href('project', p.id)}
                      data-search-preview-id={p.id}
                    >
                      <Cover p={p} />
                      <div>
                        <strong dir="auto">{p.title}</strong>
                        <span dir="auto">{p.university}</span>
                        <small dir="ltr">{p.academicYear}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="pu-search-empty">
                  {ar
                    ? 'لا توجد مشاريع منشورة مطابقة. جرّب موضوعًا آخر أو عدّل القيود.'
                    : 'No published projects match. Try another topic or adjust the constraints.'}
                </p>
              )}
              {!!current.count && (
                <Button asChild variant="link" className="pu-search-all">
                  <Link href={allHref} data-search-all>
                    {ar ? 'عرض جميع النتائج' : 'View all'} {current.label}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
          )}
          {!searching && !visibleResult && searchState.phase !== 'error' && (
            <div
              className="pu-search-suggestions"
              aria-label={ar ? 'جرّب البحث عن' : 'Try searching'}
            >
              <span>{ar ? 'جرّب البحث عن:' : 'Try searching:'}</span>
              {suggestions.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  className="pu-search-suggestion"
                  onClick={() => {
                    setQ(prompt);
                    integration?.onSearchValue?.(prompt);
                    submit(prompt);
                  }}
                >
                  <SearchIcon aria-hidden="true" />
                  {prompt}
                </Button>
              ))}
            </div>
          )}
          {home && searchState.phase === 'error' && (
            <Button asChild variant="link">
              <Link
                href={href(
                  'catalogue',
                  undefined,
                  Object.fromEntries(
                    new URLSearchParams([
                      ...allParams,
                      ['q', value],
                      ['assistance', 'ordinary'],
                    ]),
                  ),
                )}
              >
                {ar
                  ? 'الانتقال إلى نتائج الفهرس العادية'
                  : 'Continue with ordinary catalogue search'}
              </Link>
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function AuthorAvatar({ p, index }: { p: Project; index: number }) {
  const { integration } = useSite(),
    name = p.authors[index]!.name;
  return (
    <Avatar className="pu-avatar" aria-hidden="true">
      <AvatarFallback>
        {integration?.avatar?.(p, index, name) ??
          name
            .split(' ')
            .map((s) => s[0])
            .slice(0, 2)
            .join('')}
      </AvatarFallback>
    </Avatar>
  );
}
export function Authors({ p, all = false }: { p: Project; all?: boolean }) {
  const { href, l } = useSite(),
    portal = usePublicPortal();
  const names = (
    <ol
      className="pu-authors"
      aria-label={l('Project authors', 'مؤلفو المشروع')}
    >
      {p.authors.map((a, index) => (
        <li key={index}>
          <Link href={href('catalogue', undefined, { author: a.name })}>
            <AuthorAvatar p={p} index={index} />
            <bdi>{a.name}</bdi>
          </Link>
        </li>
      ))}
    </ol>
  );
  void all;
  if (p.authors.length <= 4) return names;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto p-1 w-fit justify-start"
          aria-label={l(
            `Show all ${p.authors.length} authors`,
            `عرض جميع المؤلفين (${p.authors.length})`,
          )}
        >
          <span className="pu-author-previews">
            {p.authors.map((_, index) => (
              <AuthorAvatar p={p} index={index} key={index} />
            ))}
          </span>
          <Badge variant="secondary">{p.authors.length}</Badge>
          <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        {...portal}
        aria-label={l('Project authors', 'مؤلفو المشروع')}
        className={portal.className + ' w-80 max-h-96 overflow-y-auto'}
        align="start"
      >
        {names}
      </PopoverContent>
    </Popover>
  );
}
export function Score({ p }: { p: Project }) {
  const { t, ar, eligible, l } = useSite();
  return (
    <div className="pu-score" data-ui="assessment" dir={ar ? 'rtl' : 'ltr'}>
      <span>{t('independentAssessment')}</span>
      {p.independentAssessment.unavailable ? (
        <span>{l('Assessment unavailable', 'التقييم غير متاح')}</span>
      ) : eligible(p) ? (
        <div className="pu-score-meta">
          <strong dir="ltr">
            {formatScore(p.independentAssessment.score, ar ? 'ar' : 'en')}
            <small>/100</small>
          </strong>
          <span>
            {reviewCount(p.independentAssessment.completedReviews, ar)}
          </span>
        </div>
      ) : (
        <span>
          {t(
            p.independentAssessment.completedReviews
              ? 'incompleteAssessment'
              : 'noIndependentAssessment',
          )}
          {p.independentAssessment.completedReviews > 0 && (
            <small>
              {reviewCount(p.independentAssessment.completedReviews, ar)}
            </small>
          )}
        </span>
      )}
    </div>
  );
}
export function Cover({
  p,
  priority = false,
}: {
  p: Project;
  priority?: boolean;
}) {
  const { integration, cover } = useSite();
  return (
    integration?.media?.(p, priority) ?? (
      <img
        src={cover(p)}
        alt={p.title}
        width={1600}
        height={1000}
        loading={priority ? 'eager' : 'lazy'}
      />
    )
  );
}
export function OpenProject({ p }: { p: Project }) {
  const { t, href } = useSite();
  return (
    <Button asChild>
      <Link data-ui="project-action" href={href('project', p.id)}>
        {t('openProject')}
        <span aria-hidden="true">↗</span>
      </Link>
    </Button>
  );
}
export function ProjectCard({ p }: { p: Project }) {
  const { t, href, summary, integration } = useSite();
  return (
    <Card
      className="pu-project-card"
      data-ui="project-card"
      data-project-id={p.id}
      data-id={p.id}
      id={'project-' + p.id}
    >
      <Link className="pu-card-media" href={href('project', p.id)}>
        <Cover p={p} />
      </Link>
      <CardContent className="pu-card-body">
        <span className="pu-eyebrow">
          {t(p.department)} · <bdi dir="ltr">{p.academicYear}</bdi>
        </span>
        <h3 dir="auto">
          <Link href={href('project', p.id)}>{p.title}</Link>
        </h3>
        {integration?.aiSummary ? (
          integration.aiSummary(p, true)
        ) : (
          <p dir="auto">{summary(p)}</p>
        )}
        <Authors p={p} />
        <small className="pu-muted">{p.university}</small>
      </CardContent>
      <CardFooter className="pu-card-footer">
        <Score p={p} />
        <OpenProject p={p} />
      </CardFooter>
    </Card>
  );
}
