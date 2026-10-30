'use client';
import { useSite, useCatalogue, type Project } from './model.js';
import * as U from './primitives.js';
import { Reader } from './reader.js';
import { Directory, Missing } from './content.js';

export function Header() {
  const { l, integration } = useSite();
  if (integration?.chrome === false) return null;
  return (
    <div className="pav-header-band">
      <header className="pav-header wrap" data-ui="site-header">
        <U.Logo />
        <span>{l('The public archive', 'الأرشيف العام')}</span>
        <U.Nav />
      </header>
    </div>
  );
}
export function Footer() {
  const { l, integration } = useSite();
  if (integration?.chrome === false) return null;
  return (
    <footer className="pav-footer foot wrap" data-ui="site-footer">
      <U.Logo />
      <div>
        <h2 dir="auto">{l('Keep exploring.', 'واصل الاكتشاف.')}</h2>
        <nav
          className="foot-links"
          aria-label={l('Footer navigation', 'تنقّل التذييل')}
        >
          <U.FooterLinks />
        </nav>
      </div>
      <U.FictionalNotice />
    </footer>
  );
}
export function ObjectRecord({
  p,
  rank,
  singleton,
}: {
  p: Project;
  rank?: number;
  singleton?: boolean;
}) {
  const { href, summary, t, integration } = useSite();
  return (
    <article
      className="pav-object"
      id={'project-' + p.id}
      data-id={p.id}
      data-project-id={p.id}
      data-ui="project-card"
      data-singleton={singleton || undefined}
    >
      <a className="result-media" href={href('project', p.id)}>
        <U.Cover p={p} />
      </a>
      <div className="pav-object-sheet">
        <span className="eyebrow">
          {rank ? String(rank).padStart(2, '0') + ' / ' : ''}
          {t(p.department)} · <bdi dir="ltr">{p.academicYear}</bdi>
        </span>
        <h3 dir="auto">
          <a href={href('project', p.id)}>{p.title}</a>
        </h3>
        {integration?.aiSummary ? (
          integration.aiSummary(p, true)
        ) : (
          <p dir="auto">{summary(p)}</p>
        )}
        <U.Byline p={p} />
        <small>{p.university}</small>
      </div>
      <div className="pav-object-end">
        <U.Score p={p} />
        <U.Open p={p} />
      </div>
    </article>
  );
}
export function Home() {
  const { l, continuation, continuationRanks, integration, topicCounts } =
    useSite();
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="wrap">
        <section className="pav-pavilion" data-ui="hero">
          <PlatformIntro />
          {integration?.featured ?? <FeaturedRecord />}
        </section>
        <section
          className="pav-selection"
          id="ranked-publications"
          hidden={
            integration?.literalMetadata &&
            !continuation.length &&
            !integration.busy
          }
        >
          {integration?.selectionHeading ?? <U.SectionHead />}
          <div>
            {integration?.selection ??
              continuation.map((p, index) => (
                <ObjectRecord
                  key={p.id}
                  p={p}
                  singleton={
                    continuation.length > 1 &&
                    continuation.length % 2 === 1 &&
                    index === continuation.length - 1
                  }
                  {...(continuationRanks[p.id] === undefined
                    ? {}
                    : { rank: continuationRanks[p.id]! })}
                />
              ))}
          </div>
          <U.RankingInfo />
        </section>
        <section
          className="pav-threshold"
          hidden={
            integration?.literalMetadata &&
            !Object.values(topicCounts).some((n) => n > 0) &&
            !integration.busy
          }
        >
          <div>
            <span className="eyebrow">
              {integration?.literalMetadata
                ? l('Published subjects', 'موضوعات المشاريع المنشورة')
                : l('The next doorway', 'الباب التالي')}
            </span>
            <h2 dir="auto">
              {integration?.literalMetadata
                ? l('Explore by topic', 'استكشف حسب الموضوع')
                : l(
                    'Follow a subject into the archive.',
                    'اتبع موضوعًا إلى داخل الأرشيف.',
                  )}
            </h2>
          </div>
          {integration?.directory ?? <Directory />}
        </section>
      </main>
      <Footer />
    </>
  );
}
export function Catalogue() {
  const s = useCatalogue(),
    { t, l, integration } = useSite();
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="wrap pav-catalogue">
        <header className="pav-collection-heading">
          <div>
            <span className="eyebrow">
              {integration?.literalMetadata
                ? l('Published collection', 'مجموعة المشاريع المنشورة')
                : l('Collection shelves', 'رفوف المجموعة')}
            </span>
            <h1 dir="auto">{t('catalogue')}</h1>
          </div>
          <U.Search state={s} />
        </header>
        <div className="pav-department-shelf">
          {integration?.filters ?? (
            <>
              <U.QuickChips s={s} />
              <U.Filters s={s} inline />
            </>
          )}
        </div>
        <U.Chips s={s} />
        <U.Tools s={s} />
        {integration?.results ?? <CatalogueResults />}
        {integration?.pagination ?? <U.Pagination s={s} />}
      </main>
      <Footer />
    </>
  );
}
export function ProjectPage() {
  const { project: p, t, l, summary, integration } = useSite();
  if (!p) return <Missing />;
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="wrap pav-project">
        <U.Back />
        <header className="pav-publication">
          <div>
            <span className="eyebrow">
              {t('Published')} ·{' '}
              <bdi dir="ltr">
                {integration?.publishedLabel ?? p.publicationDate}
              </bdi>
            </span>
            <h1 dir="auto">{p.title}</h1>
            {!integration?.literalMetadata && <p dir="auto">{summary(p)}</p>}
          </div>
          {integration?.projectActions ?? <U.ProjectActions />}
          {integration?.aiActions}
        </header>
        <figure className="pav-panorama">
          <U.Cover p={p} priority />
          <figcaption>
            <U.Byline p={p} all />
            <span>
              {l(
                'Published work / public archive',
                'عمل منشور / الأرشيف العام',
              )}
            </span>
          </figcaption>
        </figure>
        <div className="pav-academic-strip">
          <U.Facts p={p} />
        </div>
        <div className="pav-chapters">
          <aside>
            <span className="eyebrow">
              {l('In this record', 'في هذا السجل')}
            </span>
            <U.SectionNav
              {...(integration?.literalMetadata
                ? {
                    items: [
                      'overview',
                      'people',
                      'assessments',
                      'files',
                      'rights',
                    ],
                  }
                : {})}
            />
          </aside>
          <div className="pav-chapter-body">
            <U.Overview p={p} />
            <U.People p={p} />
            {integration?.literalMetadata && <U.Assessments p={p} />}
            {integration && <span id="public-files" />}
            {integration?.reader ?? <Reader p={p} />}
            {!integration?.literalMetadata && <U.Assessments p={p} />}
            <U.Rights p={p} />
            {integration?.rights}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
export function Login() {
  const { l, integration } = useSite();
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="wrap">
        <div className="pav-portal">
          <aside>
            <span className="eyebrow">Capstone Repository</span>
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
          <section className="login-copy">
            <span className="eyebrow">
              {l('Your academic workspace', 'مساحة عملك الأكاديمية')}
            </span>
            <h1 dir="auto">
              {l('Sign in to your account', 'تسجيل الدخول إلى حسابك')}
            </h1>
            <p dir="auto">
              {l(
                'Access your assigned projects and tasks.',
                'تابع مشاريعك ومهامك المخصصة لك.',
              )}
            </p>
            {integration?.loginForm ?? <U.LoginFields />}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function PlatformIntro() {
  const { t, l, integration } = useSite();
  return (
    <>
      <header className="pav-statement">
        <span className="eyebrow">{t('platformEyebrow')}</span>
        <h1 dir="auto">
          {integration?.literalMetadata ? (
            t('platformTitle')
          ) : (
            <>
              {l('An open archive.', 'أرشيف مفتوح.')}
              <span>{l('A place to begin.', 'ومساحة للبداية.')}</span>
            </>
          )}
        </h1>
        <p dir="auto" className="platform-description">
          {t('platformDescription')}
        </p>
      </header>
      <div className="pav-search-plinth">
        <U.Search />
        <U.Browse />
      </div>
    </>
  );
}
export function FeaturedRecord() {
  const { t, href, summary, flagship, integration } = useSite();
  if (!flagship) return integration?.emptyFeature ?? null;
  return (
    <>
      <article className="pav-window">
        <a href={href('project', flagship.id)}>
          <U.Cover p={flagship} priority />
        </a>
        <div className="pav-window-note">
          <span className="eyebrow">{t('highestRated')}</span>
          <h2 dir="auto">{flagship.title}</h2>
          {integration?.aiSummary ? (
            integration.aiSummary(flagship, false)
          ) : (
            <p dir="auto">{summary(flagship)}</p>
          )}
          <U.Score />
          <U.Open />
        </div>
        <div className="pav-provenance">
          <U.Byline />
          <span>
            {flagship.university} · <bdi dir="ltr">{flagship.academicYear}</bdi>
          </span>
        </div>
      </article>
    </>
  );
}

export function CatalogueResults() {
  const s = useCatalogue(),
    { integration } = useSite();
  return (
    <>
      {integration?.busy || integration?.error ? (
        integration.error
      ) : s.count ? (
        <div className="pav-results results" data-view={s.view}>
          {s.rows.map((p) => (
            <ObjectRecord p={p} key={p.id} />
          ))}
        </div>
      ) : (
        <U.Empty s={s} />
      )}
    </>
  );
}
