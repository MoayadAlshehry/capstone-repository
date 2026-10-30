import 'server-only';
import type { AccountView } from '@capstone/db/auth';
import { reviewers } from '../reviewers/server';
import { partnerAccess } from '../access/server';
import { draftView } from '../drafts/server';
import { nativeReader } from '../native-files/server';
import { editions } from '../editions/server';
import { submissions } from '../submissions/server';
import { externalReviews } from '../external-reviews/server';
import { confirmedUnavailableReturn } from '../workspace-v2/return-read';
import {
  ownAccountView,
  allowedOwnReturn,
  parsedIntent,
  type OwnAccountView,
} from './r3-context';
export async function accountContext(a: AccountView): Promise<OwnAccountView> {
  let capable = false,
    status: string | null = null,
    lead = false;
  if (a.role === 'faculty_supervisor') {
    capable = await reviewers().capability(a);
    const profile = (await reviewers().view(a)).profiles.find(
      (p) => p.id === a.id,
    );
    status = profile?.status ?? null;
  }
  if (a.role === 'student') lead = (await partnerAccess().view(a)).lead;
  return ownAccountView(a, capable, status, lead);
}
export async function authorizedReturn(
  value: unknown,
  a: AccountView,
  view: OwnAccountView,
  locale: 'en' | 'ar',
): Promise<string | null> {
  const intent = parsedIntent(value);
  if (intent) {
    const path = intent.pathname.replace(/^\/(en|ar)/, ''),
      correction = path.match(/^\/evaluation\/corrections\/([0-9a-f-]{36})$/i),
      feedback = path.match(/^\/evaluation\/feedback\/([0-9a-f-]{36})$/i),
      notice = path.match(/^\/notifications\/([0-9a-f-]{36})$/i);
    try {
      if (
        correction ||
        feedback ||
        (path === '/evaluation/issues' &&
          (intent.searchParams.has('case') || intent.searchParams.has('issue')))
      ) {
        const { corrections } = await import('../corrections/server');
        const e = await corrections();
        if (feedback) await e.feedback(a, feedback[1]!);
        else
          await e.view(
            a,
            intent.searchParams.get('case') ?? undefined,
            correction?.[1] ?? intent.searchParams.get('issue') ?? undefined,
          );
        return '/' + locale + path + intent.search;
      }
      if (
        path === '/evaluation/allocation' &&
        (intent.searchParams.has('case') || intent.searchParams.has('run'))
      ) {
        if (!['platform_admin', 'university_admin'].includes(a.role))
          return null;
        const { allocation } = await import('../allocation/server');
        const v = await allocation().view<{ cases: { case: string }[] }>(
          a,
          intent.searchParams.get('run') ?? undefined,
        );
        if (
          intent.searchParams.has('case') &&
          !v.cases.some((c) => c.case === intent.searchParams.get('case'))
        )
          return null;
        return '/' + locale + path + intent.search;
      }
      if (notice) {
        const { governance } = await import('../governance/server');
        await governance().target(a, notice[1]!);
        return '/' + locale + path;
      }
    } catch (error) {
      if (!confirmedUnavailableReturn(error)) throw error;
      return null;
    }
  }
  const own = allowedOwnReturn(value, view, locale);
  if (own) return own;
  const u = parsedIntent(value);
  if (!u) return null;
  if (/^\/(en|ar)\/admin\/platform(?:\/|$)/.test(u.pathname)) {
    if (a.role !== 'platform_admin') return null;
    try {
      const path = u.pathname.replace(/^\/(en|ar)\/admin\/platform/, '');
      const institution = path.match(/^\/([0-9a-f-]{36})$/i),
        partner = path.match(/^\/partners\/([0-9a-f-]{36})$/i),
        reviewer = path.match(/^\/reviewers\/([0-9a-f-]{36})$/i);
      if (institution) {
        const { administration } = await import('../admin/server');
        const data = await administration().view(a, institution[1]);
        if (!data.universities.some((p) => p.id === institution[1]))
          return null;
        const account = u.searchParams.get('account');
        if (account && !data.accounts.some((p) => p.id === account))
          return null;
      }
      if (partner) {
        const { partners } = await import('../partners/server');
        if (!(await partners().view(a)).some((p) => p.id === partner[1]))
          return null;
      }
      if (reviewer) {
        const profiles = (
          await Promise.all(
            ['pending', 'approved', 'suspended'].map((s) =>
              reviewers().view(a, s),
            ),
          )
        ).flatMap((c) => c.profiles);
        if (!profiles.some((p) => p.id === reviewer[1])) return null;
      }
      return '/' + locale + u.pathname.replace(/^\/(en|ar)/, '') + u.search;
    } catch (error) {
      if (!confirmedUnavailableReturn(error)) throw error;
      return null;
    }
  }
  const university = u.pathname.match(
    /^\/(en|ar)\/admin\/university\/(?:([0-9a-f-]{36})|assignments\/([0-9a-f-]{36}|new)|records\/([0-9a-f-]{36}))$/i,
  );
  if (university) {
    if (a.role !== 'university_admin') return null;
    try {
      if (university[2]) {
        const { administration } = await import('../admin/server');
        if (
          !(await administration().view(a)).accounts.some(
            (p) => p.id === university[2],
          )
        )
          return null;
      }
      if (university[3]) {
        const { assignmentView } = await import('../assignments/server');
        const data = await assignmentView(a);
        if (
          university[3] === 'new'
            ? !data.groups.some(
                (g) => g.id === u.searchParams.get('group') && !g.used,
              )
            : !data.projects.some((p) => p.id === university[3])
        )
          return null;
      }
      if (university[4]) {
        const project = (await draftView(a, university[4])).projects[0];
        if (!project) return null;
        const version = u.searchParams.get('version') ?? project.version;
        const history = await (await editions()).history(a, project.id);
        if (!history.items.some((e) => e.id === version)) return null;
        const submission = u.searchParams.get('submission');
        if (submission) {
          const round = await (await submissions()).read(a, submission);
          if (round.project !== project.id || round.version !== version)
            return null;
        }
        const file = u.searchParams.get('file');
        if (file)
          await (
            await nativeReader()
          ).metadata(a, project.id, version, file, submission ?? undefined);
      }
      return '/' + locale + u.pathname.replace(/^\/(en|ar)/, '') + u.search;
    } catch (error) {
      if (!confirmedUnavailableReturn(error)) throw error;
      return null;
    }
  }
  const partnerGrant = u.pathname.match(
    /^\/(en|ar)\/partner\/grants\/([0-9a-f-]{36})$/i,
  );
  const partnerRequest = /^\/(en|ar)\/partner\/request$/.test(u.pathname);
  if (partnerGrant || partnerRequest) {
    if (a.role !== 'partner') return null;
    try {
      const access = await partnerAccess().view(a);
      if (partnerGrant) {
        const grant = access.grants.find((g) => g.id === partnerGrant[2]);
        if (!grant) return null;
        const file = u.searchParams.get('file');
        if (file)
          await (
            await nativeReader()
          ).metadata(
            { kind: 'partner-grant', actor: a, grant: grant.id },
            grant.project,
            grant.version,
            file,
          );
        return '/' + locale + '/partner/grants/' + grant.id + u.search;
      }
      const project = u.searchParams.get('project'),
        version = u.searchParams.get('version');
      if (!project || !version) return null;
      const existing = [...access.requests, ...access.grants].some(
        (x) => x.project === project && x.version === version,
      );
      if (!existing) {
        const { discovery } = await import('../discovery/server');
        if ((await discovery().detail(project, a)).version !== version)
          return null;
      }
      return '/' + locale + '/partner/request' + u.search;
    } catch (error) {
      if (!confirmedUnavailableReturn(error)) throw error;
      return null;
    }
  }
  const external = u.pathname.match(
    /^\/(en|ar)\/reviewer\/tasks\/([0-9a-f-]{36})$/i,
  );
  if (external) {
    if (a.role !== 'faculty_supervisor') return null;
    try {
      const task = await (await externalReviews()).view(a, external[2]!);
      if (!('status' in task)) return null;
      const file = u.searchParams.get('file');
      if (file && !task.manifest.entries.some((f) => f.id === file))
        return null;
      return '/' + locale + '/reviewer/tasks/' + external[2] + u.search;
    } catch (error) {
      if (!confirmedUnavailableReturn(error)) throw error;
      return null;
    }
  }
  const faculty = u.pathname.match(
    /^\/(en|ar)\/supervision\/(rounds|projects)\/([0-9a-f-]{36})(\/(assessment|committee|decision|files))?$/i,
  );
  if (faculty) {
    if (a.role !== 'faculty_supervisor') return null;
    try {
      const scope =
        faculty[2] === 'rounds'
          ? await (await submissions()).read(a, faculty[3]!)
          : null;
      const project = scope?.project ?? faculty[3]!;
      const data = await draftView(a, project),
        p = data.projects.find((p) => p.id === project && p.supervised);
      if (!p) return null;
      const file = u.searchParams.get('file');
      if (scope && file && !scope.files.some((f) => f.id === file)) return null;
      if (!scope && file)
        await (
          await nativeReader()
        ).metadata(
          a,
          p.id,
          u.searchParams.get('version') ?? p.version,
          file,
          u.searchParams.get('submission') ?? undefined,
        );
      return '/' + locale + u.pathname.replace(/^\/(en|ar)/, '') + u.search;
    } catch (error) {
      if (!confirmedUnavailableReturn(error)) throw error;
      return null;
    }
  }
  const m = u.pathname.match(
    /^\/(en|ar)\/projects\/([0-9a-f-]{36})(\/(edit|review|history|files|sharing(?:\/(?:license|requests))?|packets))?$/i,
  );
  if (
    !m ||
    !['student', 'faculty_supervisor', 'university_admin'].includes(a.role)
  )
    return null;
  try {
    const v = await draftView(a, m[2]);
    const project = v.projects.find((p) => p.id === m[2]);
    if (!project) return null;
    const version = u.searchParams.get('version') ?? project.version;
    if (u.search) {
      const history = await (await editions()).history(a, project.id);
      if (!history.items.some((e) => e.id === version)) return null;
    }
    if (m[4] === 'files' && u.search) {
      const reader = await nativeReader();
      const history = await (await editions()).history(a, project.id),
        chosen = history.items.find((e) => e.id === version);
      const sub =
          u.searchParams.get('submission') ??
          (version !== project.version
            ? (chosen?.approvedSubmission ?? chosen?.submission ?? undefined)
            : undefined),
        file = u.searchParams.get('file');
      if (file) await reader.metadata(a, project.id, version, file, sub);
      else await reader.list(a, project.id, version, sub);
    }
    return v.projects.some((p) => p.id === m[2])
      ? `/${locale}/projects/${m[2]}${m[3] ?? ''}${u.search}`
      : null;
  } catch (error) {
    if (!confirmedUnavailableReturn(error)) throw error;
    return null;
  }
}
