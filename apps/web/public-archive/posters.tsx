import { getTranslations } from 'next-intl/server';
import { projectPath, type Project, type Locale } from './core';
export function PublicArtwork({
  p,
  eager = false,
}: {
  p: Project;
  eager?: boolean;
}) {
  const image = p.publicCover?.src.startsWith('/api/visual-media/image?')
    ? p.publicCover
    : null;
  return (
    <div className="lra-art" aria-hidden="true">
      {image && (
        <img
          src={image.src}
          srcSet={
            image.smallWidth !== image.width
              ? `${image.smallSrc} ${image.smallWidth}w, ${image.src} ${image.width}w`
              : undefined
          }
          sizes="(max-width: 767px) 100vw, 65vw"
          width={image.width}
          height={image.height}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          decoding="async"
          alt=""
        />
      )}
    </div>
  );
}
export async function ProjectEditorialTile({
  p,
  locale,
  kind = 'standard',
  href,
  eager = false,
}: {
  p: Project;
  locale: Locale;
  kind?: 'lead' | 'secondary' | 'standard' | 'row';
  href?: string;
  eager?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'Archive' });
  const image = (
    <div className="lra-art-window">
      <PublicArtwork p={p} eager={eager} />
      <span className="lra-project-open">{t('project.view')} ↗</span>
    </div>
  );
  const copy = (
    <div className="lra-editorial-copy">
      <p dir="auto" className="lra-project-context">
        <bdi>{locale === 'ar' ? p.university.nameAr : p.university.nameEn}</bdi>
        <span>
          <bdi>{p.academicYear}</bdi> / {p.department.code} /{' '}
          {t('project.creatorCount', { count: p.authors.length })}
        </span>
      </p>
      <span className="lra-sr">
        {p.authors.map((person) => person.name).join(' · ')}
      </span>
      <h3 dir="auto">{p.title}</h3>
      {kind === 'row' && (
        <p className="lra-project-excerpt" dir="auto">
          {p.abstract}
        </p>
      )}
    </div>
  );
  return (
    <article
      className={'lra-editorial lra-editorial--' + kind}
      id={'project-' + p.project}
    >
      <a
        href={href ?? projectPath(locale, p.project)}
        className="lra-project-link"
      >
        {kind === 'lead' || kind === 'secondary' ? (
          <>
            {copy}
            {image}
          </>
        ) : (
          <>
            {image}
            {copy}
          </>
        )}
      </a>
    </article>
  );
}
