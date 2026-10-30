'use client';
import Link from 'next/link';
import { Accessibility, BookOpen, Cpu, Code2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { PublicModelProvider, useSite, type PublicModel } from './model';
import { Filters } from './filters';
import { CatalogueResults, CataloguePagination } from './catalogue';
import { PublicReader } from './reader';
import { ProjectActions } from './project';
import {
  PublicSearch,
  Authors,
  Score,
  Cover,
  OpenProject,
  ProjectCard,
} from './cards';
export { PublicCatalogue } from './catalogue';
export { PublicProject } from './project';
export function PublicHome({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <Home />
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
export function PublicSection({
  model,
  part,
}: {
  model: PublicModel;
  part: string;
}) {
  const content =
    part === 'featured' ? (
      <Featured />
    ) : part === 'selectionHeading' ? (
      <SelectionHeading />
    ) : part === 'selection' ? (
      <Selection />
    ) : part === 'directory' ? (
      <TopicsDirectory />
    ) : part === 'filters' ? (
      <Filters s={model.catalogue} />
    ) : part === 'results' ? (
      <CatalogueResults />
    ) : part === 'resultCount' ? (
      model.catalogue.label
    ) : part === 'pagination' ? (
      <CataloguePagination s={model.catalogue} />
    ) : part === 'reader' && model.project ? (
      (model.integration?.reader ?? <PublicReader p={model.project} />)
    ) : part === 'rights' ? (
      model.integration?.rights
    ) : part === 'projectActions' ? (
      <ProjectActions />
    ) : null;
  return <PublicModelProvider model={model}>{content}</PublicModelProvider>;
}
function Featured() {
  const { t, href, summary, flagship: p, integration } = useSite();
  if (!p) return integration?.emptyFeature ?? null;
  return (
    <Card className="pu-feature" data-ui="featured-project">
      <Link className="pu-feature-media" href={href('project', p.id)}>
        <Cover p={p} priority />
      </Link>
      <CardContent className="pu-feature-note">
        <span className="pu-eyebrow">{t('highestRated')}</span>
        <h2 dir="auto">{p.title}</h2>
        {integration?.aiSummary ? (
          integration.aiSummary(p, false)
        ) : (
          <p dir="auto">{summary(p)}</p>
        )}
        <Score p={p} />
        <div>
          <OpenProject p={p} />
        </div>
      </CardContent>
      <CardFooter className="pu-feature-footer">
        <Authors p={p} />
        <span>
          {p.university} · <bdi dir="ltr">{p.academicYear}</bdi>
        </span>
      </CardFooter>
    </Card>
  );
}
function SelectionHeading() {
  const { rankingHref, t, integration } = useSite();
  return (
    <div className="pu-section-head">
      <h2 dir="auto">{t('moreHighlyRated')}</h2>
      {!integration?.hideRankingLink && (
        <Button asChild variant="link" className="p-0 h-auto">
          <Link href={rankingHref}>{t('viewRanking')} ↗</Link>
        </Button>
      )}
    </div>
  );
}
function Selection() {
  const { continuation } = useSite();
  return (
    <>
      {continuation.map((p) => (
        <ProjectCard p={p} key={p.id} />
      ))}
    </>
  );
}
function TopicsDirectory() {
  const { topicCounts, t, href, ar } = useSite();
  const icons = {
    Accessibility,
    Research: BookOpen,
    Hardware: Cpu,
    Software: Code2,
  };
  return (
    <div className="pu-topics-grid">
      {['Accessibility', 'Research', 'Hardware', 'Software']
        .filter((topic) => (topicCounts[topic] ?? 0) > 0)
        .map((topic) => {
          const Icon = icons[topic as keyof typeof icons];
          return (
            <Link
              className="pu-topic-link"
              href={href('catalogue', undefined, { topic })}
              key={topic}
              dir={ar ? 'rtl' : 'ltr'}
            >
              <Card className="pu-topic">
                <span className="pu-topic-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <strong>{t(topic)}</strong>
                <span className="pu-topic-count">
                  {new Intl.NumberFormat(ar ? 'ar-SA-u-nu-arab' : 'en').format(
                    topicCounts[topic] ?? 0,
                  )}{' '}
                  {ar
                    ? (topicCounts[topic] ?? 0) === 1
                      ? 'مشروع منشور'
                      : 'مشاريع منشورة'
                    : (topicCounts[topic] ?? 0) === 1
                      ? 'published project'
                      : 'published projects'}
                </span>
                <ArrowRight
                  className="pu-topic-arrow"
                  size={16}
                  aria-hidden="true"
                />
              </Card>
            </Link>
          );
        })}
    </div>
  );
}
function Home() {
  const { t, l, href, integration, continuation, topicCounts } = useSite();
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <section className="pu-hero" data-ui="hero">
        <header className="pu-intro">
          <span className="pu-eyebrow">{t('platformEyebrow')}</span>
          <h1 dir="auto">{t('platformTitle')}</h1>
          <p dir="auto">{t('platformDescription')}</p>
        </header>
        <div className="pu-search-plinth">
          <PublicSearch />
          <Button
            asChild
            variant="link"
            className="justify-start p-0 h-auto w-fit"
          >
            <Link href={href('catalogue')}>{t('browseAll')} ↗</Link>
          </Button>
        </div>
        {integration?.featured ?? <Featured />}
      </section>
      <section
        className="pu-selection"
        id="ranked-publications"
        hidden={!continuation.length && !integration?.busy}
      >
        {integration?.selectionHeading ?? <SelectionHeading />}
        <div className="pu-home-grid">
          {integration?.selection ?? <Selection />}
        </div>
      </section>
      <section
        className="pu-topics"
        hidden={
          !Object.values(topicCounts).some((n) => n > 0) && !integration?.busy
        }
      >
        <div>
          <span className="pu-eyebrow">
            {l('Published subjects', 'موضوعات المشاريع المنشورة')}
          </span>
          <h2 dir="auto">{l('Explore by topic', 'استكشف حسب الموضوع')}</h2>
        </div>
        {integration?.directory ?? <TopicsDirectory />}
      </section>
    </main>
  );
}
function Login() {
  const { l, integration, ar } = useSite();
  return (
    <main id="main" tabIndex={-1} className="wrap">
      <div className="pu-login">
        <aside>
          <span className="pu-eyebrow">Capstone Repository</span>
          <h2 dir="auto">
            {l('Your work, connected.', 'مشاريعك ومهامك في مكان واحد.')}
          </h2>
          <p dir="auto">
            {l(
              'Public projects are open to everyone. Sign in to return to your workspace.',
              'المشاريع العامة متاحة للجميع. سجّل الدخول للعودة إلى مساحة عملك.',
            )}
          </p>
        </aside>
        <Card className="pu-login-card" dir={ar ? 'rtl' : 'ltr'}>
          <CardHeader>
            <span className="pu-eyebrow">
              {l('Your academic workspace', 'مساحة عملك الأكاديمية')}
            </span>
            <CardTitle>
              <h1 dir="auto">
                {l('Sign in to your account', 'تسجيل الدخول إلى حسابك')}
              </h1>
            </CardTitle>
            <CardDescription>
              {l(
                'Access your assigned projects and tasks.',
                'تابع مشاريعك ومهامك المخصصة لك.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>{integration?.loginForm}</CardContent>
        </Card>
      </div>
    </main>
  );
}
