import type { DiscoveryResult, PublicationProjection } from '@capstone/domain';
import type { Project, PublicFileItem, Locale } from '../public-archive/core';
export type PublicEntry = { kind: string; href: string; registration?: string };
export type PublicPage = 'home' | 'catalogue' | 'project' | 'login';
export type PublicProjectData = Pick<
  Project,
  | 'project'
  | 'version'
  | 'title'
  | 'abstract'
  | 'keywords'
  | 'university'
  | 'department'
  | 'academicYear'
  | 'domain'
  | 'authors'
  | 'supervisor'
  | 'publishedAt'
  | 'internal'
> & {
  publicCover?: import('@capstone/ui/visual-media').VisualImageView | null;
  evaluation?: {
    internal: { numerator: number; denominator: 20 } | null;
    n: number;
    external: { numerator: number; denominator: number } | null;
  };
};
export type PublicData = {
  requestId?: string;
  page: PublicPage;
  locale: Locale;
  query: string;
  authenticated: boolean;
  result?: Omit<DiscoveryResult, 'items'> & {
    items: PublicProjectData[];
    departmentsByUniversity?: Record<string, string[]>;
  };
  project?: PublicProjectData;
  files?: PublicFileItem[];
  fileError?: boolean;
  feature?: PublicProjectData;
  continuation?: PublicProjectData[];
  ranked?: boolean;
  counts?: Record<string, number>;
  entry?: PublicEntry;
  returnTo?: string;
};
export type PublicProjection = PublicationProjection;
