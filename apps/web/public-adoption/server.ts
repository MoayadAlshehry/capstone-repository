import 'server-only';
import { validPublicProjectQuery } from './project-query';
import { parsePublicCatalogue } from './discovery-query';
import { publicCatalogue } from './discovery-server';
import { safeAccountReturn } from '@capstone/db/account-mail';
import { currentAccount } from '../auth/server';
import { discovery } from '../discovery/server';
import { showcase } from '../showcase/server';
import { publicProject } from '../public-archive/server';
import { publicAccess } from '../public-archive/access';
import { nativeReader } from '../native-files/server';
import type { Locale } from '../public-archive/core';
import type { PublicData, PublicPage, PublicProjectData } from './types';
import type { Project } from '../public-archive/core';
export function catalogueQuery(query: URLSearchParams) {
  const copy = new URLSearchParams(query),
    view = copy.get('view');
  if (
    copy.getAll('view').length > 1 ||
    (view !== null && !['grid', 'list'].includes(view))
  )
    throw Error('INVALID_SEARCH');
  copy.delete('view');
  parsePublicCatalogue(copy);
  return copy;
}
export async function publicData(
  page: PublicPage,
  locale: Locale,
  query: URLSearchParams,
  id?: string,
): Promise<PublicData> {
  const account = await currentAccount(),
    base = { page, locale, query: query.toString(), authenticated: !!account };
  if (page === 'catalogue')
    return {
      ...base,
      result: await publicCatalogue(catalogueQuery(query), account).then(
        (result) => ({ ...result, items: result.items.map(publicView) }),
      ),
    };
  if (page === 'project') {
    if (!id || !validPublicProjectQuery(query)) throw Error('NOT_FOUND');
    const p = await publicProject(await discovery().detail(id, account));
    let files: NonNullable<PublicData['files']> = [],
      fileError = false;
    try {
      files = (
        await (await nativeReader()).list({ kind: 'public' }, id, p.version)
      ).map(({ id, path, name, mime, size, uploadedLicense }) => ({
        id,
        path,
        name,
        mime,
        size,
        uploadedLicense: uploadedLicense === true,
      }));
    } catch {
      fileError = true;
    }
    if (
      !fileError &&
      query.has('directory') &&
      !files.some((f) => f.path.startsWith(query.get('directory')! + '/'))
    )
      throw Error('NOT_FOUND');
    return {
      ...base,
      project: publicView(p),
      files,
      fileError,
      entry: await publicAccess(account, p, locale),
    };
  }
  if (page === 'login')
    return {
      ...base,
      returnTo: safeAccountReturn(query.get('returnTo'), locale),
    };
  const selection = await showcase().read(new URLSearchParams(), account);
  const external =
    selection.mode === 'ranked'
      ? selection.main.filter((c) => c.tier === 'external')
      : [];
  const convert = async (c: (typeof selection.main)[number]) =>
    publicProject({
      ...c.publication,
      ...(c.summary ? { evaluation: c.summary } : {}),
    });
  const featured = external[0] ?? selection.main[0] ?? selection.recent[0];
  const feature = featured ? await convert(featured) : undefined;
  const seen = new Set(feature ? [feature.project] : []);
  const rows = [
    ...(external.length ? external.slice(1) : []),
    ...selection.main,
    ...selection.recent,
  ]
    .filter((c) => {
      if (seen.has(c.publication.project)) return false;
      seen.add(c.publication.project);
      return true;
    })
    .slice(0, 4);
  const topics = ['Accessibility', 'Research', 'Hardware', 'Software'];
  const counts = Object.fromEntries(
    await Promise.all(
      topics.map(async (q) => [
        q,
        (
          await discovery().list(
            new URLSearchParams({ q, pageSize: '1' }),
            account,
          )
        ).total,
      ]),
    ),
  );
  return {
    ...base,
    ...(query.get('q')?.trim()
      ? {
          result: await publicCatalogue(catalogueQuery(query), account).then(
            (result) => ({ ...result, items: result.items.map(publicView) }),
          ),
        }
      : {}),
    ...(feature ? { feature: publicView(feature) } : {}),
    continuation: (await Promise.all(rows.map(convert))).map(publicView),
    ranked: external.length > 0,
    counts,
  };
}

/** Explicit allowlist for browser presentation; repository policy/rubric/configuration details remain server-owned. */
export function publicView(p: Project): PublicProjectData {
  return {
    project: p.project,
    version: p.version,
    title: p.title,
    abstract: p.abstract,
    keywords: p.keywords,
    university: p.university,
    department: p.department,
    academicYear: p.academicYear,
    domain: p.domain,
    authors: p.authors,
    supervisor: p.supervisor,
    publishedAt: p.publishedAt,
    ...(Object.hasOwn(p, 'internal') ? { internal: p.internal } : {}),
    ...(p.publicCover ? { publicCover: p.publicCover } : {}),
    ...(p.evaluation
      ? {
          evaluation: {
            internal: p.evaluation.internal,
            n: p.evaluation.n,
            external: p.evaluation.external
              ? {
                  numerator: p.evaluation.external.numerator,
                  denominator: p.evaluation.external.denominator,
                }
              : null,
          },
        }
      : {}),
  };
}
