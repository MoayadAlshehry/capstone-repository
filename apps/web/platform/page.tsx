import 'server-only';
import { notFound } from 'next/navigation';
import type { AccountView } from '@capstone/db/auth';
import { allocation } from '../allocation/server';
import {
  SchedulingRecords,
  MetadataAccess,
  type AllocationDiagnostics,
} from './operations';
import { ReadUnavailable, type Locale } from '../onboarding/common';
import { privateReadError } from '../semester/private-read-error';
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export async function platformPage(
  actor: AccountView,
  locale: Locale,
  path: string,
  query: Record<string, string | string[] | undefined>,
) {
  const shared = path === '/evaluation/allocation';
  if (!shared && path !== '/admin/platform/drafts') return null;
  if (
    shared ? actor.role !== 'university_admin' : actor.role !== 'platform_admin'
  )
    notFound();
  const allowed =
    path === '/admin/platform/drafts' ? ['project'] : ['case', 'run'];
  if (
    Object.keys(query).some((k) => !allowed.includes(k)) ||
    Object.values(query).some((v) => typeof v !== 'string' || !uuid.test(v))
  )
    notFound();
  if (path === '/admin/platform/drafts')
    return (
      <MetadataAccess
        key={actor.id + ':' + (query.project ?? 'manual')}
        actorId={actor.id}
        locale={locale}
        project={typeof query.project === 'string' ? query.project : ''}
      />
    );
  try {
    const data = await allocation().view<AllocationDiagnostics>(
      actor,
      typeof query.run === 'string' ? query.run : undefined,
    );
    if (typeof query.run === 'string' && !data.run) notFound();
    if (typeof query.case === 'string') {
      data.cases = data.cases.filter((item) => item.case === query.case);
      if (!data.cases.length) notFound();
    }
    return <SchedulingRecords locale={locale} data={data} />;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('NEXT_')) throw e;
    if (privateReadError(e).status !== 503) notFound();
    return <ReadUnavailable locale={locale} />;
  }
}
