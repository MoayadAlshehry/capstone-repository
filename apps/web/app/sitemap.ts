import type { MetadataRoute } from 'next';
import { discovery, publicOrigin } from '../discovery/server';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicOrigin(),
    items = await discovery().routes();
  return ['en', 'ar'].flatMap((locale) => [
    { url: base + `/${locale}/catalogue` },
    ...items.map((p) => ({
      url: base + `/${locale}/catalogue/${p.project}`,
      lastModified: p.publishedAt,
    })),
  ]);
}
