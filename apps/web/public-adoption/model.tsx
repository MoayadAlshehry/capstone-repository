'use client';
import { formatPublicProjectCount } from '@capstone/ui/design-system/client';
import { parsePublicCatalogue } from './discovery-query';
import type {
  PublicModel,
  Project as ViewProject,
  CatalogueState,
} from '@capstone/ui/design-system/client';
import type { PublicData } from './types';
import type { PublicProjectData as Project } from './types';
import copy from './copy.json';
import { uploadedLicenseFile } from '@capstone/domain/native-files';
import { dictionary } from './dictionary';
export function projectView(
  p: Project,
  locale: 'en' | 'ar',
  files: PublicData['files'] = [],
): ViewProject {
  const s = p.evaluation,
    ar = locale === 'ar',
    originalLicense = uploadedLicenseFile(files);
  return {
    id: p.project,
    slug: p.project,
    title: p.title,
    tagline: p.abstract,
    abstract: p.abstract,
    university: ar ? p.university.nameAr : p.university.nameEn,
    department: p.department.code,
    academicYear: p.academicYear,
    domain: p.domain,
    topics: p.keywords,
    authors: [...p.authors]
      .sort((a, b) => a.order - b.order)
      .map(({ name }) => ({ name })),
    supervisor: p.supervisor.name,
    publicationDate: p.publishedAt,
    coverAssetKey: p.publicCover?.src ?? '',
    coverImage: p.publicCover ?? null,
    mediaLookupHint: '',
    internalAssessment: {
      score: s?.internal
        ? s.internal.numerator / s.internal.denominator
        : (p.internal ?? null),
      label: 'Internal assessment',
      unavailable: !s && !Object.hasOwn(p, 'internal'),
    },
    independentAssessment: {
      score: s?.external ? s.external.numerator / s.external.denominator : null,
      completedReviews: s?.n ?? 0,
      unavailable: !s,
      complete: !!s?.external && s.n >= 2,
      label: 'Independent assessment',
    },
    publicFiles: files.map((f) => ({
      path: f.path,
      kind: /\.md$/i.test(f.path)
        ? 'md'
        : /\.csv$/i.test(f.path)
          ? 'csv'
          : f.mime.startsWith('audio/')
            ? 'audio'
            : f.mime.startsWith('video/')
              ? 'video'
              : f.mime.startsWith('image/')
                ? 'image'
                : f.mime === 'application/pdf'
                  ? 'pdf'
                  : /\.(docx|pptx)$/i.test(f.path)
                    ? 'original'
                    : 'code',
      contentKey: f.id,
      approxSizeBytes: f.size,
      sizeBytes: f.size,
      originalUrl:
        '/api/public-files?' +
        new URLSearchParams({
          project: p.project,
          version: p.version,
          file: f.id,
          mode: 'original',
        }),
    })),
    rights: {
      ...(originalLicense
        ? {
            uploadedLicense: {
              path: originalLicense.path,
              href:
                '/api/public-files?' +
                new URLSearchParams({
                  project: p.project,
                  version: p.version,
                  file: originalLicense.id,
                  mode: 'original',
                }),
            },
          }
        : {}),
      restrictedFileAccess: 'request',
      restrictedFilenamesPublic: false,
    },
  };
}
const facets = [
  'university',
  'department',
  'academicYear',
  'domain',
  'author',
  'supervisor',
  'topic',
] as const;
export function makeModel(
  data: PublicData,
  query: URLSearchParams,
  update: (changes: Record<string, string | string[]>) => void,
): PublicModel {
  const ar = data.locale === 'ar',
    l = (en: string, arabic: string) => (ar ? arabic : en);
  const table = copy[ar ? 'ar' : 'en'] as Record<string, string>;
  const t = (k: string) => {
    if (k === 'highestRated' && !data.ranked)
      return l('Published project', 'مشروع منشور');
    if (k === 'noResults' && data.result?.publicCount === 0)
      return l(
        'No projects have been published yet.',
        'لا توجد مشاريع منشورة حتى الآن.',
      );
    if (k === 'moreHighlyRated')
      return l('More published projects', 'المزيد من المشاريع المنشورة');
    if (k === 'viewRanking')
      return l('Explore all projects', 'استكشف جميع المشاريع');
    if (data.ranked && k === 'viewRanking')
      return l('View ranked selection', 'عرض المجموعة المرتبة');
    if (!data.ranked && data.page === 'home') {
      if (k === 'moreHighlyRated')
        return l('More published work', 'المزيد من الأعمال المنشورة');
      if (k === 'viewRanking')
        return l('Explore the collection', 'استكشف المجموعة');
    }
    const domains: Record<string, string> = {
      software: l('Software', 'برمجيات'),
      data: l('Data', 'بيانات'),
      hardware: l('Hardware', 'عتاد'),
      CS: l('Computer Science', 'علوم الحاسب'),
      IS: l('Information Systems', 'نظم المعلومات'),
      CE: l('Computer Engineering', 'هندسة الحاسب'),
    };
    if (domains[k]) return domains[k];
    return table[k] ?? (ar ? dictionary[k] : undefined) ?? k;
  };
  const href = (
    page: string,
    id?: string,
    extra: Record<string, string> = {},
  ) => {
    const p = new URLSearchParams(extra);
    // A subject is a literal search term, not an invented taxonomy/ranking filter.
    if (p.has('topic')) {
      p.set('q', p.get('topic')!);
      p.delete('topic');
    }
    const path =
      '/' +
      data.locale +
      (page === 'home'
        ? ''
        : page === 'project'
          ? '/catalogue/' + encodeURIComponent(id ?? '')
          : '/' + page);
    if (page === 'project' && data.page === 'catalogue')
      p.set(
        'from',
        '/' + data.locale + '/catalogue' + (query.size ? '?' + query : ''),
      );
    return path + (p.size ? '?' + p : '');
  };
  const values = Object.fromEntries(
    facets.map((k) => [k, query.get(k) ?? '']),
  ) as CatalogueState['values'];
  const result = data.result,
    rows = (result?.items ?? []).map((p) => projectView(p, data.locale));
  const optionMap: Record<string, string[]> = {
    university: (result?.facets.universities ?? []).map((v) => v.nameEn),
    department: (result?.facets.departments ?? []).map((v) => v.code),
    academicYear: result?.facets.academicYears ?? [],
    domain: result?.facets.domains ?? [],
    author: result?.facets.authors ?? [],
    supervisor: result?.facets.supervisors ?? [],
    topic: [],
  };
  const selections = Object.fromEntries(
    facets.map((k) => [k, values[k] ? [values[k]] : []]),
  ) as CatalogueState['selections'];
  const cat: CatalogueState = {
    query: query.get('q') ?? '',
    sort: query.get('sort') ?? 'newest',
    view: query.get('view') ?? 'grid',
    values,
    selections,
    result: rows,
    rows,
    page: result?.page ?? 1,
    pages: Math.max(
      1,
      Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 12)),
    ),
    count: result?.total ?? 0,
    label: formatPublicProjectCount(result?.total ?? 0, ar),
    active: [
      ...[...query].filter(
        ([k, v]) =>
          !!v &&
          ![
            'view',
            'sort',
            'page',
            'pageSize',
            'assistance',
            'aiDrop',
            'aiPick',
            'authorKey',
            'supervisorKey',
          ].includes(k),
      ),
      ...(['author', 'supervisor'] as const)
        .filter((kind) => query.has(kind + 'Key') && !query.get(kind))
        .map(
          (kind) =>
            [
              kind,
              kind === 'author'
                ? l('Selected author', 'المؤلف المختار')
                : l('Selected supervisor', 'المشرف المختار'),
            ] as [string, string],
        ),
    ],
    update,
    clear: () =>
      update(
        Object.fromEntries(
          [...facets, 'q', 'page', 'authorKey', 'supervisorKey'].map((k) => [
            k,
            '',
          ]),
        ),
      ),
    options: (k) => optionMap[k] ?? [],
    optionLabel: (key, value) =>
      key === 'university'
        ? ((ar
            ? result?.facets.universities.find((v) => v.nameEn === value)
                ?.nameAr
            : undefined) ?? value)
        : key === 'department' || key === 'domain'
          ? t(value)
          : value,
    remove: (key) =>
      update({
        [key]: '',
        ...(['author', 'supervisor'].includes(key)
          ? { [key + 'Key']: '' }
          : {}),
      }),
    publicPersonKeys: {
      author: query.get('authorKey') ?? '',
      supervisor: query.get('supervisorKey') ?? '',
    },
  };
  const pp = data.project
    ? projectView(data.project, data.locale, data.files)
    : undefined;
  const model: PublicModel = {
    id: '02',
    page: data.page,
    ar,
    t,
    l,
    href,
    back: () => safeBack(query.get('from'), data.locale),
    localeHref:
      '/' +
      (ar ? 'en' : 'ar') +
      (data.page === 'home'
        ? ''
        : data.page === 'project'
          ? '/catalogue/' + data.project?.project
          : '/' + data.page) +
      (query.size ? '?' + query : ''),
    currentUrl: 'http://public.invalid/' + data.locale,
    project: pp,
    flagship: data.feature ? projectView(data.feature, data.locale) : undefined,
    ranked: [],
    continuation: (data.continuation ?? []).map((p) =>
      projectView(p, data.locale),
    ),
    topicCounts: data.counts ?? {},
    continuationRanks: {},
    rankingHref: href('catalogue'),
    rankingExplanation: l(
      'Selection uses the existing public showcase policy and its bounded, institution-aware selection (up to 12 records). Independent and internal assessments remain separate; missing assessments are never zero.',
      'يستخدم الاختيار سياسة العرض العامة الحالية. تبقى التقييمات المستقلة والداخلية منفصلة، ولا تُستبدل التقييمات المفقودة بصفر.',
    ),
    missingProjectMessage: l(
      'This published record is unavailable.',
      'هذا السجل المنشور غير متاح.',
    ),
    cover: (p) => p.coverAssetKey,
    summary: (p) => {
      const characters = Array.from(p.abstract.trim());
      if (characters.length <= 220) return p.abstract;
      const prefix = characters.slice(0, 220).join(''),
        word = prefix.lastIndexOf(' ');
      return prefix.slice(0, word > 150 ? word : prefix.length) + '…';
    },
    eligible: (p) =>
      p.independentAssessment.complete &&
      p.independentAssessment.score !== null,
    catalogue: cat,
    contents: {},
    syntaxTokens: {},
    renderMarkdown: (content) => content,
    fileSelection: {
      requested: null,
      file: pp?.publicFiles[0],
      select: () => {},
    },
    navigate: () => {},
    submitLogin: async () => {
      throw Error('Real form required');
    },
    submitRecovery: async () => {
      throw Error('Use the recovery route');
    },
    downloadAll: () => {},
    fileLink: () => '',
    integration: {
      chrome: false,
      facets: [
        'university',
        'department',
        'academicYear',
        'domain',
        'author',
        'supervisor',
      ],
      multiple: false,
      departmentsForUniversity: (name) =>
        name
          ? Array.isArray(data.result?.departmentsByUniversity?.[name])
            ? data.result!.departmentsByUniversity![name]!
            : []
          : [
              ...new Set(
                Object.values(
                  data.result?.departmentsByUniversity ?? {},
                ).flat(),
              ),
            ],
      sortOptions: [
        ['newest', 'newest'],
        ['highest', 'Highest rated'],
        ['popular', 'Most popular'],
      ],
    },
  };
  return model;
}
export function safeBack(value: string | null, locale: string) {
  const fallback = '/' + locale + '/catalogue';
  if (!value || value.length > 20000) return fallback;
  try {
    const u = new URL(value, 'https://return.invalid');
    if (
      u.origin !== 'https://return.invalid' ||
      !/^\/(en|ar)\/catalogue$/.test(u.pathname) ||
      u.hash
    )
      return fallback;
    const check = new URLSearchParams(u.searchParams),
      view = check.get('view');
    if (
      check.getAll('view').length > 1 ||
      (view !== null && !['grid', 'list'].includes(view))
    )
      return fallback;
    check.delete('view');
    parsePublicCatalogue(check);
    return fallback + u.search;
  } catch {
    return fallback;
  }
}
