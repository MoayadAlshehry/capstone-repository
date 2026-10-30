import 'server-only';
import type { AccountView } from '@capstone/db/auth';
import type { AccessView, AccessCommand } from '../access/types';
import type { PartnerProfile } from '../partners/types';
import type { NoticePage } from '../governance/types';
import { partnerAccess } from '../access/server';
import { nativeReader } from '../native-files/server';
import { governance } from '../governance/server';
import { knownUnavailableFile } from '../semester/private-read-error';
import {
  presentAccess,
  accessHub,
  type GrantRecord,
  type AccessAction,
} from './presentation';
async function effectiveGrants(
  actor: AccountView,
  view: AccessView,
): Promise<GrantRecord[]> {
  return Promise.all(
    view.grants.map(async (g) => {
      if (g.state !== 'active') return { ...g, effective: g.state };
      if (!g.canRead) return { ...g, effective: 'paused' };
      if (actor.role !== 'partner') return { ...g, effective: 'active' };
      try {
        const files = await (
          await nativeReader()
        ).list(
          { kind: 'partner-grant', actor, grant: g.id },
          g.project,
          g.version,
        );
        return { ...g, effective: 'active', fileCount: files.length };
      } catch (e) {
        if (!knownUnavailableFile(e)) throw e;
        return {
          ...g,
          canRead: false,
          effective: 'unavailable',
        };
      }
    }),
  );
}
export function eligibilityActions(profile: PartnerProfile) {
  return {
    canResubmit:
      profile.status === 'rejected' && profile.accountStatus === 'active',
    canRequest:
      profile.status === 'approved' && profile.accountStatus === 'active',
  };
}
export async function partnerPresentation(
  actor: AccountView,
  profile: PartnerProfile,
  locale: 'en' | 'ar',
) {
  const view = await partnerAccess().view(actor),
    grants = await effectiveGrants(actor, view);
  return {
    view,
    grants,
    presentation: presentAccess(
      view,
      grants,
      locale,
      eligibilityActions(profile).canRequest,
    ),
  };
}
export function decisionActions(
  request: AccessView['requests'][number] | undefined,
  grant: AccessView['grants'][number] | undefined,
  protective: boolean,
): AccessCommand['operation'][] {
  if (request?.status === 'pending' && request.eligible)
    return ['approve', 'deny'];
  if (grant?.state === 'active')
    return [protective ? 'protective-revoke' : 'revoke'];
  return [];
}
export async function noticeAction(
  actor: AccountView,
  id: string,
  locale: 'en' | 'ar',
  view?: AccessView,
): Promise<{ context: string | null; action: AccessAction | null }> {
  const source = await governance().context(actor, id);
  if (actor.role === 'faculty_supervisor') {
    await governance().target(actor, id);
    return {
      context: source.context,
      action: { kind: 'review', href: '/' + locale + '/notifications/' + id },
    };
  }
  const data = view ?? (await partnerAccess().view(actor));
  const l = source.link;
  let action: AccessAction | null = null;
  if (actor.role === 'partner' && l.kind === 'grant') {
    const grant = data.grants.find((g) => g.id === l.id);
    if (grant) {
      const [g] = await effectiveGrants(actor, { ...data, grants: [grant] });
      action =
        g!.effective === 'active'
          ? {
              kind: 'files',
              href: '/' + locale + '/partner/grants/' + grant.id,
            }
          : {
              kind: 'history',
              href: accessHub(locale, 'history', grant.project),
            };
    }
  } else if (actor.role === 'student' && l.kind === 'lead') {
    const request = data.requests.find((r) => r.id === source.request);
    if (request)
      action = {
        kind: 'review',
        href:
          '/' +
          locale +
          '/access/lead?' +
          new URLSearchParams({
            project: request.project,
            request: request.id,
            from: '/' + locale + '/access/lead?project=' + request.project,
          }),
      };
  } else if (actor.role === 'partner' && l.kind === 'partner-access') {
    const r = data.requests.find((r) => r.project === source.project);
    action = r
      ? {
          kind: 'request',
          href:
            '/' +
            locale +
            '/partner/request?' +
            new URLSearchParams({
              project: r.project,
              version: r.version,
              request: r.id,
            }),
        }
      : { kind: 'history', href: accessHub(locale, 'history') };
  } else if (actor.role === 'partner' && l.kind === 'partner')
    action = {
      kind: 'eligibility',
      href: '/' + locale + '/partner/eligibility',
    };
  else {
    try {
      await governance().target(actor, id);
      action = { kind: 'review', href: '/' + locale + '/notifications/' + id };
    } catch (error) {
      if (!knownUnavailableFile(error)) throw error;
    }
  }
  return { context: source.context, action };
}
export async function contextualNotices(
  actor: AccountView,
  data: NoticePage,
  locale: 'en' | 'ar',
) {
  const view = await partnerAccess().view(actor);
  return {
    ...data,
    items: await Promise.all(
      data.items.map(async (n) => {
        try {
          return { ...n, ...(await noticeAction(actor, n.id, locale, view)) };
        } catch (error) {
          if (!knownUnavailableFile(error)) throw error;
          return { ...n, context: null, action: null };
        }
      }),
    ),
  };
}
