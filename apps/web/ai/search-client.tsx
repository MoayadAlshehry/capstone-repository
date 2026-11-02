'use client';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MotionGroup, MotionItem } from '@/components/ui/shared-motion';
import { Sources } from '@/components/assistant-ui/elements/sources';
import { useAISystem } from './context';
import { RequestLoader } from './loader';
import { projectCount } from '../../../packages/ui/src/design-system/public/counts';
import { aiStream } from './transport';
import {
  readSearchOverrides,
  sortMembership,
  type ResolvedMention,
  type Constraints,
  type SearchChoice,
  type SearchIntent,
} from './search-contract';
import type { PublicData, PublicProjectData } from '../public-adoption/types';
type Config = {
  key: string;
  query: string;
  filters: Record<string, string>;
  overrides: ReturnType<typeof readSearchOverrides>;
  count: number;
  mode: string;
  responseId: string | undefined;
  update: (changes: Record<string, string>) => void;
};
type Result = {
  status: 'ready' | 'clarification' | 'conflict' | 'unavailable';
  key?: string;
  items: PublicProjectData[];
  total: number;
  context: string;
  originalQuery: string;
  intent?: SearchIntent;
  resolved?: ResolvedMention[];
  ignored?: { id: string; facet: string; text: string }[];
  effective?: Constraints;
  orders?: Record<string, string[]>;
  preferredSort?: string | null;
  choices?: SearchChoice[];
  conflicts?: string[];
  warnings: string[];
  reasons?: { id: string; title: string; href: string; excerpt: string }[];
};
type State = {
  key: string;
  phase: 'idle' | 'running' | 'ready' | 'error';
  label?: string;
  result?: Result;
  chips?: ResolvedMention[];
};
const SearchContext = createContext<{
  state: State;
  ordinaryCount: number;
  configure: (config: Config | null) => void;
  refine: (query?: string) => void;
  cancel: () => void;
  prepareSubmit: (query: string) => void;
  ordinary: () => void;
  project: () => void;
  drop: (mention: ResolvedMention) => void;
  pick: (choice: SearchChoice, value: string) => void;
  clearManual: (facet: string) => void;
  restore: (id: string) => void;
}>({
  state: { key: '', phase: 'idle' },
  ordinaryCount: 0,
  configure: () => {},
  refine: () => {},
  cancel: () => {},
  prepareSubmit: () => {},
  ordinary: () => {},
  project: () => {},
  drop: () => {},
  pick: () => {},
  clearManual: () => {},
  restore: () => {},
});
export function UnifiedSearchProvider({ children }: { children: ReactNode }) {
  const ai = useAISystem(),
    [state, setState] = useState<State>({ key: '', phase: 'idle' }),
    config = useRef<Config | null>(null),
    request = useRef<AbortController | null>(null),
    viewRequest = useRef<AbortController | null>(null),
    serial = useRef(0),
    result = useRef<Result | undefined>(undefined),
    chipMemory = useRef<ResolvedMention[]>([]),
    intent = useRef<string | null>(null),
    attempted = useRef(new Set<string>());
  const awaitingOrdinary = useRef<{ responseId: string | undefined } | null>(
    null,
  );
  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    viewRequest.current?.abort();
    viewRequest.current = null;
    serial.current++;
    setState((s) => ({ ...s, phase: s.result ? 'ready' : 'idle' }));
  }, []);
  const accept = useCallback((value: Result, key: string) => {
    if (config.current?.key !== key) return;
    result.current = value;
    config.current.mode = 'semantic';
    const url = new URL(location.href);
    url.searchParams.set('assistance', 'semantic');
    if (!url.searchParams.has('sort') && value.preferredSort)
      url.searchParams.set('sort', value.preferredSort);
    const maxPage = Math.max(
      1,
      Math.ceil(value.total / Number(url.searchParams.get('pageSize') ?? 12)),
    );
    if (Number(url.searchParams.get('page') ?? 1) > maxPage)
      url.searchParams.delete('page');
    history.replaceState(null, '', url.href);
    chipMemory.current = value.resolved ?? [];
    setState({ key, phase: 'ready', result: value, chips: chipMemory.current });
  }, []);
  const start = useCallback(() => {
    const value = config.current;
    if (!value || request.current || value.query.trim().length < 2) return;
    const controller = new AbortController(),
      version = ++serial.current;
    viewRequest.current?.abort();
    request.current = controller;
    attempted.current.add(value.key);
    if (attempted.current.size > 32)
      attempted.current.delete(attempted.current.values().next().value!);
    setState({
      key: value.key,
      phase: 'running',
      chips: chipMemory.current,
      label:
        ai.locale === 'ar'
          ? 'جارٍ العثور على المشاريع المنشورة ذات الصلة…'
          : 'Finding relevant published projects…',
    });
    void (async () => {
      try {
        for await (const event of aiStream(
          {
            action: 'search',
            locale: ai.locale,
            query: value.query,
            filters: value.filters,
            overrides: value.overrides,
          },
          controller.signal,
        )) {
          if (
            controller.signal.aborted ||
            version !== serial.current ||
            config.current?.key !== value.key
          )
            return;
          if (event.type === 'notice')
            setState((s) => ({ ...s, label: event.text }));
          if (event.type === 'result') accept(event.value as Result, value.key);
          if (event.type === 'error') throw Error(event.code);
        }
      } catch {
        if (!controller.signal.aborted && version === serial.current)
          setState({ key: value.key, phase: 'error' });
      } finally {
        if (request.current === controller) request.current = null;
      }
    })();
  }, [ai.locale, accept]);
  const configure = useCallback(
    (value: Config | null) => {
      const previousQuery = config.current?.query;
      const changed = config.current?.key !== value?.key,
        modeChanged = config.current?.mode !== value?.mode;
      config.current = value;
      if (!value) awaitingOrdinary.current = null;
      else if (
        awaitingOrdinary.current &&
        value.count >= 0 &&
        value.responseId !== awaitingOrdinary.current.responseId
      )
        awaitingOrdinary.current = null;
      if (changed) {
        cancel();
        chipMemory.current =
          previousQuery === value?.query
            ? chipMemory.current.filter(
                (m) => !value?.overrides.drop.includes(m.id),
              )
            : [];
        result.current = undefined;
        setState({
          key: value?.key ?? '',
          phase: 'idle',
          chips: chipMemory.current,
        });
      }
      if (
        ai.enabled &&
        !awaitingOrdinary.current &&
        value &&
        value.count >= 0 &&
        value.mode !== 'ordinary' &&
        (intent.current === value.query ||
          value.count === 0 ||
          value.mode === 'semantic') &&
        value.query.trim().length >= 2 &&
        (!attempted.current.has(value.key) ||
          changed ||
          // An accepted result already represents this key; URL synchronization
          // must not dispatch the same request again. Explicit refinement still runs.
          (modeChanged && value.mode === 'semantic' && !result.current))
      ) {
        intent.current = null;
        start();
      }
    },
    [ai.enabled, cancel, start],
  );
  const project = useCallback(() => {
    const current = result.current,
      value = config.current;
    if (
      !current?.key ||
      current.status !== 'ready' ||
      !value ||
      request.current
    )
      return;
    viewRequest.current?.abort();
    const controller = new AbortController(),
      version = ++serial.current;
    viewRequest.current = controller;
    void (async () => {
      try {
        for await (const event of aiStream(
          { action: 'searchView', locale: ai.locale, key: current.key },
          controller.signal,
        )) {
          if (
            controller.signal.aborted ||
            version !== serial.current ||
            config.current?.key !== value.key
          )
            return;
          if (event.type === 'result') accept(event.value as Result, value.key);
          if (event.type === 'error') {
            if (event.code === 'SOURCE_CHANGED') {
              result.current = undefined;
              attempted.current.delete(value.key);
              setState({ key: value.key, phase: 'idle' });
              request.current = null;
              start();
              return;
            }
            throw Error(event.code);
          }
        }
      } catch {
        if (!controller.signal.aborted && version === serial.current) {
          result.current = undefined;
          setState({ key: value.key, phase: 'error' });
        }
      } finally {
        if (viewRequest.current === controller) viewRequest.current = null;
      }
    })();
  }, [ai.locale, accept, start]);
  useEffect(() => {
    const off = () => {
      cancel();
      config.current = null;
      result.current = undefined;
      attempted.current.clear();
      awaitingOrdinary.current = null;
      setState({ key: '', phase: 'idle' });
    };
    addEventListener('capstone-ai-disabled', off);
    addEventListener('capstone-ai-context-changed', off);
    return () => {
      off();
      removeEventListener('capstone-ai-disabled', off);
      removeEventListener('capstone-ai-context-changed', off);
    };
  }, [cancel]);
  useEffect(() => {
    if (!state.result) return;
    const timer = setInterval(() => {
      void fetch('/api/ai?status=1', { cache: 'no-store' })
        .then(async (response) => {
          if (response.status === 409)
            dispatchEvent(new Event('capstone-ai-context-changed'));
          else if (response.status === 404)
            dispatchEvent(new Event('capstone-ai-disabled'));
          else if (response.ok) {
            const next = (await response.json()) as { context?: string };
            if (next.context !== result.current?.context)
              dispatchEvent(new Event('capstone-ai-context-changed'));
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [!!state.result]);
  const drop = (mention: ResolvedMention) => {
    const value = config.current;
    if (!value) return;
    value.update({
      aiDrop: [...new Set([...value.overrides.drop, mention.id])].join(','),
    });
  };
  return (
    <SearchContext.Provider
      value={{
        state,
        ordinaryCount: config.current?.count ?? 0,
        configure,
        refine: (query) => {
          awaitingOrdinary.current = null;
          if (query && config.current?.query !== query) {
            intent.current = query;
            return;
          }
          if (config.current) config.current.mode = 'semantic';
          start();
        },
        cancel,
        prepareSubmit: (query) => {
          cancel();
          const value = config.current;
          awaitingOrdinary.current = value
            ? { responseId: value.responseId }
            : null;
          if (value) attempted.current.delete(value.key);
          if (value?.query !== query) chipMemory.current = [];
          result.current = undefined;
          intent.current = null;
          setState({
            key: value?.key ?? '',
            phase: 'idle',
            chips: chipMemory.current,
          });
        },
        project,
        drop,
        pick: (choice, value) =>
          config.current?.update({
            aiPick: JSON.stringify({
              ...config.current.overrides.pick,
              [choice.id]: value,
            }),
          }),
        clearManual: (facet) =>
          config.current?.update({ [facet]: '', [facet + 'Key']: '' }),
        restore: (id) =>
          config.current?.update({
            aiDrop: config.current.overrides.drop
              .filter((value) => value !== id)
              .join(','),
          }),
        ordinary: () => {
          const value = config.current,
            current = result.current;
          if (!value) return;
          // Carry resolved single-valued hard restrictions into ordinary search. The
          // original sentence remains unchanged; unsupported exclusion fallback is hidden.
          const changes: Record<string, string> = { assistance: 'ordinary' };
          for (const mention of current?.resolved ?? [])
            if (mention.operator === 'include' && mention.values.length === 1)
              changes[
                mention.facet === 'author' || mention.facet === 'supervisor'
                  ? mention.facet + 'Key'
                  : mention.facet
              ] = mention.values[0]!;
          cancel();
          result.current = undefined;
          setState({ key: value.key, phase: 'idle' });
          value.update(changes);
        },
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}
export function useSearchPresentation() {
  const value = useContext(SearchContext);
  return {
    retain:
      value.state.phase === 'running' || value.state.result?.status === 'ready',
    project: value.project,
    prepareSubmit: value.prepareSubmit,
    running: value.state.phase === 'running',
    phase: value.state.phase,
    ready:
      value.state.phase === 'ready' && value.state.result?.status === 'ready',
    assisted:
      value.state.phase === 'ready' &&
      !!value.state.result &&
      value.state.result.status !== 'unavailable',
  };
}
export function useUnifiedCatalogue(
  data: PublicData,
  query: string,
  busy: boolean,
  owner: boolean,
  update: Config['update'],
) {
  const ai = useAISystem(),
    search = useContext(SearchContext),
    params = new URLSearchParams(query),
    filters = Object.fromEntries(
      [...params].filter(([k]) =>
        [
          'university',
          'department',
          'academicYear',
          'domain',
          'author',
          'supervisor',
          'authorKey',
          'supervisorKey',
          'sort',
        ].includes(k),
      ),
    ),
    overrides = readSearchOverrides(params);
  const key =
      data.locale +
      ':' +
      JSON.stringify(
        [...params]
          .filter(
            ([k]) =>
              !['view', 'page', 'pageSize', 'assistance', 'sort'].includes(k),
          )
          .sort(),
      ),
    mode = params.get('assistance') ?? '';
  useEffect(() => {
    if (!owner) return;
    if (
      (data.page === 'catalogue' && data.result) ||
      (data.page === 'home' && params.get('q')?.trim())
    )
      search.configure({
        key,
        mode,
        query: params.get('q') ?? '',
        filters,
        overrides,
        count: busy || !data.result ? -1 : data.result.total,
        responseId: data.requestId,
        update,
      });
    else if (data.page !== 'catalogue') search.configure(null);
  }, [
    key,
    mode,
    busy,
    owner,
    data.page,
    !!data.result,
    data.result?.total,
    data.requestId,
    params.get('sort'),
    update,
  ]);
  useEffect(() => {
    // Cross-page handoff reuses membership but rechecks current authorization,
    // publication pointers and generation through the existing cheap projection.
    if (
      owner &&
      !busy &&
      data.result &&
      search.state.key === key &&
      search.state.result?.status === 'ready'
    )
      search.project();
  }, [data.requestId, busy, key, owner, data.page, !!data.result]);
  if (!ai.enabled || search.state.key !== key || !search.state.result)
    return undefined;
  const value = search.state.result,
    pageSize = Number(params.get('pageSize') ?? 12),
    page = Math.min(
      Math.max(1, Math.ceil(value.total / pageSize)),
      Math.max(1, Number(params.get('page') ?? 1)),
    ),
    sort = params.get('sort') ?? value.preferredSort ?? 'relevance';
  if (value.status === 'unavailable') return undefined;
  const sorted = sortMembership(
    value.items,
    value.orders?.[sort] ?? value.items.map((p) => p.project),
  );
  return {
    ...value,
    items: sorted.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    removeDerived: search.drop,
  };
}
export function SearchRefine({
  query,
  onNavigate,
}: {
  query: string;
  onNavigate: () => void;
}) {
  const ai = useAISystem(),
    search = useContext(SearchContext);
  if (!ai.enabled) return null;
  const label =
    ai.locale === 'ar' ? 'تحسين النتائج بالذكاء الاصطناعي' : 'Refine with AI';
  return (
    <Button
      data-capstone-ai
      className="ai-search-refine-link h-auto p-0 text-xs"
      variant="link"
      type="button"
      disabled={search.state.phase === 'running' || query.trim().length < 2}
      title={label}
      aria-label={label}
      onClick={() => {
        search.refine(query);
        onNavigate();
      }}
    >
      <Sparkles size={16} />
      <span>{label}</span>
    </Button>
  );
}
export function SearchLane({
  compact = false,
  hidden = false,
}: { compact?: boolean; hidden?: boolean } = {}) {
  const ai = useAISystem(),
    s = useContext(SearchContext),
    ar = ai.locale === 'ar',
    l = (en: string, a: string) => (ar ? a : en),
    v = s.state.result;
  if (hidden || !ai.enabled || s.state.phase === 'idle') return null;
  const ordinarySafe =
    v?.status === 'ready' &&
    s.ordinaryCount > 0 &&
    !(v.resolved ?? []).some((m) => m.operator === 'exclude') &&
    ['university', 'department', 'academicYear', 'domain'].every(
      (f) => (v.effective?.[f as keyof Constraints]?.include.length ?? 0) <= 1,
    );
  return (
    <div data-capstone-ai dir={ar ? 'rtl' : 'ltr'}>
      <div
        className="ai-search-lane"
        data-search-state={s.state.phase}
        data-search-status={v?.status}
        aria-live="polite"
      >
        {s.state.phase === 'running' ? (
          <RequestLoader
            label={
              s.state.label ?? l('Finding matches…', 'جارٍ مطابقة النتائج…')
            }
          />
        ) : s.state.phase === 'error' ? (
          <p>
            {l(
              'AI refinement could not complete. Retry or edit the search.',
              'تعذر إكمال تحسين البحث. أعد المحاولة أو عدّل البحث.',
            )}
          </p>
        ) : (
          <>
            {v?.status === 'ready' ? (
              <strong>
                {l('AI-assisted matches', 'نتائج بمساعدة الذكاء الاصطناعي')} ·{' '}
                {projectCount(v.total, ar)}
              </strong>
            ) : (
              <strong>
                {l(
                  v?.status === 'conflict'
                    ? 'Resolve conflicting constraints'
                    : v?.status === 'unavailable'
                      ? 'AI refinement unavailable'
                      : 'Clarify this search',
                  v?.status === 'conflict'
                    ? 'حل تعارض القيود'
                    : v?.status === 'unavailable'
                      ? 'تحسين البحث غير متاح'
                      : 'وضّح هذا البحث',
                )}
              </strong>
            )}
            {v?.warnings?.map((w) => (
              <p key={w}>{w}</p>
            ))}

            {v?.ignored?.map((mention) => (
              <div className="text-xs" key={mention.id}>
                {l('Query restriction removed: ', 'قيد البحث المحذوف: ')}
                {mention.text}
                <Button
                  variant="link"
                  size="sm"
                  type="button"
                  onClick={() => s.restore(mention.id)}
                >
                  {l('Restore', 'استعادة')}
                </Button>
              </div>
            ))}
            {v?.choices?.map((choice) => (
              <div className="ai-search-choice" key={choice.id}>
                <p>
                  {choice.text} ·{' '}
                  {l(
                    choice.options.length
                      ? 'Choose a public match'
                      : 'No verified public match. Edit the name or remove this restriction.',
                    choice.options.length
                      ? 'اختر تطابقًا عامًا'
                      : 'لا يوجد تطابق عام متحقق منه. عدّل الاسم أو أزل القيد.',
                  )}
                </p>
                {choice.options.map((option) => (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    key={option.value}
                    onClick={() => s.pick(choice, option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() =>
                    s.drop({
                      ...choice,
                      operator: 'include',
                      join: 'any',
                      values: [],
                      labels: [choice.text],
                    })
                  }
                >
                  {l(
                    'Remove this query restriction',
                    'إزالة هذا القيد من البحث',
                  )}
                </Button>
              </div>
            ))}
            {v?.conflicts?.map((facet) => (
              <div key={facet}>
                <p>
                  {l(
                    'Manual filter conflicts with the sentence: ',
                    'يتعارض عامل التصفية مع نص البحث: ',
                  )}
                  {facet}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => s.clearManual(facet)}
                >
                  {l('Remove manual filter', 'إزالة عامل التصفية اليدوي')}
                </Button>
              </div>
            ))}
            {!compact && v?.status === 'ready' && (
              <AssistedSources result={v} />
            )}
          </>
        )}
        <MotionGroup
          className="ai-derived-chips"
          aria-label={l('Constraints from your query', 'قيود مستخرجة من البحث')}
        >
          {s.state.chips?.map((m) => (
            <MotionItem key={m.id}>
              <span className="ai-derived-chip">
                {m.operator === 'exclude' ? l('Exclude: ', 'استبعاد: ') : ''}
                {m.labels.join(' / ')}
                <button
                  type="button"
                  aria-label={
                    l('Remove query constraint: ', 'إزالة قيد البحث: ') +
                    m.labels.join(' / ')
                  }
                  onClick={() => s.drop(m)}
                >
                  <X size={14} />
                </button>
              </span>
            </MotionItem>
          ))}
        </MotionGroup>
        <div className="ai-search-actions">
          {s.state.phase === 'running' ? (
            <Button variant="ghost" size="sm" type="button" onClick={s.cancel}>
              {l('Cancel', 'إلغاء')}
            </Button>
          ) : ordinarySafe ? (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={s.ordinary}
            >
              {l('Use ordinary results', 'عرض النتائج العادية')}
            </Button>
          ) : null}
          {(s.state.phase === 'error' || v?.status === 'unavailable') && (
            <Button type="button" size="sm" onClick={() => s.refine()}>
              {l('Retry refinement', 'إعادة تحسين البحث')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
function AssistedSources({ result }: { result: Result }) {
  const [open, setOpen] = useState(false),
    ai = useAISystem();
  if (!result.reasons?.length) return null;
  return (
    <Sources
      sources={result.reasons.map((r) => ({
        title: r.title,
        url: r.href,
        snippet: r.excerpt,
      }))}
      triggerLabel={
        ai.locale === 'ar'
          ? 'مطابقات من المصادر العامة'
          : 'Matches from public sources'
      }
      open={open}
      onOpenChange={setOpen}
      layout="list"
      locale={ai.locale}
    />
  );
}
export const useCancelSearch = () => useContext(SearchContext).cancel;
