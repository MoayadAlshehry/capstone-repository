import 'server-only';
import { notFound, redirect } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { DatabaseError } from '@capstone/db';
import type { DepartmentOption } from '@capstone/domain';
import { onboarding } from '../onboarding/server';
import { ReadUnavailable } from '../onboarding/common';
import { projectOnboarding } from './server';
import { ProjectIndex } from './projects';
import { ProjectWizard } from './wizard';
import { ProjectCreated, ProjectRecord } from './record';
import { projectParent } from './routing';
import type { Locale } from './common';
export async function projectOnboardingPage(
  a: AccountView,
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined>,
) {
  const owned =
    path === '/admin/university' ||
    path === '/admin/university/projects/new' ||
    /^\/admin\/university\/projects\/created\/[a-f0-9-]{36}$/.test(path) ||
    /^\/admin\/university\/(projects|records)\/[a-f0-9-]{36}$/.test(path);
  if (!owned) return null;
  const filters: Record<string, string> = {};
  for (const k of ['q', 'status', 'department', 'year', 'page'])
    if (query[k] !== undefined) {
      if (typeof query[k] !== 'string') notFound();
      filters[k] = query[k];
    }
  if (
    (filters['q'] ?? '').length > 200 ||
    (filters['page'] && !/^[1-9]\d{0,3}$/.test(filters['page']))
  )
    notFound();
  try {
    if (path === '/admin/university') {
      if (a.role !== 'university_admin') notFound();
      const list = await projectOnboarding().list(a, filters);
      for (const row of list.rows)
        row.canManage = (await projectOnboarding().record(a, row.id)).canManage;
      const maximum = Math.max(1, Math.ceil(list.total / 20));
      if (list.page > maximum) {
        const params = new URLSearchParams(filters);
        params.set('page', String(maximum));
        redirect('/' + locale + '/admin/university?' + params);
      }
      return (
        <ProjectIndex
          locale={locale}
          institution={(locale === 'ar' ? a.universityAr : a.university) ?? ''}
          list={list}
          query={filters}
          selected={
            typeof query.selected === 'string' ? query.selected : undefined
          }
        />
      );
    }
    if (path === '/admin/university/projects/new') {
      if (a.role !== 'university_admin') notFound();
      let command: string | undefined;
      if (typeof query.command === 'string') {
        const receipt = await projectOnboarding().receipt(a, query.command);
        if (receipt?.operation === 'create')
          redirect(
            '/' +
              locale +
              '/admin/university/projects/created/' +
              query.command +
              '?from=' +
              encodeURIComponent(projectParent(locale, query.from)),
          );
        command = query.command;
      }
      return (
        <ProjectWizard
          locale={locale}
          actorKey={a.id}
          institution={(locale === 'ar' ? a.universityAr : a.university) ?? ''}
          departments={await onboarding().read<DepartmentOption[]>(
            a,
            'departments',
          )}
          parent={projectParent(locale, query.from)}
          lockedCommand={command}
        />
      );
    }
    if (path.includes('/created/')) {
      if (a.role !== 'university_admin') notFound();
      const command = path.split('/').at(-1)!,
        receipt = await projectOnboarding().receipt(a, command);
      if (!receipt || receipt.operation !== 'create') notFound();
      return (
        <ProjectCreated
          locale={locale}
          command={command}
          record={await projectOnboarding().record(a, receipt.id)}
          parent={projectParent(locale, query.from)}
        />
      );
    }
    const pid = path.split('/').at(-1)!,
      record = await projectOnboarding().record(a, pid);
    if (path.startsWith('/admin/university/records/'))
      redirect(
        '/' +
          locale +
          '/admin/university/projects/' +
          pid +
          (typeof query.from === 'string'
            ? '?from=' + encodeURIComponent(projectParent(locale, query.from))
            : ''),
      );
    if (path.startsWith('/admin/university/') && a.role !== 'university_admin')
      notFound();
    if (path.startsWith('/projects/') && a.role !== 'student') notFound();
    if (path.startsWith('/supervision/') && a.role !== 'faculty_supervisor')
      notFound();
    const departments =
      a.role === 'university_admin'
        ? await onboarding().read<DepartmentOption[]>(a, 'departments')
        : [];
    if (typeof query.teamCommand === 'string') {
      const receipt = await projectOnboarding().receipt(a, query.teamCommand);
      if (receipt && (receipt.operation !== 'team' || receipt.id !== pid))
        notFound();
    }
    return (
      <ProjectRecord
        locale={locale}
        actorKey={a.id}
        record={record}
        parent={projectParent(
          locale,
          query.from,
          a.role === 'university_admin'
            ? '/admin/university'
            : a.role === 'student'
              ? '/projects'
              : '/supervision',
        )}
        departments={departments}
        {...(a.role === 'university_admin'
          ? { originalsHref: `/${locale}/project-records/${pid}/files` }
          : {})}
        startManaging={query.manage === 'team' && record.canManage}
        teamCommand={
          typeof query.teamCommand === 'string' ? query.teamCommand : undefined
        }
      />
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('NEXT_')) throw e;
    if (
      e instanceof DatabaseError &&
      ['42501', '22023', '22P02'].includes(e.sqlState ?? '')
    )
      notFound();
    if (
      e instanceof Error &&
      ['FORBIDDEN', 'INVALID_INPUT'].includes(e.message)
    )
      notFound();
    return <ReadUnavailable locale={locale} />;
  }
}
