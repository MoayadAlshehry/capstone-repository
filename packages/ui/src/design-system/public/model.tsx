'use client';
import { createContext, useContext, type Ref, type ReactNode } from 'react';
export type Project = {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  abstract: string;
  university: string;
  department: string;
  academicYear: string;
  domain: string;
  topics: string[];
  authors: { name: string }[];
  supervisor: string;
  publicationDate: string;
  coverAssetKey: string;
  coverImage?: import('../../visual-media.js').VisualImageView | null;
  mediaLookupHint: string;
  internalAssessment: {
    score: number | null;
    label: string;
    unavailable?: boolean;
  };
  independentAssessment: {
    unavailable?: boolean;
    score: number | null;
    completedReviews: number;
    complete: boolean;
    label: string;
  };
  publicFiles: FileEntry[];
  rights: {
    /** Historical accepted-reference data only; active rendering never infers reuse rights. */
    declaredLicense?: string;
    uploadedLicense?: { path: string; href: string };
    restrictedFileAccess: string;
    restrictedFilenamesPublic: boolean;
  };
};
export type FileEntry = {
  path: string;
  kind: string;
  contentKey: string;
  approxSizeBytes: number;
  sizeBytes: number;
  originalUrl: string;
};
export const facetKeys = [
  'university',
  'department',
  'academicYear',
  'domain',
  'author',
  'supervisor',
  'topic',
] as const;
export type Facet = (typeof facetKeys)[number];
export const facetLabel: Record<Facet, string> = {
  university: 'University',
  department: 'Department',
  academicYear: 'Academic year',
  domain: 'Domain',
  author: 'Author',
  supervisor: 'Supervisor',
  topic: 'Topic',
};
export type Catalogue = {
  query: string;
  sort: string;
  view: string;
  values: Record<Facet, string>;
  selections: Record<Facet, string[]>;
  result: Project[];
  rows: Project[];
  page: number;
  pages: number;
  count: number;
  label: string;
  active: [string, string][];
  update: (changes: Record<string, string | string[]>) => void;
  clear: () => void;
  options: (facet: Facet) => string[];
  optionLabel?: (facet: string, value: string) => string;
  remove: (key: string, value: string) => void;
  publicPersonKeys?: { author: string; supervisor: string };
};
/** Supplied presentation state. No ranking, fixture, URL, session or service is read here. */
export type PublicModel = {
  id: string;
  page: string;
  ar: boolean;
  t: (key: string) => string;
  l: (en: string, ar: string) => string;
  href: (
    page: string,
    project?: string,
    extra?: Record<string, string>,
  ) => string;
  back: () => string;
  localeHref: string;
  currentUrl: string;
  project: Project | undefined;
  flagship: Project | undefined;
  integration?: {
    literalMetadata?: boolean;
    readerRootRef?: Ref<HTMLElement>;
    aiSummary?: (project: Project, compact?: boolean) => ReactNode;
    aiActions?: ReactNode;
    aiOverview?: ReactNode;
    aiDiscovery?: ReactNode;
    avatar?: (project: Project, index: number, name: string) => ReactNode;
    featured?: ReactNode;
    selectionHeading?: ReactNode;
    directory?: ReactNode;
    filters?: ReactNode;
    results?: ReactNode;
    pagination?: ReactNode;
    resultCount?: ReactNode;
    projectActions?: ReactNode;

    initialDirectory?: string;
    publicationLabel?: string;
    nativeQuery?: [string, string][];
    searchValue?: string;
    onSearchValue?: (value: string) => void;
    hideRankingLink?: boolean;
    readerNotice?: ReactNode;
    reader?: ReactNode;
    filesPending?: boolean;
    sourceLabel?: string;
    publishedLabel?: string;
    selection?: ReactNode;
    chrome?: boolean;
    busy?: boolean;
    error?: ReactNode;
    emptyFeature?: ReactNode;
    loginUtilities?: ReactNode;
    loginForm?: ReactNode;
    preview?: ReactNode;
    rights?: ReactNode;
    entryHref?: string;
    entryLabel?: string;
    media?: (project: Project, priority: boolean) => ReactNode;
    sortOptions?: [string, string][];
    sortControl?: ReactNode;
    facets?: Facet[];
    multiple?: boolean;
    departmentsForUniversity?: (university: string) => string[];
    personFacet?: (
      kind: 'author' | 'supervisor',
      state: {
        value: string;
        key: string;
        university: string;
        department: string;
      },
      select: (value: string, key: string) => void,
    ) => ReactNode;
  };
  ranked: Project[];
  continuation: Project[];
  topicCounts: Record<string, number>;
  continuationRanks: Record<string, number | undefined>;
  rankingHref: string;
  rankingExplanation: string;
  previewNotice?: {
    title: string;
    body: string;
    linkHref: string;
    linkLabel: string;
  };
  missingProjectMessage: string;
  cover: (project: Project) => string;
  summary: (project: Project) => string;
  eligible: (project: Project) => boolean;
  catalogue: Catalogue;
  contents: Record<string, string>;
  syntaxTokens: Record<string, { content: string; color: string }[][]>;
  renderMarkdown: (content: string) => ReactNode;
  fileSelection: {
    requested: string | null;
    file: FileEntry | undefined;
    select: (path: string) => void;
  };
  navigate: (href: string) => void;
  submitLogin: (input: { email: string; password: string }) => Promise<string>;
  submitRecovery: (email: string) => Promise<string>;
  downloadAll: (project: Project) => void | Promise<void>;
  fileLink: (project: Project, path: string) => string;
};
const Context = createContext<PublicModel | null>(null);
export function PublicModelProvider({
  model,
  children,
}: {
  model: PublicModel;
  children: ReactNode;
}) {
  return <Context.Provider value={model}>{children}</Context.Provider>;
}
export function useSite() {
  const model = useContext(Context);
  if (!model) throw Error('A supplied public presentation model is required');
  return model;
}
export function useCatalogue() {
  return useSite().catalogue;
}
export function useUrlFile(project: Project) {
  void project;
  return useSite().fileSelection;
}
