import { randomUUID } from 'node:crypto';
import { streamSection } from '../../../../public-adoption/stream';
import { notFound } from 'next/navigation';
import { publicData, catalogueQuery } from '../../../../public-adoption/server';
import { PublicRoute } from '../../../../public-adoption/route';
import { publicMetadata } from '../../../../public-archive/server';
import { searchParams as queryParams } from '../../../../discovery/server';
import type { PublicPage, PublicData } from '../../../../public-adoption/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
type Props = {
  params: Promise<{ locale: string; id?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const kind: PublicPage = 'catalogue';
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') return {};
  return publicMetadata(
    locale,
    locale === 'ar' ? 'المشاريع المنشورة' : 'Published projects',
    'Explore published graduation projects and their public work.',
    `/${locale}/catalogue`,
  );
}
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  const query = queryParams(await searchParams);
  try {
    catalogueQuery(query);
  } catch {
    notFound();
  }
  if (query.get('q')?.trim()) {
    // Commit the verified query result atomically; never present an initial
    // empty DTO as a genuine zero-result answer during Home handoff or search.
    return (
      <PublicRoute
        data={{
          ...(await publicData(kind, locale, query)),
          requestId: randomUUID(),
        }}
      />
    );
  }
  const requestId = randomUUID(),
    base: PublicData = {
      page: kind,
      locale,
      query: query.toString(),
      authenticated: false,
      requestId,
    };
  const promise = publicData(kind, locale, query).then((data) => ({
    ...data,
    requestId,
  }));
  const parts = ['filters', 'resultCount', 'results', 'pagination'];
  return (
    <PublicRoute
      data={base}
      slots={Object.fromEntries(
        parts.map((part) => [
          part,
          streamSection(promise, part, locale, query.get('view') ?? 'grid'),
        ]),
      )}
    />
  );
}
