import { Suspense } from 'react';
import { discovery } from '../../../../discovery/server';
import { notFound, redirect } from 'next/navigation';
import { publicData } from '../../../../public-adoption/server';
import { PublicRoute } from '../../../../public-adoption/route';
import { publicMetadata } from '../../../../public-archive/server';
import { searchParams as queryParams } from '../../../../discovery/server';
import type { PublicPage } from '../../../../public-adoption/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
type Props = {
  params: Promise<{ locale: string; id?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const kind: PublicPage = 'login';
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') return {};
  return publicMetadata(
    locale,
    locale === 'ar' ? 'تسجيل الدخول' : 'Sign in',
    'Explore published graduation projects and their public work.',
    `/${locale}/login`,
  );
}
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  const query = queryParams(await searchParams);
  const data = await publicData(kind, locale, query);
  if (data.authenticated)
    redirect(
      `/${locale}/workspace?returnTo=${encodeURIComponent(data.returnTo ?? `/${locale}/workspace`)}`,
    );
  return (
    <PublicRoute
      data={data}
      utilities={
        <Suspense
          fallback={
            <>
              <a href={`/${locale}/catalogue`}>
                <span>01</span>
                {locale === 'ar' ? 'استكشف المشاريع' : 'Explore projects'} ↗
              </a>
              <span role="status">
                {locale === 'ar'
                  ? 'جارٍ تحميل روابط المجموعة…'
                  : 'Loading collection links…'}
              </span>
            </>
          }
        >
          <LoginUtilities locale={locale} />
        </Suspense>
      }
    />
  );
}

async function LoginUtilities({ locale }: { locale: 'en' | 'ar' }) {
  let p;
  try {
    p = (
      await discovery().list(
        new URLSearchParams({ pageSize: '1', sort: 'newest' }),
      )
    ).items[0];
  } catch {
    return (
      <a href={`/${locale}/catalogue`}>
        {locale === 'ar' ? 'استكشف المشاريع' : 'Explore projects'} ↗
      </a>
    );
  }
  return (
    <>
      <a href={`/${locale}/catalogue`}>
        <span>01</span>
        {locale === 'ar' ? 'استكشف المشاريع' : 'Explore projects'} ↗
      </a>
      {p && (
        <>
          <a href={`/${locale}/catalogue/${p.project}#people`}>
            <span>02</span>
            {locale === 'ar' ? 'مؤلفو المشروع' : 'Project authors'} ↗
          </a>
          <a href={`/${locale}/catalogue/${p.project}#files`}>
            <span>03</span>
            {locale === 'ar' ? 'قراءة الملفات العامة' : 'Read public files'} ↗
          </a>
        </>
      )}
    </>
  );
}
