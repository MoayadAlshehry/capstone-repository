import 'server-only';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { submissionUuid } from '@capstone/domain';
import { Button } from '@capstone/ui/workspace-v2';
import { editions } from '../editions/server';
import { submissions } from '../submissions/server';
import { nativeReader } from '../native-files/server';
import { projectOnboarding } from '../project-onboarding/server';
import { projectParent } from '../project-onboarding/routing';
import { AcademicEvidence } from '../academic/evidence';
import { ReadUnavailable } from '../onboarding/common';
import { privateReadError } from './private-read-error';
import { t, type Locale } from './common';

/** Existing tenant administrator reads only; every original still uses the installed native port. */
export async function administrativeFilesPage(
  actor: AccountView,
  locale: Locale,
  project: string,
  query: Record<string, string | string[] | undefined>,
) {
  if (actor.role !== 'university_admin' || !submissionUuid(project)) notFound();
  if (
    Object.entries(query).some(([key, value]) =>
      key === 'from'
        ? typeof value !== 'string' || value.length > 1400
        : !['version', 'submission', 'file'].includes(key) ||
          !submissionUuid(value),
    )
  )
    notFound();
  const requestedVersion =
      typeof query.version === 'string' ? query.version : undefined,
    requestedSubmission =
      typeof query.submission === 'string' ? query.submission : undefined,
    selected = typeof query.file === 'string' ? query.file : undefined,
    recordPath = '/' + locale + '/admin/university/projects/' + project,
    candidate = projectParent(locale, query.from),
    candidatePath = new URL(candidate, 'https://project-parent.invalid')
      .pathname,
    back =
      query.from === undefined
        ? recordPath
        : candidatePath === recordPath
          ? candidate
          : candidatePath === '/' + locale + '/admin/university'
            ? recordPath + '?from=' + encodeURIComponent(candidate)
            : recordPath,
    copy = (en: string, ar: string) => t(locale, en, ar);
  try {
    const history = await (await editions()).history(actor, project);
    let version = requestedVersion ?? history.currentVersion;
    let submission = requestedSubmission;
    if (
      !submission &&
      requestedVersion &&
      requestedVersion !== history.currentVersion
    ) {
      const historical = history.items.find(
        (item) => item.id === requestedVersion,
      );
      submission =
        historical?.approvedSubmission ?? historical?.submission ?? undefined;
      if (!submission) notFound();
    }
    let title = (await projectOnboarding().record(actor, project)).title;
    if (submission) {
      const record = await (await submissions()).read(actor, submission);
      if (
        record.project !== project ||
        (requestedVersion && requestedVersion !== record.version)
      )
        notFound();
      version = record.version;
      title = record.metadata.title;
    }
    const edition = history.items.find((item) => item.id === version);
    if (!edition || (!submission && version !== history.currentVersion))
      notFound();
    const files = await (
      await nativeReader()
    ).list(actor, project, version, submission);
    if (selected && !files.some((file) => file.id === selected)) notFound();
    const authority =
      '/api/native-files?' +
      new URLSearchParams({
        project,
        version,
        mode: 'tree',
        ...(submission ? { submission } : {}),
      });
    return (
      <section
        className="ss-page ac-page"
        data-template="administrative-original-files"
        data-locale={locale}
      >
        <Button asChild variant="outline">
          <Link href={back}>
            {copy('Back to project record', 'العودة إلى سجل المشروع')}
          </Link>
        </Button>
        <header className="ss-heading">
          <div>
            <h1 dir="auto">
              {title ?? copy('Project originals', 'أصول المشروع')}
            </h1>
            <p dir="auto">
              {copy(
                submission
                  ? 'Frozen submission files · read only'
                  : 'Current edition files · read only',
                submission
                  ? 'ملفات الإرسال المحفوظ · للقراءة فقط'
                  : 'ملفات النسخة الحالية · للقراءة فقط',
              )}{' '}
              · {copy('Edition ', 'النسخة ')}
              {edition.number}
            </p>
          </div>
        </header>
        <p dir="auto" className="ss-muted">
          {copy(
            'Read the exact permitted originals. File content, visibility, licensing and academic records are changed only through their existing authorized workflows.',
            'اقرأ الأصول الدقيقة المصرح بها. لا يتغير محتوى الملفات وإتاحتها وترخيصها والسجلات الأكاديمية إلا عبر إجراءاتها المصرح بها القائمة.',
          )}
        </p>
        <AcademicEvidence
          key={actor.id + ':' + version + ':' + (submission ?? 'working')}
          locale={locale}
          actor={actor.id}
          project={project}
          version={version}
          submission={submission}
          files={files}
          initialFile={selected}
          readerOnly={false}
          authorityUrl={authority}
          authorityRequiresUsable={false}
          scopeKey={'admin.originals.' + (submission ?? version)}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('NEXT_'))
      throw error;
    if (privateReadError(error).status === 404) notFound();
    return (
      <>
        <Button asChild variant="outline">
          <Link href={back}>
            {copy('Back to project record', 'العودة إلى سجل المشروع')}
          </Link>
        </Button>
        <ReadUnavailable locale={locale} />
      </>
    );
  }
}
