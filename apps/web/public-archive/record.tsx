import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFact, BidiFacts } from '@capstone/ui/bidi';
import { formatScore } from '@capstone/ui/score-format';
import { getTranslations } from 'next-intl/server';
import { PersonAvatar } from '@capstone/ui/visual-media';
import type { ReactNode } from 'react';
import { PublicArtwork } from './posters';
import { ShareLink } from './actions';
import {
  independentState,
  projectPath,
  domainLabel,
  type Project,
  type Locale,
} from './core';
import type { PublicEntry } from './access';
export async function PublicRecord({
  locale,
  p,
  backHref,
  files,
  entry,
  fileCount,
  fileError = false,
}: {
  locale: Locale;
  p: Project;
  backHref: string;
  files: ReactNode;
  entry: PublicEntry;
  fileCount: number;
  fileError?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: 'Archive' }),
    s = p.evaluation,
    state = independentState(p),
    score = (
      value: { numerator: number; denominator: number } | null | undefined,
    ) =>
      value ? formatScore(value.numerator / value.denominator, locale) : null;
  return (
    <article className="lra-record">
      <a className="lra-back" href={backHref}>
        ←{' '}
        {t(backHref.includes('?') ? 'nav.backToResults' : 'nav.backToLibrary')}
      </a>
      <header className="lra-record-title">
        <p dir="auto" className="lra-eyebrow">
          {t('project.published')} / {domainLabel(p.domain, locale)}
        </p>
        <h1 dir="auto">{p.title}</h1>
        <div className="lra-record-entry">
          <a
            className="lra-solid-action"
            href={fileCount || fileError ? '#public-files' : '#overview'}
          >
            {t(
              fileCount || fileError
                ? 'project.readFiles'
                : 'project.readOverview',
            )}{' '}
            <span aria-hidden="true">↗</span>
          </a>
          <ShareLink
            path={projectPath(locale, p.project)}
            label={t('project.share')}
          />
          {!fileCount && !fileError && (
            <span className="lra-quiet">{t('project.overviewOnly')}</span>
          )}
        </div>
      </header>
      <div className="lra-record-opening">
        <figure>
          <PublicArtwork p={p} eager />
        </figure>
        <aside className="lra-provenance">
          <div>
            <span>{t('filters.university')}</span>
            <p dir="auto">
              {locale === 'ar' ? p.university.nameAr : p.university.nameEn}
            </p>
          </div>
          <div>
            <span>{t('filters.department')}</span>
            <p dir="auto">
              {locale === 'ar' ? p.department.nameAr : p.department.nameEn}
            </p>
          </div>
          <div>
            <span>{t('filters.year')}</span>
            <p dir="auto">
              <bdi>{p.academicYear}</bdi>
            </p>
          </div>
          <div>
            <span>{t('project.published')}</span>
            <p dir="auto">
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeZone: 'UTC',
                calendar: 'gregory',
              }).format(new Date(p.publishedAt))}
            </p>
          </div>
          <a href="#team">{t('project.meetTeam')} ↗</a>
        </aside>
      </div>
      <nav className="lra-record-nav" aria-label={t('project.overview')}>
        <a href="#overview">{t('project.overview')}</a>
        <a href="#public-files">{t('project.files')}</a>
        <a href="#team">{t('project.team')}</a>
      </nav>
      <section id="overview" className="lra-record-body">
        <div>
          <h2 dir="auto">{t('project.abstract')}</h2>
          {p.abstract ? (
            <p className="lra-abstract" dir="auto">
              {p.abstract}
            </p>
          ) : (
            <p dir="auto">
              {locale === 'ar'
                ? 'لا يتوفر ملخص عام لهذا المشروع.'
                : 'A public summary is not available for this project.'}
            </p>
          )}
          {p.keywords.length > 0 && (
            <ul className="lra-keywords" aria-label={t('project.keywords')}>
              {p.keywords.map((k) => (
                <li key={k}>
                  <bdi>{k}</bdi>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section
        className="lra-assessment-band"
        aria-label={t('assessment.title')}
      >
        <h2 dir="auto">{t('assessment.title')}</h2>
        <BidiFacts>
          <BidiFact>
            <BidiLabel dir="auto">{t('assessment.internal')}</BidiLabel>
            <BidiData dir="auto">
              {score(s?.internal) !== null ? (
                <>
                  <strong>{score(s?.internal)}</strong>
                  <span dir="ltr"> /100</span>
                </>
              ) : (
                t('assessment.unavailable')
              )}
            </BidiData>
          </BidiFact>
          <BidiFact>
            <BidiLabel dir="auto">{t('assessment.independent')}</BidiLabel>
            <BidiData dir="auto">
              {state === 'released' ? (
                <>
                  <strong>{score(s?.external)}</strong>
                  <span dir="ltr"> /100</span>
                </>
              ) : (
                t('assessment.' + state)
              )}
            </BidiData>
          </BidiFact>
        </BidiFacts>
        <details>
          <summary>{t('assessment.about')}</summary>
          <p dir="auto">
            {t('assessment.note')} {t('assessment.explanation')}
          </p>
          {s && s.n > 0 && (
            <p dir="auto">{t('assessment.reviews', { count: s.n })}</p>
          )}
        </details>
      </section>
      {files}
      <section className="lra-rights" aria-label={t('rights.title')}>
        <div>
          <h3 dir="auto">{t('rights.title')}</h3>
          <p dir="auto" className="lra-quiet">
            {t('rights.short')}
          </p>
        </div>
        {entry.kind !== 'none' && (
          <div className="lra-access">
            <h3 dir="auto">{t('access.title')}</h3>
            {entry.kind === 'failed' ? (
              <>
                <p dir="auto" role="alert">
                  {t('access.failed')}
                </p>
                <a href={entry.href}>{t('common.retry')}</a>
              </>
            ) : (
              <>
                {['signIn', 'request', 'requestAgain'].includes(entry.kind) && (
                  <p dir="auto" className="lra-quiet">
                    {t('access.description')}
                  </p>
                )}
                {entry.kind === 'viewRequest' && (
                  <p dir="auto">{t('access.pending')}</p>
                )}
                <a className="lra-text-action" href={entry.href}>
                  {t('access.' + entry.kind)} <span aria-hidden="true">↗</span>
                </a>
                {entry.registration && (
                  <a className="lra-access-register" href={entry.registration}>
                    {t('access.register')}
                  </a>
                )}
              </>
            )}
          </div>
        )}
      </section>
      <section id="team" className="lra-team">
        <div className="lra-section-masthead">
          <h2 dir="auto">{t('project.teamTitle')}</h2>
          <span>{t('project.authors')}</span>
        </div>
        <ol>
          {p.authors.map((person) => (
            <li key={person.order}>
              <PersonAvatar
                name={person.name}
                projectId={p.project}
                versionId={p.version}
                published
                person="author"
                order={person.order}
                size="lg"
              />
              <bdi dir="auto">{person.name}</bdi>
            </li>
          ))}
        </ol>
        <div className="lra-supervisor">
          <PersonAvatar
            name={p.supervisor.name}
            projectId={p.project}
            versionId={p.version}
            published
            person="supervisor"
          />
          <div>
            <span>{t('project.supervisor')}</span>
            <p dir="auto">{p.supervisor.name}</p>
          </div>
        </div>
      </section>
    </article>
  );
}
