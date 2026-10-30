'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFact, BidiFacts } from '@capstone/ui/bidi';
import Link from 'next/link';
import type { InstitutionRecord, PersonRecord } from '@capstone/domain';
import type { AccountAccessPerson } from '../account-entry/access-types';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Separator,
  Mail,
  ArrowUpRight,
} from '@capstone/ui/workspace-v2';
import { DepartmentPreview } from './forms';
import { MutationPanel } from './mutation';
import {
  TaskHeader,
  StateBadge,
  roleName,
  friendlyDate,
  tr,
  type Locale,
} from './common';
export function UniversityRecord({
  locale,
  record,
  parent,
}: {
  locale: Locale;
  record: InstitutionRecord;
  parent: string;
}) {
  const t = (e: string, a: string) => tr(locale, e, a),
    name = locale === 'ar' ? record.nameAr : record.name,
    base = `/${locale}/admin/platform/${record.id}`;
  return (
    <section className="on-page" data-locale={locale}>
      <TaskHeader
        locale={locale}
        title={name}
        description={t('University record · ', 'سجل الجامعة · ') + record.code}
        back={{
          href: parent,
          label: t('Back to universities', 'العودة إلى الجامعات'),
        }}
        {...(record.status === 'active'
          ? {
              action: {
                href: base + '/invite-administrator',
                label: t('Invite administrator', 'دعوة المدير'),
              },
            }
          : {})}
      />
      <StateBadge locale={locale} state={record.status} />
      {record.status === 'suspended' && (
        <p dir="auto" className="on-state-note" role="status">
          {t(
            'Invitations and university sessions are blocked while this institution is suspended.',
            'تُحظر الدعوات وجلسات الجامعة أثناء إيقاف المؤسسة.',
          )}
        </p>
      )}
      <div className="on-record-grid">
        <Card>
          <CardHeader>
            <CardTitle>{t('Administrators', 'المديرون')}</CardTitle>
            <CardDescription>
              {t(
                'Individual accounts responsible for this university.',
                'الحسابات الفردية المسؤولة عن هذه الجامعة.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {record.administrators.length ? (
              <div className="on-person-cards">
                {record.administrators.map((a) => (
                  <article key={a.id}>
                    <div>
                      <strong dir="auto">{a.name}</strong>
                      <span className="on-email" dir="ltr">
                        {a.email}
                      </span>
                      <StateBadge locale={locale} state={a.status} />
                    </div>
                    {record.status === 'active' ? (
                      <Button asChild variant="outline">
                        <Link
                          href={
                            base + '/administrators/' + a.id + '/account-access'
                          }
                        >
                          {t('Account access', 'وصول الحساب')}
                          <ArrowUpRight />
                        </Link>
                      </Button>
                    ) : (
                      <span>
                        {t('Institution suspended', 'المؤسسة موقوفة')}
                      </span>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {t(
                      'No university administrator yet',
                      'لا يوجد مدير للجامعة بعد',
                    )}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t(
                      'Use Invite administrator to start the personal setup journey.',
                      'استخدم دعوة المدير لبدء إعداد الحساب الفردي.',
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Departments', 'الأقسام')}</CardTitle>
            <CardDescription>
              {t(
                'Fixed academic options for this university.',
                'خيارات أكاديمية ثابتة لهذه الجامعة.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DepartmentPreview locale={locale} />
            <Separator />
            <p dir="auto" className="on-help">
              {t(
                'Provisioned automatically. Department names and codes are read-only.',
                'تُنشأ تلقائيًا. أسماء الأقسام ورموزها للقراءة فقط.',
              )}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="on-secondary-grid">
        <MutationPanel
          locale={locale}
          title={t('Institution status', 'حالة المؤسسة')}
          description={
            record.status === 'active'
              ? t(
                  'Suspending ends institution sessions and revokes pending setup links. Existing history is retained.',
                  'ينهي الإيقاف جلسات المؤسسة ويلغي روابط الإعداد المعلقة. يبقى السجل محفوظًا.',
                )
              : t(
                  'Reactivation restores institutional availability. Revoked links remain unusable.',
                  'تعيد إعادة التفعيل توافر المؤسسة. تبقى الروابط الملغاة غير صالحة.',
                )
          }
          subject={name}
          university={record.code}
          id={record.id}
          revision={record.revision}
          kind="university"
          actions={[
            {
              operation: record.status === 'active' ? 'suspended' : 'active',
              label:
                record.status === 'active'
                  ? t('Review suspension', 'مراجعة الإيقاف')
                  : t('Review reactivation', 'مراجعة إعادة التفعيل'),
              required: true,
            },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>{t('Institution history', 'سجل المؤسسة')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p dir="auto" className="on-help">
              {t('Created ', 'أُنشئت ')}
              <bdi dir="ltr">{friendlyDate(locale, record.createdAt)}</bdi>
            </p>
            {record.history.length ? (
              <ol className="on-history">
                {record.history
                  .filter((h) => h.action !== 'admin.university.status')
                  .map((h, i) => (
                    <li key={i}>
                      <strong>
                        {h.action.includes('create')
                          ? t('University created', 'أُنشئت الجامعة')
                          : t(
                              'Institution status updated',
                              'حُدّثت حالة المؤسسة',
                            )}
                      </strong>
                      <p dir="auto">
                        {h.reason === 'Institution onboarding command'
                          ? t(
                              'Institution created by an authorized platform administrator.',
                              'أُنشئت المؤسسة بواسطة مدير منصة مخوّل.',
                            )
                          : h.reason}
                      </p>
                      <time dir="ltr">{friendlyDate(locale, h.at)}</time>
                    </li>
                  ))}
              </ol>
            ) : (
              <p dir="auto">
                {t(
                  'No institutional changes recorded yet.',
                  'لم تُسجل تغييرات مؤسسية بعد.',
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
const mailState = (l: Locale, s: string) =>
  (
    ({
      queued: ['Queued', 'في قائمة الإرسال'],
      sending: ['Processing', 'جارٍ المعالجة'],
      captured: ['Delivery not verified', 'لم يُتحقق من التسليم'],
      provider_accepted: ['Email accepted for delivery', 'قُبل البريد للإرسال'],
      failed: ['Send failed', 'تعذر الإرسال'],
      unknown: ['Send result uncertain', 'نتيجة الإرسال غير مؤكدة'],
      expired: ['Request expired', 'انتهت صلاحية الطلب'],
    }) as Record<string, string[]>
  )[s]?.[l === 'ar' ? 1 : 0] ??
  tr(l, 'No email request yet', 'لا يوجد طلب بريد بعد');
export function PersonDetail({
  locale,
  person,
  access,
  parent,
  reused,
}: {
  locale: Locale;
  person: PersonRecord;
  access: AccountAccessPerson;
  parent: string;
  reused: boolean;
}) {
  const t = (e: string, a: string) => tr(locale, e, a),
    base = `/${locale}/admin/university/people/${person.id}`,
    institution =
      locale === 'ar' ? person.universityNameAr : person.universityName;
  return (
    <section className="on-page" data-locale={locale}>
      <TaskHeader
        locale={locale}
        title={person.name}
        description={
          roleName(locale, person.role) + ' · ' + (institution ?? '')
        }
        back={{
          href: parent,
          label: t('Back to People', 'العودة إلى الأشخاص'),
        }}
        action={{
          href: base + '/account-access',
          label: t('Account access', 'وصول الحساب'),
        }}
      />
      {reused && (
        <p dir="auto" className="on-state-note" role="status">
          {t(
            'The compatible existing identity was reused. Its name, role and credentials remain intact.',
            'أُعيد استخدام الهوية الحالية المتوافقة. يبقى الاسم والدور وبيانات الاعتماد دون تغيير.',
          )}
        </p>
      )}
      <div className="on-record-grid">
        <Card>
          <CardHeader>
            <CardTitle>
              {t('Identity and institution', 'الهوية والمؤسسة')}
            </CardTitle>
            <CardDescription>
              {t(
                'A person’s own academic account, scoped to this university.',
                'حساب أكاديمي فردي مرتبط بهذه الجامعة.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BidiFacts className="on-facts">
              <BidiFact>
                <BidiLabel dir="auto">
                  {t('Full name', 'الاسم الكامل')}
                </BidiLabel>
                <BidiData dir="auto">{person.name}</BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">{t('Email', 'البريد')}</BidiLabel>
                <BidiData dir="ltr">{person.email}</BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">
                  {t('Academic role', 'الدور الأكاديمي')}
                </BidiLabel>
                <BidiData dir="auto">{roleName(locale, person.role)}</BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">{t('Department', 'القسم')}</BidiLabel>
                <BidiData dir="auto">
                  <bdi dir="ltr">{person.department}</bdi>:{' '}
                  {locale === 'ar'
                    ? person.departmentNameAr
                    : person.departmentName}
                </BidiData>
              </BidiFact>
              <BidiFact>
                <BidiLabel dir="auto">
                  {t('Account status', 'حالة الحساب')}
                </BidiLabel>
                <BidiData dir="auto">
                  <StateBadge locale={locale} state={person.status} />
                </BidiData>
              </BidiFact>
            </BidiFacts>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {t('Setup and account email', 'الإعداد وبريد الحساب')}
            </CardTitle>
            <CardDescription>
              {t(
                'Invitation status and delivery are distinct from activation.',
                'حالة الدعوة والتسليم منفصلتان عن تفعيل الحساب.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="on-access-summary">
              <Mail />
              <strong>
                {person.status === 'active'
                  ? t('Account setup completed', 'اكتمل إعداد الحساب')
                  : person.status === 'suspended'
                    ? t('Account access is suspended', 'وصول الحساب موقوف')
                    : t('Account setup needed', 'يلزم إعداد الحساب')}
              </strong>
              <p dir="auto">
                {access.invitation
                  ? access.invitation.state === 'valid'
                    ? t(
                        'A current single-use invitation is available.',
                        'تتوفر دعوة حالية لمرة واحدة.',
                      )
                    : t(
                        'The previous invitation is no longer usable.',
                        'الدعوة السابقة لم تعد صالحة.',
                      )
                  : t(
                      'No setup invitation is recorded yet.',
                      'لم تُسجل دعوة إعداد بعد.',
                    )}
              </p>
              <span>{mailState(locale, access.messages[0]?.state ?? '')}</span>
            </div>
            <p dir="auto" className="on-help">
              {t(
                'Open Account access to inspect the selected person’s requests and use the correct setup or recovery action.',
                'افتح وصول الحساب لفحص طلبات الشخص المحدد واستخدام الإجراء الصحيح للإعداد أو الاستعادة.',
              )}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="on-narrow">
        <MutationPanel
          locale={locale}
          title={t('Account availability', 'توافر الحساب')}
          description={
            person.status === 'suspended'
              ? t(
                  'Restore the permitted account state. A person without credentials will still need setup.',
                  'استعد حالة الحساب المسموح بها. سيظل الشخص دون بيانات اعتماد بحاجة إلى الإعداد.',
                )
              : t(
                  'Suspending ends this person’s sessions and revokes outstanding account links. Academic history is preserved.',
                  'ينهي الإيقاف جلسات هذا الشخص ويلغي روابط الحساب المعلقة. يبقى السجل الأكاديمي محفوظًا.',
                )
          }
          subject={person.name}
          university={institution ?? ''}
          id={person.id}
          revision={person.revision}
          kind="person"
          actions={[
            {
              operation: person.status === 'suspended' ? 'active' : 'suspended',
              label:
                person.status === 'suspended'
                  ? t('Review reactivation', 'مراجعة إعادة التفعيل')
                  : t('Review suspension', 'مراجعة الإيقاف'),
              required: true,
            },
          ]}
        />
      </div>
    </section>
  );
}
