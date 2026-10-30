'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  GuidedProjectRecord,
  ProjectTeamPerson,
  DepartmentOption,
} from '@capstone/domain';
import {
  Button,
  Badge,
  ArrowLeft,
  ArrowUpRight,
  CircleCheck,
  LoaderCircle,
} from '@capstone/ui/workspace-v2';
import { ResultAlert } from '../account-entry/fields';
import { friendlyDate } from '../onboarding/common';
import { ProjectWizard } from './wizard';
import { ProjectCard, ProjectState, t, type Locale } from './common';
import { PersonAvatar, ProjectCover } from '@capstone/ui/visual-media';
import { authorCountText } from '../academic/project-item';
function mailLabel(l: Locale, p: ProjectTeamPerson) {
  if (p.status === 'suspended')
    return t(l, 'Account suspended', 'الحساب موقوف');
  if (p.status === 'active')
    return p.setupComplete
      ? t(l, 'Account setup complete', 'اكتمل إعداد الحساب')
      : t(
          l,
          'Active account · notified in app',
          'حساب نشط · أُبلغ داخل التطبيق',
        );
  const labels: Record<string, [string, string]> = {
    queued: ['Setup email queued', 'أُدرج بريد الإعداد'],
    sending: ['Sending setup email', 'جارٍ إرسال بريد الإعداد'],
    captured: ['Delivery not verified', 'لم يُتحقق من التسليم'],
    provider_accepted: [
      'Email accepted for delivery · receipt unverified',
      'قُبل البريد للإرسال · الوصول غير مؤكد',
    ],
    failed: ['Send failed', 'فشل الإرسال'],
    unknown: ['Delivery outcome unknown', 'نتيجة التسليم غير معروفة'],
    expired: ['Setup invitation expired', 'انتهت صلاحية دعوة الإعداد'],
  };
  return (
    labels[p.mail?.state ?? '']?.[l === 'ar' ? 1 : 0] ??
    t(
      l,
      'Setup needed · review invite status',
      'يلزم الإعداد · راجع حالة الدعوة',
    )
  );
}
function CompactTeam({
  locale,
  record,
  refresh = false,
}: {
  locale: Locale;
  record: GuidedProjectRecord;
  refresh?: boolean;
}) {
  const router = useRouter();
  return (
    <ProjectCard
      title={t(locale, 'Team & account access', 'الفريق والوصول إلى الحسابات')}
      className="po-compact-team"
    >
      <div className="po-team-section-heading">
        <h3 dir="auto">{t(locale, 'Assigned supervisor', 'المشرف المعيّن')}</h3>
        {refresh && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.refresh()}
          >
            {t(locale, 'Refresh account status', 'تحديث حالة الحسابات')}
          </Button>
        )}
      </div>
      <PersonRow
        locale={locale}
        person={record.supervisor}
        project={record.id}
        version={record.version}
        manage
        compact
      />
      <div className="po-team-section-heading">
        <h3 dir="auto">
          {t(locale, 'Students · author order', 'الطلاب · ترتيب المؤلفين')}
        </h3>
        <span>{authorCountText(locale, record.authors.length)}</span>
      </div>
      <ol className="po-compact-authors">
        {record.authors.map((p, i) => (
          <li key={p.id}>
            <span className="po-author-number">
              <span className="sr-only">
                {t(locale, 'Author order', 'ترتيب المؤلفين')}{' '}
              </span>
              {i + 1}
            </span>
            <PersonRow
              locale={locale}
              person={p}
              project={record.id}
              version={record.version}
              manage
              compact
            />
          </li>
        ))}
      </ol>
    </ProjectCard>
  );
}
function PersonRow({
  locale,
  person,
  project,
  version,
  manage = false,
  compact = false,
}: {
  locale: Locale;
  person: ProjectTeamPerson;
  project: string;
  version: string;
  manage?: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    router = useRouter();
  const copy = (en: string, ar: string) => t(locale, en, ar);
  async function retry() {
    if (busy || !person.mail?.canRetry) return;
    setBusy(true);
    setError(false);
    try {
      const r = await fetch(
        '/api/account-access?person=' + encodeURIComponent(person.id),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'retry', message: person.mail.id }),
        },
      );
      if (!r.ok) throw Error();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={'po-person' + (compact ? ' po-person-compact' : '')}>
      <div className="po-person-identity">
        <strong className="po-person-name">
          <PersonAvatar
            name={person.name}
            userId={person.id}
            projectId={project}
            versionId={version}
            size="sm"
          />
          <bdi dir="auto">{person.name}</bdi>
          {compact && person.lead && (
            <Badge className="po-lead-badge">
              {copy('Project lead', 'قائد المشروع')}
            </Badge>
          )}
        </strong>
        {person.email && <span dir="ltr">{person.email}</span>}
        <small>
          {person.role === 'student'
            ? copy('Student author', 'طالب مؤلف')
            : copy('Faculty supervisor', 'عضو هيئة تدريس / مشرف')}{' '}
          · <span dir="ltr">{person.department}</span>
          {!compact && person.lead && (
            <>
              {' '}
              · <strong>{copy('Project lead', 'قائد المشروع')}</strong>
            </>
          )}
        </small>
      </div>
      <div className="po-person-access">
        <Badge variant="outline">
          {compact
            ? person.status === 'active'
              ? copy('Ready to sign in', 'جاهز للدخول')
              : person.status === 'suspended'
                ? copy('Account suspended', 'الحساب موقوف')
                : copy('Account setup required', 'يلزم إعداد الحساب')
            : mailLabel(locale, person)}
        </Badge>
        {compact && person.mail && person.status !== 'active' && (
          <span className="po-delivery-state">
            {person.mail.state === 'captured'
              ? copy(
                  'Email captured locally · inbox receipt unverified',
                  'حُفظ البريد محليًا · لم يُتحقق من وصوله',
                )
              : mailLabel(locale, person)}
          </span>
        )}
        {manage && person.status !== 'active' && (
          <Button asChild variant="ghost">
            <Link
              href={
                '/' +
                locale +
                '/admin/university/people/' +
                person.id +
                '/account-access'
              }
            >
              {copy('Review invite status', 'مراجعة حالة الدعوة')}
              <ArrowUpRight />
            </Link>
          </Button>
        )}
        {manage && person.mail?.canRetry && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={retry}
            pending={busy}
          >
            {busy && <LoaderCircle />}
            {copy('Retry original delivery', 'إعادة محاولة التسليم الأصلي')}
          </Button>
        )}
        {error && (
          <p dir="auto" role="alert">
            {copy(
              'Unable to confirm the retry. Refresh this status before trying again.',
              'تعذر تأكيد المحاولة. حدّث الحالة قبل المحاولة مجددًا.',
            )}
          </p>
        )}
      </div>
    </article>
  );
}
export function ProjectCreated({
  locale,
  record,
  command,
  parent,
}: {
  locale: Locale;
  record: GuidedProjectRecord;
  command: string;
  parent: string;
}) {
  return (
    <section
      className="po-page po-admin-record"
      data-locale={locale}
      data-template="project-created"
    >
      <Link href={parent} className="po-back">
        <ArrowLeft />
        {t(locale, 'Back to Projects', 'العودة إلى المشاريع')}
      </Link>
      <header className="po-created-heading">
        <span className="po-success-mark">
          <CircleCheck />
        </span>
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <h1 dir="auto">
            {t(locale, 'Project workspace created', 'أُنشئت مساحة المشروع')}
          </h1>
          <p dir="auto" className="po-created-title">
            <bdi dir="auto">
              {record.title ||
                t(locale, 'Draft awaiting a title', 'مسودة بانتظار عنوان')}
            </bdi>
          </p>
          <p dir="auto">
            <bdi dir="auto">
              {locale === 'ar' ? record.universityAr : record.university}
            </bdi>{' '}
            ·{' '}
            <span dir="ltr">
              {record.department} · {record.year}
            </span>
          </p>
        </div>
        <Button asChild>
          <Link
            href={
              '/' +
              locale +
              '/admin/university/projects/' +
              record.id +
              '?from=' +
              encodeURIComponent(parent)
            }
          >
            {t(locale, 'Open project', 'فتح المشروع')}
            <ArrowUpRight />
          </Link>
        </Button>
      </header>
      <p className="po-ready-note" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        {t(
          locale,
          'Your draft workspace is ready. The authors can add its title, details and files before submitting it for review.',
          'مساحة المسودة جاهزة. يمكن للمؤلفين إضافة العنوان والبيانات والملفات قبل إرسالها للمراجعة.',
        )}
      </p>
      <CompactTeam locale={locale} record={record} refresh />
      <div className="po-next-note" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <h2 dir="auto">
          {t(locale, 'What happens next', 'ما الخطوة التالية')}
        </h2>
        <p dir="auto">
          {[record.supervisor, ...record.authors].every(
            (p) => p.status === 'active',
          )
            ? t(
                locale,
                'Everyone can sign in and open this assigned project. Open the project to review its current team.',
                'يمكن للجميع الدخول وفتح المشروع المسند. افتح المشروع لمراجعة فريقه الحالي.',
              )
            : t(
                locale,
                'People who need setup use their individual invitation before signing in. Check account access beside any person who needs help, then open the project to review the team.',
                'يستخدم من يحتاج الإعداد دعوته الفردية قبل الدخول. راجع الوصول إلى الحساب بجانب من يحتاج المساعدة، ثم افتح المشروع لمراجعة الفريق.',
              )}
        </p>
      </div>

      <span className="sr-only" data-confirmed-command={command}>
        {t(
          locale,
          'Server-confirmed creation receipt',
          'إيصال إنشاء مؤكد من الخادم',
        )}
      </span>
    </section>
  );
}
export function ProjectRecord({
  locale,
  record,
  actorKey,
  parent,
  departments,
  teamCommand,
  originalsHref,
  startManaging = false,
}: {
  locale: Locale;
  record: GuidedProjectRecord;
  actorKey: string;
  parent: string;
  departments: DepartmentOption[];
  teamCommand?: string | undefined;
  originalsHref?: string;
  startManaging?: boolean;
}) {
  const [editing, setEditing] = useState(
      !!teamCommand || (startManaging && record.canManage),
    ),
    [changed, setChanged] = useState(false),
    [refreshAfterCommand, setRefreshAfterCommand] = useState(false),
    router = useRouter(),
    query = useSearchParams();
  // The wizard removes its recovery query using native history. Refresh only
  // after that URL state has committed, so it cannot restore the pre-save tree.
  useEffect(() => {
    if (refreshAfterCommand && !query.has('teamCommand')) {
      setRefreshAfterCommand(false);
      router.refresh();
    }
  }, [refreshAfterCommand, query, router]);
  return (
    <section
      className="po-page po-admin-record"
      data-locale={locale}
      data-template="project-team"
    >
      <Link href={parent} className="po-back">
        <ArrowLeft />
        {t(locale, 'Back to Projects', 'العودة إلى المشاريع')}
      </Link>
      <header className="po-index-heading">
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <h1 dir="auto">
            {record.title || t(locale, 'Untitled project', 'مشروع دون عنوان')}
          </h1>
          <p dir="auto">
            <bdi dir="auto">
              {locale === 'ar' ? record.universityAr : record.university}
            </bdi>{' '}
            ·{' '}
            <span dir="ltr">
              {record.department} · {record.year}
            </span>
          </p>
        </div>
        <div className="on-actions">
          {originalsHref && (
            <Button asChild variant="outline">
              <Link href={originalsHref}>
                {t(locale, 'Read originals', 'قراءة الملفات الأصلية')}
              </Link>
            </Button>
          )}
          {record.canManage && !editing && (
            <Button type="button" onClick={() => setEditing(true)}>
              {t(locale, 'Manage team', 'إدارة الفريق')}
            </Button>
          )}
        </div>
      </header>
      <div className="po-record-state">
        <ProjectCover
          projectId={record.id}
          versionId={record.version}
          className="visual-admin-cover"
        />
        <ProjectState locale={locale} state={record.status} />
        {record.isLead && (
          <Badge>
            {t(locale, 'Your role: Project lead', 'دورك: قائد المشروع')}
          </Badge>
        )}
        {record.isSupervisor && (
          <Badge>
            {t(
              locale,
              'Your role: Assigned supervisor',
              'دورك: المشرف المعيّن',
            )}
          </Badge>
        )}
      </div>
      {changed && (
        <ResultAlert
          kind="success"
          title={t(locale, 'Team correction recorded', 'سُجل تصحيح الفريق')}
        >
          {t(
            locale,
            'The server confirmed the current assignment; previous frozen attribution stays intact.',
            'أكد الخادم الإسناد الحالي؛ تبقى بيانات التقديم السابقة المجمّدة سليمة.',
          )}
        </ResultAlert>
      )}
      {editing && record.canManage ? (
        <ProjectWizard
          locale={locale}
          actorKey={actorKey}
          institution={
            locale === 'ar' ? record.universityAr : record.university
          }
          departments={departments}
          parent={parent}
          record={record}
          lockedCommand={teamCommand}
          onCancel={() => {
            setEditing(false);
            router.refresh();
          }}
          onDone={() => {
            setEditing(false);
            setChanged(true);
            setRefreshAfterCommand(true);
          }}
        />
      ) : (
        <>
          <CompactTeam locale={locale} record={record} />
          {record.locked && (
            <p className="po-ready-note" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              {t(
                locale,
                'Submitted author names and order are preserved. Only permitted current assignments can be corrected with a reason.',
                'تبقى أسماء المؤلفين المقدمة وترتيبهم محفوظة. يمكن تصحيح الإسنادات الحالية المسموحة فقط مع ذكر السبب.',
              )}
            </p>
          )}
          {record.canManage && (
            <details className="po-history">
              <summary>
                {t(locale, 'Team change history', 'سجل تغييرات الفريق')}
              </summary>
              <ol>
                {record.history.map((x, i) => (
                  <li key={i}>
                    <strong>
                      {x.action === 'project.onboarding.create'
                        ? t(
                            locale,
                            'Project and team created',
                            'أُنشئ المشروع والفريق',
                          )
                        : t(locale, 'Assignment corrected', 'صُحح الإسناد')}
                    </strong>
                    <p dir="auto">
                      <bdi dir="auto">{x.reason}</bdi>
                    </p>
                    <time>{friendlyDate(locale, x.at)}</time>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}
