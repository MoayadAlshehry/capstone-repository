import { safeParent } from './routing';
import 'server-only';
import { notFound } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { DatabaseError } from '@capstone/db';
import type {
  DepartmentOption,
  OnboardingList,
  InstitutionRecord,
  PersonRecord,
} from '@capstone/domain';
import { onboarding } from './server';
import { accountAccess } from '../account-entry/access-service';
import { PersonAccountAccess } from '../account-entry/people';
import { Roster } from './collections';
import { InvitationForm } from './forms';
import { UniversityRecord, PersonDetail } from './records';
import {
  ApprovalList,
  ApprovalDetail,
  type ApprovalListData,
  type ApprovalDetailData,
} from './approvals';
import { ReadUnavailable, type Locale } from './common';
const id = '([a-f0-9-]{36})';
function filters(query: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const k of ['q', 'status', 'role', 'page']) {
    const v = query[k];
    if (v !== undefined) {
      if (typeof v !== 'string') notFound();
      out[k] = v;
    }
  }
  if (
    (out['q'] ?? '').length > 200 ||
    (out['page'] && !/^[1-9]\d{0,3}$/.test(out['page'])) ||
    (out['status'] &&
      ![
        'active',
        'inactive',
        'suspended',
        'pending',
        'approved',
        'rejected',
      ].includes(out['status'])) ||
    (out['role'] &&
      !['student', 'faculty_supervisor', 'invitations'].includes(out['role']))
  )
    notFound();
  return out;
}
export async function onboardingPage(
  a: AccountView,
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined>,
) {
  const owned =
    path === '/admin/platform' ||
    path === '/admin/platform/institutions' ||
    path === '/admin/platform/new' ||
    new RegExp(
      '^/admin/platform/' +
        id +
        '(?:/invite-administrator|/administrators/' +
        id +
        '/account-access)?$',
    ).test(path) ||
    path === '/admin/platform/approvals' ||
    /^\/admin\/platform\/approvals\/(partners|reviewers)\/[a-f0-9-]{36}$/.test(
      path,
    ) ||
    path === '/admin/university/people' ||
    path === '/admin/university/people/new' ||
    /^\/admin\/university\/people\/[a-f0-9-]{36}$/.test(path);
  if (!owned) return null;
  const filterValues = filters(query);
  let v: InstitutionRecord | null = null,
    p: PersonRecord | null = null,
    d: ApprovalDetailData | null = null;
  try {
    if (['/admin/platform', '/admin/platform/institutions'].includes(path))
      return (
        <Roster
          locale={locale}
          kind="universities"
          list={await onboarding().read<OnboardingList>(
            a,
            'universities',
            undefined,
            filterValues,
          )}
        />
      );
    if (path === '/admin/platform/new')
      return (
        <InvitationForm
          locale={locale}
          mode="university"
          parent={safeParent(locale, query.from, '/admin/platform')}
        />
      );
    if (path === '/admin/university/people')
      return (
        <Roster
          locale={locale}
          kind="people"
          institution={(locale === 'ar' ? a.universityAr : a.university) ?? ''}
          list={await onboarding().read<OnboardingList>(
            a,
            'people',
            undefined,
            filterValues,
          )}
        />
      );
    if (path === '/admin/university/people/new')
      return (
        <InvitationForm
          locale={locale}
          mode="person"
          parent={safeParent(locale, query.from, '/admin/university/people')}
          departments={await onboarding().read<DepartmentOption[]>(
            a,
            'departments',
          )}
          institution={{
            id: a.universityId!,
            name: a.university ?? '',
            nameAr: a.universityAr ?? '',
          }}
        />
      );
    if (path === '/admin/platform/approvals') {
      const kind = query.tab === 'reviewers' ? 'reviewers' : 'partners';
      return (
        <ApprovalList
          locale={locale}
          kind={kind}
          data={await onboarding().approvals<ApprovalListData>(
            a,
            kind,
            undefined,
            filterValues,
          )}
        />
      );
    }
    const decision = path.match(
      /^\/admin\/platform\/approvals\/(partners|reviewers)\/([a-f0-9-]{36})$/,
    );
    if (decision)
      d = await onboarding().approvals<ApprovalDetailData>(
        a,
        decision[1]!,
        decision[2]!,
      );
    else if (path.startsWith('/admin/platform/'))
      v = await onboarding().read<InstitutionRecord>(
        a,
        'university',
        path.split('/')[3]!,
      );
    else
      p = await onboarding().read<PersonRecord>(
        a,
        'person',
        path.split('/')[4]!,
      );
  } catch (e) {
    if (
      e instanceof Error &&
      ['INVALID_INPUT', 'FORBIDDEN', 'NOT_FOUND'].includes(e.message)
    )
      notFound();
    if (
      e instanceof DatabaseError &&
      ['42501', '22023'].includes(e.sqlState ?? '')
    )
      notFound();
    return <ReadUnavailable locale={locale} />;
  }
  if (d)
    return (
      <ApprovalDetail
        locale={locale}
        kind={path.includes('/reviewers/') ? 'reviewers' : 'partners'}
        record={d}
        parent={safeParent(locale, query.from, '/admin/platform/approvals')}
      />
    );
  if (v) {
    if (path.endsWith('/invite-administrator')) {
      if (v.status !== 'active') notFound();
      return (
        <InvitationForm
          locale={locale}
          mode="administrator"
          parent={`/${locale}/admin/platform/${v.id}`}
          institution={{ id: v.id, name: v.name, nameAr: v.nameAr }}
        />
      );
    }
    if (path.endsWith('/account-access')) {
      const target = path.split('/')[5]!;
      if (!v.administrators.some((x) => x.id === target)) notFound();
      try {
        return (
          <PersonAccountAccess
            locale={locale}
            back={v.id}
            endpointBase="/api/administrator-access"
            initial={await onboarding().administratorAccess(a, target)}
          />
        );
      } catch {
        return <ReadUnavailable locale={locale} />;
      }
    }
    return (
      <UniversityRecord
        locale={locale}
        record={v}
        parent={safeParent(locale, query.from, '/admin/platform')}
      />
    );
  }
  if (p) {
    try {
      let reused = false;
      if (typeof query.receipt === 'string') {
        try {
          const receipt = await onboarding().receipt(a, query.receipt);
          reused =
            !!receipt &&
            receipt.id === p.id &&
            receipt.university === p.university &&
            receipt.reused;
        } catch {}
      }
      return (
        <PersonDetail
          locale={locale}
          person={p}
          access={await accountAccess().person(a, p.id)}
          parent={safeParent(locale, query.from, '/admin/university/people')}
          reused={reused}
        />
      );
    } catch {
      return <ReadUnavailable locale={locale} />;
    }
  }
  notFound();
}
