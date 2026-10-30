import { randomUUID } from 'node:crypto';
import { validPublicProjectQuery } from '../../../../../public-adoption/project-query';
import { streamSection } from '../../../../../public-adoption/stream';
import { publicProject } from '../../../../../public-archive/server';
import { discovery } from '../../../../../discovery/server';
import { currentAccount } from '../../../../../auth/server';
import { notFound } from 'next/navigation';
import { DatabaseError } from '@capstone/db';
import { publicData, publicView } from '../../../../../public-adoption/server';
import { PublicRoute } from '../../../../../public-adoption/route';
import { publicMetadata } from '../../../../../public-archive/server';
import { searchParams as queryParams } from '../../../../../discovery/server';
import type {
  PublicPage,
  PublicData,
} from '../../../../../public-adoption/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
type Props = {
  params: Promise<{ locale: string; id?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const kind: PublicPage = 'project';
export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params;
  if (locale !== 'en' && locale !== 'ar') return {};
  try {
    const data = await publicData(kind, locale, new URLSearchParams(), id);
    return publicMetadata(
      locale,
      data.project!.title,
      data.project!.abstract.slice(0, 155),
      `/${locale}/catalogue/${id}`,
    );
  } catch {
    return { robots: { index: false, follow: false } };
  }
}
export default async function Page({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (locale !== 'en' && locale !== 'ar') notFound();
  const query = queryParams(await searchParams);
  const account = await currentAccount();
  let project;
  try {
    if (!id || !validPublicProjectQuery(query)) notFound();
    project = await discovery().detail(id, account);
  } catch (e) {
    if (
      (e instanceof DatabaseError &&
        ['P0002', '42501'].includes(e.sqlState ?? '')) ||
      (e instanceof Error && e.message === 'NOT_FOUND')
    )
      notFound();
    throw e;
  }
  if (query.has('directory')) {
    try {
      const data = await publicData(kind, locale, query, id);
      return <PublicRoute data={data} />;
    } catch (e) {
      if (e instanceof Error && e.message === 'NOT_FOUND') notFound();
      throw e;
    }
  }
  const requestId = randomUUID(),
    base: PublicData = {
      page: kind,
      locale,
      query: query.toString(),
      authenticated: !!account,
      requestId,
      project: publicView(await publicProject(project)),
    };
  const promise = publicData(kind, locale, query, id).then((data) => ({
    ...data,
    requestId,
  }));
  return (
    <PublicRoute
      data={base}
      slots={Object.fromEntries(
        ['projectActions', 'reader', 'rights'].map((part) => [
          part,
          streamSection(promise, part, locale),
        ]),
      )}
    />
  );
}
