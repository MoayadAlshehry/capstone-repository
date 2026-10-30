import { getTranslations } from 'next-intl/server';
import { ResearchStageMotion } from './stage';
import { ProjectEditorialTile, PublicArtwork } from './posters';
import { ArchiveSearch } from './search';
import { projectPath, type Project, type Locale } from './core';
export async function ArchiveHome({
  locale,
  recent,
  error = false,
}: {
  locale: Locale;
  recent: Project[];
  error?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'Archive' }),
    primary = recent[0],
    rest = recent.slice(1, 7);
  return (
    <>
      <section className="lra-home-intro">
        <div className="lra-statement">
          <p dir="auto" className="lra-eyebrow">
            {t('home.eyebrow')}
          </p>
          <h1 dir="auto">
            {locale === 'ar' ? (
              <>
                أبعد من
                <br /> عنوان المشروع<span>.</span>
              </>
            ) : (
              <>
                Beyond
                <br /> the title<span>.</span>
              </>
            )}
          </h1>
          <p dir="auto" className="lra-deck">
            {t('home.description')}
          </p>
          <ArchiveSearch locale={locale} />
          <a className="lra-home-explore" href={`/${locale}/catalogue`}>
            {t('home.exploreAll')} <span aria-hidden="true">↗</span>
          </a>
        </div>
        <ResearchStageMotion>
          <div className="lra-stage-rule" aria-hidden="true" />
          <p dir="auto" className="lra-stage-label">
            {t('home.featureLabel')}
          </p>
          <div className="lra-object-field">
            {recent.slice(0, 3).map((p, i) => (
              <div
                data-stage-mount
                className={'lra-layer lra-layer-' + i}
                key={p.project}
              >
                <div data-stage-shift>
                  {i === 0 ? (
                    <a
                      href={projectPath(locale, p.project)}
                      aria-label={p.title}
                    >
                      <PublicArtwork p={p} eager />
                    </a>
                  ) : (
                    <div aria-hidden="true">
                      <PublicArtwork p={p} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!primary && (
              <div className="lra-empty-object" data-stage-mount>
                <div className="lra-art" aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="lra-stage-identity">
            {error ? (
              <>
                <h2 dir="auto">{t('catalogue.failedTitle')}</h2>
                <a href={`/${locale}`}>{t('common.retry')}</a>
              </>
            ) : primary ? (
              <>
                <p dir="auto">
                  {locale === 'ar'
                    ? primary.university.nameAr
                    : primary.university.nameEn}
                </p>
                <h2 dir="auto">
                  <a href={projectPath(locale, primary.project)}>
                    {primary.title}
                  </a>
                </h2>
                <a
                  className="lra-stage-action"
                  href={projectPath(locale, primary.project)}
                >
                  {t('project.view')} <span aria-hidden="true">↗</span>
                </a>
              </>
            ) : (
              <>
                <h2 dir="auto">{t('home.emptyTitle')}</h2>
                <p dir="auto">{t('home.emptyText')}</p>
                <a className="lra-stage-action" href={`/${locale}/catalogue`}>
                  {t('home.exploreAll')} ↗
                </a>
              </>
            )}
          </div>
        </ResearchStageMotion>
      </section>
      {rest.length > 0 && (
        <section className="lra-collection" data-archive-reveal>
          <div className="lra-section-masthead">
            <h2 dir="auto">{t('home.collectionTitle')}</h2>
            <a href={`/${locale}/catalogue`}>{t('common.viewAll')} ↗</a>
          </div>
          <div className="lra-editorial-grid">
            {rest.map((p, i) => (
              <ProjectEditorialTile
                key={p.project}
                p={p}
                locale={locale}
                kind={
                  i % 5 === 0 ? 'lead' : i % 5 === 1 ? 'secondary' : 'standard'
                }
              />
            ))}
          </div>
        </section>
      )}
      <section className="lra-pathways" data-archive-reveal>
        <div>
          <p dir="auto" className="lra-eyebrow">
            Capstone Repository
          </p>
          <h2 dir="auto">{t('home.howTitle')}</h2>
        </div>
        <ol>
          {['Discover', 'Read', 'Access'].map((word, i) => (
            <li key={word}>
              <span aria-hidden="true">0{i + 1}</span>
              <h3 dir="auto">{t(`home.how${word}Title`)}</h3>
              <p dir="auto">{t(`home.how${word}Text`)}</p>
              <a href={`/${locale}/catalogue`}>{t('nav.explore')} ↗</a>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
