import { notFound } from 'next/navigation';
import { workspacePage } from '../../../../workspace-v2/server';
import { routeScope } from '../../../../workspace-v2/registry';
import { text } from '../../../../workspace-v2/navigation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, path } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  return workspacePage(locale, '/' + path.join('/'), await searchParams);
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; path: string[] }>;
}) {
  const { locale, path } = await params,
    scope = routeScope('/' + path.join('/'));
  return {
    title:
      (scope ? text(scope.title, locale === 'ar' ? 'ar' : 'en') : 'Workspace') +
      ' · Capstone Repository',
    robots: { index: false, follow: false },
  };
}
