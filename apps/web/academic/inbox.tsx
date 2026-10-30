import 'server-only';
import Link from 'next/link';
import {
  Button,
  Item,
  ItemGroup,
  Clock3,
  CircleCheck,
  BookOpen,
  UserRound,
} from '@capstone/ui/workspace-v2';
import { latestReviewerNotices } from '../assessment-studio/view';
import { noticeMessage } from '@capstone/domain/notification-types';
import { academic } from './server';
import { t, date, type Locale } from '../semester/common';
import type { AccountView } from '@capstone/db/auth';
export async function ProjectInbox({
  actor,
  locale,
  page = '1',
  reviewer = false,
  context = 'supervision',
}: {
  actor: AccountView;
  reviewer?: boolean;
  locale: Locale;
  page?: string | undefined;
  context?: 'supervision' | 'independent';
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar);
  let items: {
    id: string;
    type: string;
    created_at: string;
    read_at: string | null;
    project: string | null;
    title: string | null;
    route: string | null;
  }[];
  try {
    items = (await (await academic()).inbox(actor)).items;
  } catch {
    return (
      <section className="ss-page">
        <h1 dir="auto">{copy('Inbox', 'الوارد')}</h1>
        <p dir="auto" role="alert">
          {copy(
            'Updates could not be loaded. Reload to try again.',
            'تعذر تحميل المستجدات. أعد التحميل للمحاولة.',
          )}
        </p>
      </section>
    );
  }
  const visible = (reviewer ? latestReviewerNotices(items) : items).filter(
      (x) =>
        ![
          'draft.saved',
          'evaluation.draft.saved',
          'file.visibility.changed',
        ].includes(x.type),
    ),
    pages = Math.max(1, Math.ceil(visible.length / 10)),
    current = Math.min(
      pages,
      Math.max(1, Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 1),
    ),
    shown = visible.slice((current - 1) * 10, current * 10);
  const label = (type: string) =>
    type.startsWith('evaluation.governance.')
      ? noticeMessage(type, locale)
      : type === 'reminder.review-offer'
        ? copy('Offer deadline approaching', 'اقترب موعد الرد على عرض التحكيم')
        : type === 'reminder.review-task'
          ? copy('Review deadline approaching', 'اقترب موعد التحكيم')
          : type.startsWith('external-review.')
            ? /offer$/.test(type)
              ? copy('Independent review offer', 'دعوة للتحكيم المستقل')
              : /finalize$/.test(type)
                ? copy('Your review is complete', 'اكتمل تحكيمك')
                : /accept$/.test(type)
                  ? copy('Independent review accepted', 'قُبل التحكيم المستقل')
                  : copy(
                      'Independent review update',
                      'مستجد في التحكيم المستقل',
                    )
            : type === 'assignment.changed'
              ? copy('Project team updated', 'حُدّث فريق المشروع')
              : type === 'evaluation.finalized'
                ? copy('Assessment recorded', 'سُجل التقييم')
                : type === 'checkpoint.accept'
                  ? copy('Checkpoint accepted', 'قُبلت نقطة المراجعة')
                  : type === 'auth.lifecycle.completed'
                    ? copy('Account ready', 'الحساب جاهز')
                    : type === 'academic.final.requested'
                      ? copy(
                          'Final submission requested',
                          'طُلب الإرسال النهائي',
                        )
                      : type === 'academic.final.accepted'
                        ? copy(
                            'Final accepted for assessment',
                            'قُبل العمل النهائي للتقييم',
                          )
                        : /revision|changes/.test(type)
                          ? copy(
                              'Supervisor requested changes',
                              'طلب المشرف تعديلات',
                            )
                          : /submission|checkpoint.sent/.test(type)
                            ? copy(
                                'Submitted work needs review',
                                'عمل مرسل يحتاج مراجعة',
                              )
                            : /publish|archiv/.test(type)
                              ? copy('Project published', 'نُشر المشروع')
                              : /reject|retain/.test(type)
                                ? copy(
                                    'Project retained internally',
                                    'حُفظ المشروع داخليًا',
                                  )
                                : copy('Project update', 'مستجد في المشروع');
  return (
    <section
      className={'ss-page af-inbox' + (reviewer ? ' ir-inbox' : '')}
      data-template="project-inbox"
      data-locale={locale}
    >
      <header className="ss-heading">
        <div>
          <h1 dir="auto">{copy('Inbox', 'الوارد')}</h1>
          <p dir="auto">
            {copy(
              reviewer
                ? 'The latest update for each review, plus your account updates.'
                : 'Updates and actions addressed to your account.',
              reviewer
                ? 'آخر مستجد لكل تحكيم، إضافة إلى مستجدات حسابك.'
                : 'مستجدات وإجراءات موجهة إلى حسابك.',
            )}
          </p>
        </div>
      </header>
      <ItemGroup>
        {shown.map((x) => (
          <Item key={x.id} role="listitem" className="af-inbox-item">
            {reviewer && (
              <span className="ir-notice-icon" aria-hidden="true">
                {x.type.includes('reminder') ? (
                  <Clock3 />
                ) : x.type.includes('finalize') ? (
                  <CircleCheck />
                ) : x.type.startsWith('auth.') ? (
                  <UserRound />
                ) : (
                  <BookOpen />
                )}
              </span>
            )}
            <div>
              <h2 dir="auto">{label(x.type)}</h2>
              {x.title && (
                <p dir="auto">
                  <bdi dir="auto">{x.title}</bdi>
                </p>
              )}
              <p dir="auto" className="ss-muted">
                <time dateTime={x.created_at} dir="auto">
                  {reviewer
                    ? new Intl.DateTimeFormat(locale, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: 'Asia/Riyadh',
                      }).format(new Date(x.created_at))
                    : date(locale, x.created_at)}
                </time>
                {reviewer && (
                  <>
                    {' '}
                    ·{' '}
                    {x.read_at
                      ? copy('Read', 'مقروء')
                      : copy('Unread', 'غير مقروء')}
                  </>
                )}
              </p>
            </div>
            {x.route && (
              <Button asChild variant="outline">
                <Link href={'/' + locale + x.route}>
                  {x.route.startsWith('/evaluation/corrections/')
                    ? x.type === 'evaluation.governance.correct'
                      ? copy('View own correction', 'عرض تصحيح تقييمي')
                      : copy('Open own correction', 'فتح تصحيح تقييمي')
                    : x.route.startsWith('/reviewer/tasks/')
                      ? /offer/.test(x.type)
                        ? copy('Review offer', 'مراجعة الدعوة')
                        : /finalize/.test(x.type)
                          ? copy('View own result', 'عرض نتيجتي')
                          : copy('Continue assessment', 'متابعة التقييم')
                      : copy('Open project', 'افتح المشروع')}
                </Link>
              </Button>
            )}
          </Item>
        ))}
      </ItemGroup>
      {pages > 1 && (
        <nav
          className="af-record-actions"
          aria-label={copy('Inbox pages', 'صفحات الوارد')}
        >
          {current > 1 && (
            <Button asChild variant="outline">
              <Link
                href={
                  '/' +
                  locale +
                  '/notifications?' +
                  new URLSearchParams({ context, page: String(current - 1) })
                }
              >
                {copy('Previous', 'السابق')}
              </Link>
            </Button>
          )}
          <span>
            {copy('Page', 'الصفحة')} {current} / {pages}
          </span>
          {current < pages && (
            <Button asChild variant="outline">
              <Link
                href={
                  '/' +
                  locale +
                  '/notifications?' +
                  new URLSearchParams({ context, page: String(current + 1) })
                }
              >
                {copy('Next', 'التالي')}
              </Link>
            </Button>
          )}
        </nav>
      )}

      {!visible.length && (
        <div className="ss-empty">
          <h2 dir="auto">{copy('No updates yet', 'لا توجد مستجدات بعد')}</h2>
          <p dir="auto">
            {copy(
              'Project requests and review responses appear here.',
              'تظهر هنا طلبات المشروع وردود المراجعة.',
            )}
          </p>
        </div>
      )}
    </section>
  );
}
