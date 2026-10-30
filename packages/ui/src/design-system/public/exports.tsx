'use client';
import {
  PublicModelProvider,
  type PublicModel,
  type Project,
} from './model.js';
import {
  Home,
  Catalogue,
  ProjectPage,
  Login,
  ObjectRecord,
  PlatformIntro,
  FeaturedRecord,
  Header,
  Footer,
  CatalogueResults,
} from './assemblies.js';
import { AuthorCredit } from './authors.js';
import {
  Cover,
  ViewControl,
  Pagination,
  Search,
  LoginFields,
  Facts,
} from './primitives.js';
import { Directory } from './content.js';
import * as Pieces from './primitives.js';
import { Reader, SourcePreview } from './reader.js';
import type { ComponentProps } from 'react';
export type {
  PublicModel,
  Project,
  FileEntry,
  Catalogue as CatalogueState,
} from './model.js';
export function PublicHome({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <Home />
    </PublicModelProvider>
  );
}
export function PublicHeader({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <Header />
    </PublicModelProvider>
  );
}
export function PlatformIntroduction({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <PlatformIntro />
    </PublicModelProvider>
  );
}
export function FeaturedProject({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <FeaturedRecord />
    </PublicModelProvider>
  );
}
export function PublicMetadata({
  model,
  project,
}: {
  model: PublicModel;
  project: Project;
}) {
  return (
    <PublicModelProvider model={model}>
      <Facts p={project} />
    </PublicModelProvider>
  );
}
export function PublicCatalogue({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <Catalogue />
    </PublicModelProvider>
  );
}
export function PublicProject({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <ProjectPage />
    </PublicModelProvider>
  );
}
export function PublicLogin({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <Login />
    </PublicModelProvider>
  );
}
export function ProjectCard({
  model,
  project,
  rank,
}: {
  model: PublicModel;
  project: Project;
  rank?: number;
}) {
  return (
    <PublicModelProvider model={model}>
      <ObjectRecord p={project} {...(rank === undefined ? {} : { rank })} />
    </PublicModelProvider>
  );
}
export function AuthorCredits({
  model,
  project,
  all = false,
}: {
  model: PublicModel;
  project: Project;
  all?: boolean;
}) {
  return (
    <PublicModelProvider model={model}>
      <AuthorCredit p={project} all={all} />
    </PublicModelProvider>
  );
}
export function ProjectMedia({
  model,
  project,
}: {
  model: PublicModel;
  project: Project;
}) {
  return (
    <PublicModelProvider model={model}>
      <Cover p={project} />
    </PublicModelProvider>
  );
}
export function GridListControl({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <ViewControl s={model.catalogue} />
    </PublicModelProvider>
  );
}
export function PaginationControl({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <Pagination s={model.catalogue} />
    </PublicModelProvider>
  );
}
export function SearchField({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <Search state={model.catalogue} />
    </PublicModelProvider>
  );
}
export function LoginForm({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <LoginFields />
    </PublicModelProvider>
  );
}
export function PublicFileReader({
  model,
  project,
}: {
  model: PublicModel;
  project: Project;
}) {
  return (
    <PublicModelProvider model={model}>
      <Reader p={project} />
    </PublicModelProvider>
  );
}
export function NativePreview({
  model,
  ...props
}: ComponentProps<typeof SourcePreview> & { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <SourcePreview {...props} />
    </PublicModelProvider>
  );
}

export function PublicChrome({
  model,
  children,
}: {
  model: PublicModel;
  children: import('react').ReactNode;
}) {
  return (
    <PublicModelProvider model={model}>
      <Header />
      {children}
      <Footer />
    </PublicModelProvider>
  );
}

export function PublicSection({
  model,
  part,
}: {
  model: PublicModel;
  part: string;
}) {
  const content =
    part === 'featured' ? (
      <FeaturedRecord />
    ) : part === 'selectionHeading' ? (
      <Pieces.SectionHead />
    ) : part === 'selection' ? (
      <>
        {!model.continuation.length && !model.integration?.literalMetadata && (
          <p dir="auto">
            {model.l(
              'There is no additional published work in this selection.',
              'لا توجد أعمال منشورة إضافية ضمن هذه المجموعة.',
            )}
          </p>
        )}
        {model.continuation.map((p, index) => (
          <ObjectRecord
            key={p.id}
            p={p}
            singleton={
              model.continuation.length > 1 &&
              model.continuation.length % 2 === 1 &&
              index === model.continuation.length - 1
            }
            {...(model.continuationRanks[p.id] === undefined
              ? {}
              : { rank: model.continuationRanks[p.id]! })}
          />
        ))}
      </>
    ) : part === 'directory' ? (
      <Directory />
    ) : part === 'filters' ? (
      <>
        <Pieces.QuickChips s={model.catalogue} />
        <Pieces.Filters s={model.catalogue} inline />
      </>
    ) : part === 'results' ? (
      <CatalogueResults />
    ) : part === 'resultCount' ? (
      model.catalogue.label
    ) : part === 'pagination' ? (
      <Pieces.Pagination s={model.catalogue} />
    ) : part === 'projectActions' ? (
      <Pieces.ProjectActions />
    ) : part === 'reader' && model.project ? (
      (model.integration?.reader ?? <Reader p={model.project} />)
    ) : part === 'rights' ? (
      model.integration?.rights
    ) : null;
  return <PublicModelProvider model={model}>{content}</PublicModelProvider>;
}

export { projectCount as formatPublicProjectCount } from './counts.js';
