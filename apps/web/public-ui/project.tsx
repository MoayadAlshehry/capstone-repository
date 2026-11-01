'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  PublicModelProvider,
  useSite,
  type PublicModel,
  type Project,
} from './model';
import { Authors, Score } from './cards';
import { PublicReader } from './reader';
import { formatScore } from '../../../packages/ui/src/score-format';
export function PublicProject({ model }: { model: PublicModel }) {
  return (
    <PublicModelProvider model={model}>
      <ProjectPage />
    </PublicModelProvider>
  );
}
export function ProjectActions() {
  const { t, project: p, currentUrl, integration, l } = useSite(),
    [notice, setNotice] = useState('');
  return (
    <div className="pu-project-actions">
      {integration?.filesPending ? (
        <Button disabled>
          {l('Loading public files…', 'جارٍ تحميل الملفات العامة…')}
        </Button>
      ) : (
        <Button asChild>
          <a
            data-ui="primary-action"
            href={p?.publicFiles.length ? '#files' : '#overview'}
          >
            {t(p?.publicFiles.length ? 'readFiles' : 'Overview')} ↓
          </a>
        </Button>
      )}
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(currentUrl);
            setNotice(t('linkCopied'));
          } catch {
            setNotice(
              t('Copy unavailable. Select this link:') + ' ' + currentUrl,
            );
          }
        }}
      >
        {t('Copy project link')}
      </Button>
      <span className="text-sm" role="status">
        {notice}
      </span>
    </div>
  );
}
function SectionNav() {
  const { t } = useSite(),
    [active, setActive] = useState('overview'),
    items = ['overview', 'people', 'assessments', 'files', 'rights'];
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: '-15% 0px -65% 0px' },
    );
    for (const id of items) {
      const e = document.getElementById(id);
      if (e) observer.observe(e);
    }
    return () => observer.disconnect();
  }, []);
  return (
    <nav className="pu-section-nav" aria-label={t('About the project')}>
      {items.map((key, index) => (
        <Button
          asChild
          key={key}
          variant={active === key ? 'secondary' : 'ghost'}
          className="justify-start h-auto whitespace-normal text-start"
        >
          <a
            href={'#' + key}
            aria-current={active === key ? 'location' : undefined}
          >
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            {t(key)}
          </a>
        </Button>
      ))}
    </nav>
  );
}
function Facts({ p }: { p: Project }) {
  const { t, integration, l, ar } = useSite();
  const facts = [
    ['University', p.university],
    ['Department', t(p.department)],
    ['Academic year', p.academicYear],
    ['Domain', t(p.domain)],
    ['Publication date', integration?.publicationLabel ?? p.publicationDate],
  ];
  return (
    <dl className="pu-facts" dir="ltr">
      {facts.map(([label, value]) => (
        <div key={label} dir={ar ? 'rtl' : 'ltr'}>
          <dt>{t(label!)}</dt>
          <dd>
            {label === 'Academic year' || label === 'Publication date' ? (
              <bdi dir="ltr">
                {label === 'Publication date'
                  ? value?.replace(/[\u200e\u200f\u061c]/g, '')
                  : value}
              </bdi>
            ) : (
              <bdi>{value || l('Not recorded', 'غير مسجَّل')}</bdi>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function ProjectPage() {
  const { project: p, t, l, href, back, ar, integration } = useSite();
  if (!p)
    return (
      <main id="main" className="wrap">
        <h1>{t('Project not found')}</h1>
      </main>
    );
  const dir = ar ? 'rtl' : 'ltr';
  return (
    <main id="main" tabIndex={-1} className="wrap pu-project">
      <Button asChild variant="link" className="px-0 mb-6">
        <Link href={back()}>← {t('Back to results')}</Link>
      </Button>
      <header className="pu-publication">
        <div>
          <Badge variant="secondary">
            {t('Published')} ·{' '}
            <bdi dir="ltr">
              {(integration?.publishedLabel ?? p.publicationDate ?? '').replace(
              /[\u200e\u200f\u061c]/g,
              '',
            )}
            </bdi>
          </Badge>
          <h1 dir="auto">{p.title}</h1>
        </div>
        {integration?.projectActions ?? <ProjectActions />}
        {integration?.aiActions}
      </header>
      <Card className="pu-panorama">
        <div className="pu-detail-cover">{integration?.media?.(p, true)}</div>
        <CardFooter className="pu-detail-credit">
          <Authors p={p} all />
          <span className="text-sm text-muted-foreground">
            {l('Published work / public archive', 'عمل منشور / الأرشيف العام')}
          </span>
        </CardFooter>
        <CardContent className="pu-metadata" dir={dir}>
          <Facts p={p} />
        </CardContent>
      </Card>
      <div className="pu-chapters">
        <aside>
          <span className="pu-eyebrow">
            {l('In this record', 'في هذا السجل')}
          </span>
          <SectionNav />
        </aside>
        <div className="pu-chapter-body">
          <section id="overview" className="grid gap-4">
            <span className="pu-eyebrow">{t('overview')}</span>
            <div className="pu-abstract-heading">
              <h2 dir="auto">{l('Project abstract', 'ملخص المشروع')}</h2>
              {integration?.aiOverview}
            </div>
            <small dir={dir} className="text-muted-foreground">
              {integration?.sourceLabel ?? t('Source text · English')}
            </small>
            <p id="original-abstract" className="pu-abstract" dir="auto">
              {p.abstract ||
                l(
                  'No source abstract is recorded for this public record.',
                  'لا يتوفر ملخص أصلي في هذا السجل العام.',
                )}
            </p>
            <div className="flex flex-wrap gap-2">
              {p.topics.map((topic) => (
                <Button asChild variant="outline" size="sm" key={topic}>
                  <Link href={href('catalogue', undefined, { topic })}>
                    {topic} ↗
                  </Link>
                </Button>
              ))}
            </div>
          </section>
          <Card id="people">
            <CardContent className="grid gap-5">
              <h2 dir="auto">{t('people')}</h2>
              {p.authors.length ? (
                <Authors p={p} all />
              ) : (
                <p>
                  {l(
                    'Creator details are not recorded.',
                    'تفاصيل المؤلفين غير مسجَّلة.',
                  )}
                </p>
              )}
              <dl className="grid gap-1" dir={dir}>
                <dt className="text-sm text-muted-foreground">
                  {t('Supervisor')}
                </dt>
                <dd>
                  {p.supervisor ? (
                    <Button asChild variant="link" className="p-0 h-auto">
                      <Link
                        href={href('catalogue', undefined, {
                          supervisor: p.supervisor,
                        })}
                      >
                        <bdi>{p.supervisor}</bdi>
                      </Link>
                    </Button>
                  ) : (
                    l('Not recorded', 'غير مسجَّل')
                  )}
                </dd>
              </dl>
            </CardContent>
          </Card>
          <section id="assessments" className="grid gap-5">
            <h2 dir="auto">{t('assessments')}</h2>
            <div className="pu-assessment-pair">
              <Card>
                <CardContent className="pu-score" dir={dir}>
                  <span>{t('internalAssessment')}</span>
                  {p.internalAssessment.unavailable ? (
                    <span>
                      {l('Assessment unavailable', 'التقييم غير متاح')}
                    </span>
                  ) : typeof p.internalAssessment.score === 'number' &&
                    Number.isFinite(p.internalAssessment.score) ? (
                    <strong dir="ltr">
                      {formatScore(
                        p.internalAssessment.score,
                        ar ? 'ar' : 'en',
                      )}
                      <small>/100</small>
                    </strong>
                  ) : (
                    <span>{l('Not assessed', 'لم يُقيَّم')}</span>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <Score p={p} />
                </CardContent>
              </Card>
            </div>
            <p dir="auto" className="text-sm text-muted-foreground">
              {t('assessmentDisclaimer')}
            </p>
          </section>
          <span id="public-files" />
          {integration?.reader ?? <PublicReader p={p} />}
          {p.rights.uploadedLicense && (
            <Card>
              <CardContent className="grid gap-3">
                <h2>{l('Uploaded LICENSE', 'ملف LICENSE المرفوع')}</h2>
                <bdi dir="ltr">{p.rights.uploadedLicense.path}</bdi>
                <Button asChild variant="outline" className="w-fit">
                  <a href={p.rights.uploadedLicense.href}>
                    {l('Download the uploaded original', 'تنزيل الأصل المرفوع')}
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
          <section id="rights" className="grid gap-4 border-t pt-6">
            <span className="pu-eyebrow">{t('rights')}</span>
            <h2 dir="auto">
              {l('Respect the authors’ rights', 'احترم حقوق المؤلفين')}
            </h2>
            <p dir="auto">{t('copyrightNote')}</p>
            <p dir="auto">{t('restrictedExplanation')}</p>
            {integration?.rights}
          </section>
        </div>
      </div>
    </main>
  );
}
