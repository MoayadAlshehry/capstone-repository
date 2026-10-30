'use client';
import { PublicProjectAsk } from '../public-ui/ask-trigger';
import { PublicBrief as AISnapshot } from '../public-ui/brief';
import { useAISystem } from '../ai/client';
import {
  useUnifiedCatalogue,
  useSearchPresentation,
} from '../ai/search-client';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  lazy,
  Suspense,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PublicSection,
  PublicHome,
  PublicCatalogue,
  PublicProject,
  PublicLogin,
} from '../public-ui/views';
import { SkeletonTemplate } from '../public-ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { PublicCover } from './cover';
import { readableCodeTokens, fileSharePath } from '../public-archive/core';
import { ArchivedAvatar } from './avatar';
import { PeopleCombobox } from './people-combobox';
import { CatalogueSort } from './sort-select';
import { useSourceLocator } from '../native-files/source-locator-client';
import { RecordVisit } from './record-visit';
import { useSharedAppearance } from './appearance';
import type { PublicPreview } from '../public-archive/core';
import { makeModel } from './model';
import { pushPublicHistory } from './history';
import accessCopy from './access-copy.json';
import { RealLoginForm } from './login-form';
import { usePublicDraft } from './frame';
import type { PublicData } from './types';
const SafeMarkdown = lazy(() =>
  import('../native-files/markdown').then((m) => ({ default: m.SafeMarkdown })),
);
const NativeRegion = lazy(() =>
  import('./native-region').then((m) => ({ default: m.NativeRegion })),
);
type Controller = {
  query: string;
  busy: boolean;
  update: (changes: Record<string, string | string[]>) => void;
  commit: (data: PublicData, part: string) => void;
  requestId: string | undefined;
};
const ControllerContext = createContext<Controller | null>(null);
export function PublicRoute({
  data: supplied,
  region,
  slots,
  pending = false,
  utilities,
}: {
  data: PublicData;
  region?: string;
  slots?: Partial<Record<string, import('react').ReactNode>>;
  pending?: boolean;
  utilities?: import('react').ReactNode;
}) {
  const appearance = useSharedAppearance();
  const ai = useAISystem();
  const searchPresentation = useSearchPresentation();
  const parent = useContext(ControllerContext),
    [regionHydrated, setRegionHydrated] = useState(false),
    [resolved, setResolved] = useState<PublicData | null>(null),
    [partsReady, setPartsReady] = useState<{
      requestId: string | undefined;
      parts: Record<string, true>;
    }>({ requestId: undefined, parts: {} });
  useEffect(() => {
    if (region) setRegionHydrated(true);
  }, [region]);
  // Navigation can advance before a streamed boundary hydrates. Its server
  // and first client render must use its own props; reconcile parent state
  // immediately after hydration, rather than hydrating different HTML.
  const controller = region && !regionHydrated ? null : parent;
  const data =
    !region && resolved?.requestId === supplied.requestId
      ? (resolved ?? supplied)
      : supplied;
  const router = useRouter(),
    urlQuery = useSearchParams(),
    [requested, setRequested] = useState<string | null>(null),
    [navigating, startTransition] = useTransition(),
    root = useRef<HTMLDivElement>(null),
    [readerRoot, setReaderRoot] = useState<HTMLElement | null>(null),
    readerRootRef = useCallback((node: HTMLElement | null) => {
      setReaderRoot(node);
    }, []),
    draft = usePublicDraft();
  const [localView, setLocalView] = useState(urlQuery.get('view') ?? 'grid');
  useLayoutEffect(
    () => setLocalView(urlQuery.get('view') ?? 'grid'),
    [urlQuery.get('view')],
  );
  const query = new URLSearchParams(
    controller?.query ??
      requested ??
      (region ? supplied.query : urlQuery.toString()),
  );
  if (!parent && data.page === 'catalogue') query.set('view', localView);
  const busy = controller?.busy ?? (pending || navigating);
  const view = query.get('view') ?? 'grid';
  useEffect(() => {
    if (
      !pending &&
      (data.result ||
        data.project ||
        data.continuation ||
        data.page === 'login')
    )
      dispatchEvent(
        new CustomEvent('p3-public-account', { detail: data.authenticated }),
      );
  }, [data.authenticated, pending]);
  useEffect(() => {
    if (!navigating && requested !== null) setRequested(null);
  }, [data.query, navigating]);
  const ownUpdate = (changes: Record<string, string | string[]>) => {
    const p = new URLSearchParams(requested ?? urlQuery.toString());
    if (
      'q' in changes &&
      changes.q !== p.get('q') &&
      !('assistance' in changes)
    )
      p.delete('assistance');
    if ('q' in changes && changes.q !== p.get('q')) {
      p.delete('aiDrop');
      p.delete('aiPick');
    }
    for (const [k, v] of Object.entries(changes)) {
      const value = Array.isArray(v) ? (v[0] ?? '') : v;
      if (value) p.set(k, value);
      else p.delete(k);
    }
    if (
      !('page' in changes) &&
      !(Object.keys(changes).length === 1 && 'view' in changes)
    )
      p.delete('page');
    const href =
      `/${data.locale}${data.page === 'home' ? '' : '/catalogue'}` +
      (p.size ? '?' + p : '');
    if (
      (data.page === 'catalogue' || data.page === 'home') &&
      searchPresentation.retain &&
      Object.keys(changes).every((k) =>
        ['sort', 'page', 'pageSize', 'view', 'aiDrop', 'aiPick'].includes(k),
      )
    ) {
      setRequested(null);
      if ('view' in changes) setLocalView(String(changes.view));
      pushPublicHistory(href);
      // Query overrides belong to the unified search, not an ordinary RSC
      // catalogue response that could restore the previous query state.
      if (!('aiDrop' in changes) && !('aiPick' in changes))
        searchPresentation.project();
      return;
    }
    if (Object.keys(changes).length === 1 && 'view' in changes) {
      setLocalView(String(changes.view));
      pushPublicHistory(href);
      return;
    }
    setRequested(p.toString());
    startTransition(() => {
      if (href === location.pathname + location.search) router.refresh();
      else router.push(href, { scroll: false });
    });
  };
  const update = parent?.update ?? ownUpdate;
  const currentRequest = useRef(supplied.requestId);
  currentRequest.current = supplied.requestId;
  const commit = useCallback((next: PublicData, part: string) => {
    if (next.requestId !== currentRequest.current) return;
    setResolved((previous) =>
      previous?.requestId === next.requestId ? previous : next,
    );
    setPartsReady((previous) => ({
      requestId: next.requestId,
      parts: {
        ...(previous.requestId === next.requestId ? previous.parts : {}),
        [part]: true,
      },
    }));
  }, []);
  useLayoutEffect(() => {
    if (region) parent?.commit(supplied, region);
  }, [supplied, region, parent?.commit]);
  const unified = useUnifiedCatalogue(
    data,
    query.toString(),
    busy,
    !region,
    update,
  );
  const assisted = region && !regionHydrated ? undefined : unified;
  const presentation =
    assisted && data.result
      ? {
          ...data,
          result: {
            ...data.result,
            items: assisted.items,
            total: assisted.total,
            page: assisted.page,
            pageSize: assisted.pageSize,
          },
        }
      : data;
  const model = makeModel(presentation, query, update);
  if (assisted?.resolved) {
    for (const mention of assisted.resolved) {
      if (
        mention.operator !== 'include' ||
        query.has(mention.facet) ||
        query.has(mention.facet + 'Key')
      )
        continue;
      const person =
        mention.facet === 'author' || mention.facet === 'supervisor';
      const values = person
        ? mention.labels.map((label) => label.split(' · ')[0]!)
        : mention.values;
      model.catalogue.selections[mention.facet] = [
        ...new Set([...model.catalogue.selections[mention.facet], ...values]),
      ];
      model.catalogue.values[mention.facet] =
        model.catalogue.selections[mention.facet].length === 1
          ? (values[0] ?? '')
          : '';
      if (person && model.catalogue.publicPersonKeys)
        model.catalogue.publicPersonKeys[
          mention.facet as 'author' | 'supervisor'
        ] = mention.values[0] ?? '';
    }
    const originalUpdate = model.catalogue.update;
    model.catalogue.update = (changes) => {
      const drop = (query.get('aiDrop') ?? '').split(',').filter(Boolean);
      for (const mention of assisted.resolved ?? [])
        if (
          mention.operator === 'include' &&
          mention.facet in changes &&
          (!changes[mention.facet] ||
            (Array.isArray(changes[mention.facet]) &&
              !changes[mention.facet]!.length))
        )
          drop.push(mention.id);
      originalUpdate({
        ...changes,
        ...(drop.length ? { aiDrop: [...new Set(drop)].join(',') } : {}),
      });
    };
  }
  if (data.page === 'home' && query.get('selection') !== 'all')
    model.continuation = model.continuation.slice(0, 4);
  model.navigate = (href) => router.push(href);
  const rawProjects = [
    ...(presentation.result?.items ?? []),
    ...(data.continuation ?? []),
    ...(data.project ? [data.project] : []),
    ...(data.feature ? [data.feature] : []),
  ];
  const memoryKey = data.page + ':' + (query.get('q') ?? '');
  model.integration = {
    ...model.integration,
    readerRootRef,
    ...(ai.enabled && data.page !== 'login'
      ? {
          aiSummary: (
            p: Parameters<typeof model.summary>[0],
            compact?: boolean,
          ) => {
            const raw = rawProjects.find((item) => item.project === p.id);
            return raw &&
              (!data.authenticated || Object.hasOwn(raw, 'evaluation')) ? (
              <AISnapshot
                project={{
                  id: raw.project,
                  title: raw.title,
                  version: raw.version,
                  abstract: model.summary(p),
                }}
                compact={!!compact}
                briefSize={
                  data.page === 'home'
                    ? compact
                      ? 'standard'
                      : 'hero'
                    : view === 'list'
                      ? 'compact'
                      : 'standard'
                }
              />
            ) : (
              <p dir="auto">{model.summary(p)}</p>
            );
          },
          ...(data.project &&
          (!data.authenticated || Object.hasOwn(data.project, 'evaluation'))
            ? {
                aiActions: (
                  <PublicProjectAsk
                    project={{
                      id: data.project.project,
                      title: data.project.title,
                      version: data.project.version,
                    }}
                  />
                ),
                aiOverview: (
                  <AISnapshot
                    project={{
                      id: data.project.project,
                      title: data.project.title,
                      version: data.project.version,
                      abstract: data.project.abstract,
                    }}
                    detail
                  />
                ),
              }
            : {}),
        }
      : {}),
    sortControl: (
      <CatalogueSort
        locale={data.locale}
        value={
          query.get('sort') ??
          (searchPresentation.ready ? 'relevance' : 'newest')
        }
        busy={busy}
        relevanceAvailable={searchPresentation.ready}
        onChange={(value) =>
          update({ sort: value === 'relevance' ? '' : value })
        }
      />
    ),
    literalMetadata: true,
    personFacet: (kind, state, select) => (
      <PeopleCombobox
        kind={kind}
        locale={data.locale}
        value={state.value}
        selectedKey={state.key}
        university={state.university}
        department={state.department}
        onSelect={(person) => select(person?.name ?? '', person?.key ?? '')}
      />
    ),
    ...(urlQuery.get('directory')
      ? { initialDirectory: urlQuery.get('directory')! }
      : {}),
    nativeQuery:
      data.page === 'catalogue' || data.page === 'home'
        ? [...query].filter(([key]) => !['q', 'page'].includes(key))
        : [],
    avatar: (project, index, name) => {
      const raw = rawProjects.find((p) => p.project === project.id),
        author = raw
          ? [...raw.authors].sort((a, b) => a.order - b.order)[index]
          : undefined;
      return raw && author ? (
        <ArchivedAvatar
          project={raw.project}
          version={raw.version}
          order={author.order}
          name={name}
        />
      ) : (
        name
          .split(' ')
          .map((s) => s[0])
          .slice(0, 2)
          .join('')
      );
    },
    hideRankingLink:
      data.page === 'home' && !!data.ranked && !model.continuation.length,
    ...(utilities ? { loginUtilities: utilities } : {}),
    sourceLabel: model.l('Original source', 'المصدر الأصلي'),
    ...(data.project
      ? {
          publishedLabel: new Intl.DateTimeFormat(data.locale, {
            dateStyle: 'medium',
            timeZone: 'UTC',
          }).format(new Date(data.project.publishedAt)),
        }
      : {}),
    busy,
    error: busy ? (
      <div
        role="status"
        aria-label={model.l(
          'Loading published projects',
          'جارٍ تحميل المشاريع المنشورة',
        )}
      >
        <SkeletonTemplate
          template={view === 'list' ? 'catalogue-list' : 'catalogue-grid'}
        />
      </div>
    ) : undefined,
    searchValue:
      draft.memory.key === memoryKey
        ? draft.memory.value
        : (query.get('q') ?? ''),
    onSearchValue: (value: string) =>
      draft.setMemory({
        key: memoryKey,
        value,
        focus: true,
        start: null,
        end: null,
      }),
    emptyFeature: (
      <Empty className="col-span-full bg-card border">
        <EmptyHeader>
          <span className="eyebrow">
            {model.l('Published research', 'البحث المنشور')}
          </span>
          <EmptyTitle dir="auto">
            {model.l(
              'No projects have been published yet.',
              'لا توجد مشاريع منشورة حتى الآن.',
            )}
          </EmptyTitle>
          <EmptyDescription dir="auto">
            {model.l(
              'Published project records and files shared publicly will appear in this collection.',
              'تظهر في هذه المجموعة سجلات المشاريع المنشورة والملفات المخصّصة للعامة.',
            )}
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild>
          <a href={model.href('catalogue')}>{model.t('browseAll')} ↗</a>
        </Button>
      </Empty>
    ),
    media: (p, priority) => (
      <PublicCover
        id={p.id}
        title={p.title}
        locale={data.locale}
        src={p.coverAssetKey}
        image={p.coverImage ?? null}
        priority={priority}
      />
    ),
    ...(pending
      ? {
          emptyFeature: <SkeletonTemplate template="home" />,
          selection: <SkeletonTemplate template="catalogue-list" />,
        }
      : {}),
    ...(data.page === 'login'
      ? {
          loginForm: (
            <RealLoginForm
              locale={data.locale}
              returnTo={data.returnTo ?? `/${data.locale}/workspace`}
            />
          ),
        }
      : {}),
  };
  model.currentUrl =
    typeof location === 'undefined'
      ? 'http://public.invalid/' + data.locale
      : location.href;
  if (busy)
    model.catalogue.label = model.l(
      'Loading published projects',
      'جارٍ تحميل المشاريع المنشورة',
    );
  const p = data.project,
    files = data.files ?? [],
    explicit = urlQuery.get('file'),
    selected =
      files.find((f) => f.id === explicit) ??
      (!explicit
        ? (files.find((f) => /^readme\.md$/i.test(f.path)) ?? files[0])
        : undefined),
    file = model.project?.publicFiles.find(
      (f) => f.contentKey === selected?.id,
    );
  const [preview, setPreview] = useState<{
      key: string;
      data: PublicPreview;
    } | null>(null),
    [failure, setFailure] = useState<{
      key: string;
      kind: 'failed' | 'denied';
    } | null>(null),
    [retry, setRetry] = useState(0);
  const { pdfMemory, setPdfMemory } = draft;
  const fileKey = p
    ? p.project + ':' + p.version + ':' + (selected?.id ?? '')
    : '';
  useEffect(() => {
    if (
      !p ||
      !selected ||
      (slots && !region) ||
      (region && region !== 'reader')
    )
      return;
    const controller = new AbortController();
    setFailure(null);
    setPreview(null);
    fetch(
      '/api/public-files?' +
        new URLSearchParams({
          project: p.project,
          version: p.version,
          file: selected.id,
          mode: 'preview',
        }),
      { cache: 'no-store', signal: controller.signal },
    )
      .then(async (r) => {
        if ([403, 404].includes(r.status)) {
          if (!controller.signal.aborted)
            setFailure({ key: fileKey, kind: 'denied' });
          return;
        }
        if (!r.ok) throw Error();
        const data = (await r.json()) as PublicPreview;
        if (data.meta.id !== selected.id) throw Error();
        if (!controller.signal.aborted) setPreview({ key: fileKey, data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setFailure({ key: fileKey, kind: 'failed' });
      });
    return () => controller.abort();
  }, [fileKey, retry]);
  const safePreview = preview?.key === fileKey ? preview.data : null,
    previewError = failure?.key === fileKey && failure.kind === 'failed',
    unavailable = failure?.key === fileKey && failure.kind === 'denied';
  const sourcePdfPage = urlQuery.get('filePage');
  useLayoutEffect(() => {
    if (safePreview?.family !== 'pdf' || !sourcePdfPage) return;
    const page = Number(sourcePdfPage);
    if (!Number.isSafeInteger(page) || page < 1 || page > 80) return;
    setPdfMemory((old) => {
      const previous = old[fileKey];
      if (previous?.page === page) return old;
      return Object.fromEntries([
        ...Object.entries(old)
          .filter(([key]) => key !== fileKey)
          .slice(-19),
        [
          fileKey,
          { page, zoom: previous?.zoom ?? 1, fit: previous?.fit ?? 'width' },
        ],
      ]);
    });
  }, [
    fileKey,
    sourcePdfPage,
    data.requestId,
    safePreview?.family,
    setPdfMemory,
  ]);
  useSourceLocator(
    readerRoot,
    fileKey + ':' + (data.requestId ?? ''),
    !!safePreview,
    urlQuery.get('fileLine'),
  );
  if (file && safePreview) {
    const family = safePreview.family;
    file.kind =
      family === 'markdown'
        ? 'md'
        : family === 'source' || family === 'json'
          ? 'code'
          : family === 'unsupported'
            ? 'original'
            : family;
  }
  if (p && model.project) {
    model.fileSelection = {
      requested: explicit ? (selected?.path ?? 'UNAVAILABLE') : null,
      file,
      select: (path) => {
        const f = files.find((f) => f.path === path);
        if (!f) return;
        const q = new URLSearchParams(urlQuery.toString());
        q.delete('directory');
        q.delete('filePage');
        q.delete('fileLine');
        q.set('file', f.id);
        history.pushState(
          null,
          '',
          '/' + data.locale + '/catalogue/' + p.project + '?' + q + '#files',
        );
      },
    };
    model.fileLink = (_p, path) => {
      const f = files.find((f) => f.path === path);
      return f
        ? location.origin +
            `/${data.locale}/catalogue/${p.project}?file=${encodeURIComponent(f.id)}#public-files`
        : '';
    };
    model.downloadAll = async () => {
      const href =
        '/api/public-files?' +
        new URLSearchParams({
          project: p.project,
          version: p.version,
          mode: 'zip',
        });
      const response = await fetch(href, { method: 'HEAD', cache: 'no-store' });
      if (!response.ok)
        throw Error(
          model.l(
            'The public ZIP could not be confirmed. Please retry.',
            'تعذر تأكيد تنزيل الملف المضغوط العام. حاول مجددًا.',
          ),
        );
      location.assign(href);
    };

    model.renderMarkdown = (content) => (
      <Suspense
        fallback={
          <p dir="auto" role="status">
            {model.l('Loading preview…', 'جارٍ تحميل المعاينة…')}
          </p>
        }
      >
        <SafeMarkdown
          text={content}
          resolvePublic={(value, image) => {
            if (value.startsWith('#')) return value;
            if (/^https?:\/\//i.test(value)) return image ? '' : value;
            if (
              /[\\\u0000-\u001f]/u.test(value) ||
              /^[a-z][a-z0-9+.-]*:/i.test(value) ||
              value.startsWith('//')
            )
              return '';
            try {
              const path = decodeURIComponent(
                  new URL(
                    value,
                    'https://public.invalid/' + (selected?.path ?? ''),
                  ).pathname,
                ).slice(1),
                match = files.find((f) => f.path === path);
              if (
                !match ||
                (image && !/^image\/(png|jpeg|webp)$/.test(match.mime))
              )
                return '';
              return image
                ? '/api/public-files?' +
                    new URLSearchParams({
                      project: p.project,
                      version: p.version,
                      file: match.id,
                      mode: 'asset',
                    })
                : fileSharePath(data.locale, p.project, match.id);
            } catch {
              return '';
            }
          }}
        />
      </Suspense>
    );

    if (safePreview && file) {
      const sourceText = ['image', 'pdf'].includes(file.kind)
        ? '/api/public-files?' +
          new URLSearchParams({
            project: p.project,
            version: p.version,
            file: selected!.id,
            mode: 'asset',
          })
        : (safePreview.text ?? undefined);
      if (sourceText !== undefined)
        model.contents[file.contentKey] = sourceText;
      if (safePreview.tokens)
        model.syntaxTokens[file.contentKey] = readableCodeTokens(
          safePreview.tokens,
        )!.map((row) =>
          row.map((t) => ({
            content: t.content,
            color: appearance === 'dark' ? t.dark : t.light,
          })),
        );
    }
    model.integration.filesPending = pending;
    if (pending || data.fileError)
      model.integration.reader = (
        <section id="files" className="public-reader" aria-busy={pending}>
          <h2 dir="auto">{model.t('files')}</h2>
          {data.fileError ? (
            <div role="alert">
              <p dir="auto">
                {model.l(
                  'The public file list could not be loaded.',
                  'تعذر تحميل قائمة الملفات العامة.',
                )}
              </p>
              <Button variant="outline" onClick={() => router.refresh()}>
                {model.l('Retry', 'إعادة المحاولة')}
              </Button>
            </div>
          ) : (
            <>
              <SkeletonTemplate template="file-tree" />
              <SkeletonTemplate template="file-preview" />
            </>
          )}
        </section>
      );
    if (explicit && !selected)
      model.integration.reader = (
        <section id="files" className="public-reader">
          <h2 dir="auto">{model.t('files')}</h2>
          <p dir="auto" role="status">
            {model.l(
              'That public file is unavailable.',
              'هذا الملف العام غير متاح.',
            )}
          </p>
          <Button asChild>
            <a href={`/${data.locale}/catalogue/${p.project}#files`}>
              {model.l(
                'Browse permitted public files',
                'استعرض الملفات العامة المتاحة',
              )}
            </a>
          </Button>
        </section>
      );
    model.integration.readerNotice = safePreview?.truncated ? (
      <p dir="auto" role="status">
        {model.l(
          'This is a bounded preview. Download the permitted original for the complete file.',
          'هذه معاينة محدودة. نزّل الأصل المتاح لقراءة الملف كاملًا.',
        )}
      </p>
    ) : safePreview?.error && safePreview.error !== 'IMAGE_LIMIT' ? (
      <p dir="auto" role="status">
        {model.l(
          'This file could not be fully interpreted. The source and permitted original remain available.',
          'تعذر تفسير الملف كاملًا. يبقى المصدر والأصل المتاح قابلين للقراءة.',
        )}
      </p>
    ) : null;
    model.integration.preview = unavailable ? (
      <div role="status">
        <p dir="auto">
          {model.l(
            'That public preview is unavailable. Reload the record to check its current publication.',
            'هذه المعاينة العامة غير متاحة. أعد تحميل السجل للتحقق من النشر الحالي.',
          )}
        </p>
        <Button variant="outline" onClick={() => router.refresh()}>
          {model.l('Reload record', 'إعادة تحميل السجل')}
        </Button>
      </div>
    ) : safePreview &&
      ['pdf', 'image', 'audio', 'video', 'csv'].includes(safePreview.family) ? (
      <Suspense
        fallback={
          <p dir="auto" role="status">
            {model.l('Loading preview…', 'جارٍ تحميل المعاينة…')}
          </p>
        }
      >
        <NativeRegion
          key={fileKey}
          data={safePreview}
          asset={
            '/api/public-files?' +
            new URLSearchParams({
              project: p.project,
              version: p.version,
              file: selected!.id,
              mode: 'asset',
            })
          }
          locale={data.locale}
          locateSource={urlQuery.has('fileLine')}
          pdfView={
            pdfMemory[fileKey] ?? {
              page: Math.max(
                1,
                Math.min(80, Number(urlQuery.get('filePage')) || 1),
              ),
              zoom: 1,
              fit: 'width',
            }
          }
          setPdfView={(next) =>
            setPdfMemory((old) =>
              Object.fromEntries([
                ...Object.entries(old)
                  .filter(([key]) => key !== fileKey)
                  .slice(-19),
                [fileKey, next],
              ]),
            )
          }
        />
      </Suspense>
    ) : safePreview &&
      (safePreview.family === 'unsupported' ||
        safePreview.error === 'IMAGE_LIMIT') ? (
      <p dir="auto">
        {model.l(
          'This preview is unavailable. The permitted original remains available to download.',
          'هذه المعاينة غير متاحة. يمكنك تنزيل الأصل المسموح به.',
        )}
      </p>
    ) : previewError ? (
      <div role="alert">
        <p dir="auto">
          {model.l(
            'The public preview could not be loaded.',
            'تعذر تحميل المعاينة العامة.',
          )}
        </p>
        <Button variant="outline" onClick={() => setRetry((x) => x + 1)}>
          {model.l('Retry', 'إعادة المحاولة')}
        </Button>
      </div>
    ) : selected && !safePreview ? (
      <div role="status" aria-busy="true">
        <span className="sr-only">
          {model.l('Loading public preview', 'جارٍ تحميل المعاينة العامة')}
        </span>
        <SkeletonTemplate template="file-preview" />
      </div>
    ) : undefined;
    const entry = data.entry,
      labels = accessCopy[data.locale] as Record<string, string>;
    model.integration.rights =
      entry && entry.kind !== 'none' ? (
        <div className="p3-access" role="region" aria-label={labels.title}>
          {entry.kind === 'failed' ? (
            <>
              <p dir="auto" role="alert">
                {labels.failed}
              </p>
              <Button variant="outline" onClick={() => router.refresh()}>
                {model.l('Retry', 'إعادة المحاولة')}
              </Button>
            </>
          ) : (
            <>
              {entry.kind === 'viewRequest' && (
                <p dir="auto">{labels.pending}</p>
              )}
              <Button asChild variant="outline">
                <a href={entry.href}>
                  {labels[entry.kind] ?? model.l('Continue', 'المتابعة')} ↗
                </a>
              </Button>
              {entry.registration && (
                <Button asChild variant="outline">
                  <a href={entry.registration}>{labels.register}</a>
                </Button>
              )}
            </>
          )}
        </div>
      ) : undefined;
  }
  useLayoutEffect(() => {
    if (!pending && draft.memory.key === memoryKey && draft.memory.focus) {
      const input =
        root.current?.querySelector<HTMLInputElement>('#project-search');
      if (input) {
        input.focus({ preventScroll: true });
        if (input.type === 'text')
          input.setSelectionRange(draft.memory.start, draft.memory.end);
      }
    }
  }, [pending]);
  if (model.integration?.publishedLabel)
    model.integration.publicationLabel = model.integration.publishedLabel;
  const ready =
    !busy &&
    (!slots ||
      (partsReady.requestId === supplied.requestId &&
        Object.keys(slots).every((part) => partsReady.parts[part])));
  const activeSlots = slots ?? {};
  if (slots) {
    model.integration = { ...model.integration, ...activeSlots };
    // Only the reader slot owns its scoped access affordance; never duplicate it.
    if (slots.rights) model.integration.rights = slots.rights;
  }
  if (region) {
    const stale =
      regionHydrated &&
      !!parent?.requestId &&
      supplied.requestId !== parent.requestId;
    return (
      <>
        <span
          hidden
          data-p3-region={region}
          data-region-ready={!busy && !stale}
        />
        {stale ? (
          <SkeletonTemplate
            template={
              region === 'featured'
                ? 'home'
                : region === 'reader'
                  ? 'file-preview'
                  : 'catalogue-grid'
            }
          />
        ) : (
          <PublicSection model={model} part={region} />
        )}
      </>
    );
  }
  const body = (
    <div
      ref={root}
      onFocusCapture={(e) => {
        if ((e.target as HTMLElement).id === 'project-search') {
          const value = (e.target as HTMLInputElement).value;
          draft.setMemory({
            key: memoryKey,
            value,
            focus: true,
            start: null,
            end: null,
          });
        }
      }}
      onBlurCapture={(e) => {
        if (
          (e.target as HTMLElement).id === 'project-search' &&
          draft.memory.key === memoryKey
        )
          draft.setMemory({ ...draft.memory, focus: false });
      }}
      data-p3-page={data.page}
      data-ready={ready}
    >
      {data.page === 'home' ? (
        <PublicHome model={model} />
      ) : data.page === 'catalogue' ? (
        <PublicCatalogue model={model} />
      ) : data.page === 'project' ? (
        <PublicProject key={p?.project + ':' + p?.version} model={model} />
      ) : (
        <PublicLogin model={model} />
      )}
    </div>
  );
  return (
    <ControllerContext.Provider
      value={{
        query: query.toString(),
        busy,
        update,
        commit,
        requestId: supplied.requestId,
      }}
    >
      {body}
      {data.page === 'project' && ready && p && (
        <RecordVisit project={p.project} version={p.version} />
      )}
    </ControllerContext.Provider>
  );
}
