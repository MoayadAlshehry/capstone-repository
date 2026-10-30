import 'server-only';
import type { Metadata } from 'next';
import { discovery, publicOrigin } from '../discovery/server';
import type { AccountView } from '@capstone/db/auth';
import type { DiscoveryResult } from '@capstone/domain';
import type { Locale } from './core';
import type { Project } from './core';
import { visualMedia } from '../visual-media/server';
export async function publicProject(p: Project): Promise<Project> {
  try {
    const media = await visualMedia().read(null, {
      kind: 'cover',
      project: p.project,
      version: p.version,
      published: true,
    });
    return { ...p, publicCover: media.image };
  } catch {
    return p;
  }
}
export async function currentPublicResults(
  params: URLSearchParams,
  account: AccountView | null,
): Promise<DiscoveryResult> {
  const result = await discovery().list(params, account);
  result.items = await Promise.all(
    result.items.map(async (p) => {
      const current = await discovery().detail(p.project, account);
      if (current.version !== p.version) throw Error('PUBLIC_POINTER_CHANGED');
      return publicProject(current);
    }),
  );
  return result;
}
export function publicMetadata(
  locale: Locale,
  title: string,
  description: string,
  path: string,
): Metadata {
  const origin = publicOrigin(),
    url = origin + path;
  return {
    title: title + ' | Capstone Repository',
    description,
    alternates: {
      canonical: url,
      languages: {
        en: origin + path.replace(/^\/(en|ar)/, '/en'),
        ar: origin + path.replace(/^\/(en|ar)/, '/ar'),
      },
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
    },
  };
}
