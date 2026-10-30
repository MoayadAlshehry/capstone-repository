'use client';
import type { GuidedProjectRecord } from '@capstone/domain';
import { Badge } from '@capstone/ui/workspace-v2';
import { PersonAvatar, IdentityEmail } from '@capstone/ui/visual-media';
import { StudioCard, t, type Locale } from './common';
export function StudioTeam({
  locale,
  record,
}: {
  locale: Locale;
  record: GuidedProjectRecord;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    person = (p: GuidedProjectRecord['supervisor']) => (
      <div className="ss-person visual-team-person">
        <PersonAvatar
          name={p.name}
          userId={p.id}
          projectId={record.id}
          versionId={record.version}
        />
        <div>
          <strong className="ss-person-name">
            <bdi dir="auto">{p.name}</bdi>
            {p.lead && (
              <Badge className="ss-role">
                {copy('Project lead', 'قائد المشروع')}
              </Badge>
            )}
          </strong>
          {p.email && (
            <span dir="ltr">
              <IdentityEmail email={p.email} />
            </span>
          )}
        </div>
        <Badge className="ss-small-badge" variant="outline">
          {p.status === 'active'
            ? copy('Active account', 'حساب نشط')
            : p.status === 'suspended'
              ? copy('Account suspended', 'الحساب موقوف')
              : copy('Account setup required', 'يلزم إعداد الحساب')}
        </Badge>
      </div>
    );
  return (
    <section data-template="team" className="ss-compact-team">
      <StudioCard title={copy('Assigned team', 'الفريق المعيّن')}>
        <p dir="auto" className="ss-muted">
          {copy(
            'Ordered attribution · assignments managed by your university.',
            'ترتيب المؤلفين · تدير جامعتك الإسنادات.',
          )}
        </p>
        <h3 dir="auto">{copy('Supervisor', 'المشرف')}</h3>
        {person(record.supervisor)}
        <h3 dir="auto">
          {copy('Students · author order', 'الطلاب · ترتيب المؤلفين')}
        </h3>
        <ol className="ss-team-list">
          {record.authors.map((p) => (
            <li key={p.id}>{person(p)}</li>
          ))}
        </ol>
      </StudioCard>
    </section>
  );
}
