import { randomUUID } from 'node:crypto';
import { streamSection } from '../../../public-adoption/stream';
import { notFound } from 'next/navigation';
import { publicData, catalogueQuery } from '../../../public-adoption/server';
import { PublicRoute } from '../../../public-adoption/route';
import { publicMetadata } from '../../../public-archive/server';
import { searchParams as queryParams } from '../../../discovery/server';
import type { PublicPage, PublicData } from '../../../public-adoption/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
type Props = {
  params: Promise<{ locale: string; id?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const kind: PublicPage = 'home';
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') return {};
  return publicMetadata(
    locale,
    locale === 'ar' ? 'الرئيسية' : 'Home',
    locale === 'ar'
      ? 'استكشف مشاريع التخرج المنشورة وأعمالها المتاحة للجمهور.'
      : 'Explore published graduation projects and their public work.',
    `/${locale}`,
  );
}
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  const query = queryParams(await searchParams);
  if (query.has('q')) {
    try {
      catalogueQuery(query);
    } catch {
      notFound();
    }
    // Existing Home remains visible through the router transition. Commit its
    // verified ordinary result and unchanged showcase together, before fallback.
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
  const parts = ['featured', 'selectionHeading', 'selection', 'directory'];
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
