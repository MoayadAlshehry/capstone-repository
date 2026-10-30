'use client';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import {
  PublicModelProvider,
  useSite,
  useCatalogue,
  type PublicModel,
  type Catalogue,
} from './model';
import { ProjectCard, PublicSearch } from './cards';
import { MotionGroup, MotionItem } from '@/components/ui/shared-motion';
import { SearchRefine, useSearchPresentation } from '../ai/search-client';
import { Filters, FilterChips } from './filters';
export function PublicCatalogue({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <CataloguePage />
    </PublicModelProvider>
  );
}
export function CatalogueResults() {
  const s = useCatalogue(),
    { integration, t } = useSite();
  return integration?.busy || integration?.error ? (
    integration.error
  ) : s.count ? (
    <MotionGroup className="pu-results" data-view={s.view}>
      {s.rows.map((p) => (
        <MotionItem key={p.id} className="pu-result-motion">
          <ProjectCard p={p} />
        </MotionItem>
      ))}
    </MotionGroup>
  ) : (
    <Empty role="status" className="border my-8">
      <EmptyHeader>
        <EmptyTitle>{t('noResults')}</EmptyTitle>
        <EmptyDescription>{t('noResultsHelp')}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={s.clear}>{t('clearAll')}</Button>
      </EmptyContent>
    </Empty>
  );
}
export function CataloguePagination({ s }: { s: Catalogue }) {
  const { t, l } = useSite(),
    unavailable = s.page < 1 || s.page > s.pages;
  const change = (page: number) => {
    s.update({ page: String(Math.min(s.pages, Math.max(1, page))) });
    document.getElementById('results-heading')?.scrollIntoView();
  };
  return s.pages > 1 || unavailable ? (
    <Pagination className="mt-8" aria-label={t('catalogue')}>
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="outline"
            disabled={s.page <= 1}
            onClick={() => change(s.page - 1)}
          >
            {t('Previous')}
          </Button>
        </PaginationItem>
        <PaginationItem>
          <span
            className="px-3 text-sm"
            dir={unavailable ? 'auto' : 'ltr'}
            role="status"
          >
            {unavailable
              ? l('Page unavailable', 'الصفحة غير متاحة')
              : s.page + ' / ' + s.pages}
          </span>
        </PaginationItem>
        <PaginationItem>
          <Button
            variant="outline"
            disabled={s.page >= s.pages}
            onClick={() => change(s.page + 1)}
          >
            {t('Next')}
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  ) : null;
}
function CataloguePage() {
  const s = useCatalogue(),
    { t, l, integration } = useSite();
  const searchState = useSearchPresentation();
  return (
    <main id="main" tabIndex={-1} className="wrap pu-catalogue">
      <header className="pu-collection-heading">
        <div>
          <span className="pu-eyebrow">
            {l('Published collection', 'مجموعة المشاريع المنشورة')}
          </span>
          <h1 dir="auto">{t('catalogue')}</h1>
          <p className="pu-catalogue-intro" dir="auto">
            {t('platformDescription')}
          </p>
        </div>
        <PublicSearch state={s} />
      </header>
      {integration?.filters ?? <Filters s={s} />}
      <FilterChips s={s} />
      <div className="pu-result-tools">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 id="results-heading" tabIndex={-1} aria-live="polite" dir="auto">
            {integration?.resultCount ?? s.label}
          </h2>
          {!!s.query &&
            (integration?.searchValue ?? s.query) === s.query &&
            s.count > 0 &&
            !integration?.busy &&
            !searchState.assisted &&
            !searchState.running && (
              <SearchRefine query={s.query} onNavigate={() => {}} />
            )}
        </div>
        <div className="flex items-center gap-4 flex-wrap" dir="ltr">
          {integration?.sortControl}
          <ToggleGroup
            type="single"
            variant="outline"
            value={s.view}
            onValueChange={(value) => {
              if (value) s.update({ view: value });
            }}
            aria-label={l('Result layout', 'تخطيط النتائج')}
          >
            <ToggleGroupItem value="grid" aria-label={t('grid')}>
              <LayoutGrid />
              {t('grid')}
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label={t('list')}>
              <List />
              {t('list')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {integration?.results ?? <CatalogueResults />}
      {integration?.pagination ?? <CataloguePagination s={s} />}
    </main>
  );
}
