import type { DiscoveryResult } from '@capstone/domain';
import { parseDiscovery, discoveryUrl } from '@capstone/domain';
import { ArchiveCatalogue } from './catalogue-client';
import { ProjectEditorialTile } from './posters';
import type { Locale } from './core';
export async function ArchiveCataloguePage({
  locale,
  query,
  result,
  error,
}: {
  locale: Locale;
  query: string;
  result?: DiscoveryResult | undefined;
  error?: boolean | undefined;
}) {
  let returnUrl = `/${locale}/catalogue`;
  try {
    returnUrl = discoveryUrl(
      locale,
      parseDiscovery(new URLSearchParams(query)),
    );
  } catch {}
  const { items, ...view } = result ?? {
    items: [],
    total: 0,
    publicCount: 0,
    page: 1,
    pageSize: 12,
    facets: {
      universities: [],
      departments: [],
      academicYears: [],
      domains: [],
      authors: [],
      supervisors: [],
    },
  };
  return (
    <ArchiveCatalogue
      locale={locale}
      query={query}
      view={result ? view : undefined}
      error={error}
    >
      <div className="lra-editorial-grid">
        {items.map((p, index) => (
          <ProjectEditorialTile
            key={p.project}
            p={p}
            locale={locale}
            eager={index === 0}
            kind={
              items.length < 3
                ? 'row'
                : index % 5 === 0
                  ? 'lead'
                  : index % 5 === 1
                    ? 'secondary'
                    : 'standard'
            }
            href={`/${locale}/catalogue/${p.project}?from=${encodeURIComponent(returnUrl)}`}
          />
        ))}
      </div>
    </ArchiveCatalogue>
  );
}
