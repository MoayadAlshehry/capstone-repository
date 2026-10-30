import 'server-only';
import { z } from 'zod';
import { currentAccount } from '../auth/server';
import { DatabaseError } from '@capstone/db';
import { boundedCredentialJson } from '../account-entry/server';
import { partners } from '../partners/server';
import { reviewers } from '../reviewers/server';
import { onboarding } from './server';
const reply = (status: number, b: unknown) =>
  Response.json(b, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Cookie',
    },
  });
const schema = z
  .object({
    command: z.uuid(),
    operation: z.enum(['approve', 'reject', 'suspend', 'reapprove']),
    revision: z.number().int().min(0),
    reason: z.string().trim().max(400),
  })
  .strict();
export async function approvalsHandler(req: Request) {
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply(401, { code: 'UNAUTHENTICATED' });
    if (a.role !== 'platform_admin') return reply(403, { code: 'FORBIDDEN' });
    const u = new URL(req.url),
      kind = u.searchParams.get('kind') ?? '',
      target = u.searchParams.get('person') ?? '';
    if (
      !['partners', 'reviewers'].includes(kind) ||
      !z.uuid().safeParse(target).success ||
      [...u.searchParams.keys()].some(
        (k) => !['kind', 'person', 'command'].includes(k),
      )
    )
      return reply(400, { code: 'INVALID_INPUT' });
    if (req.method === 'GET') {
      const record = await onboarding().approvals(a, kind, target);
      if (!record) return reply(404, { code: 'NOT_FOUND' });
      return reply(200, {
        record,
        receipt: u.searchParams.has('command')
          ? await onboarding().decisionReceipt(
              a,
              u.searchParams.get('command')!,
              target,
              kind,
            )
          : null,
      });
    }
    if (req.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      req.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !req.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    const b = schema.safeParse(await boundedCredentialJson(req));
    if (!b.success) return reply(400, { code: 'INVALID_INPUT' });
    const v = b.data;
    if (kind === 'reviewers') {
      if (!['approve', 'suspend'].includes(v.operation))
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(
        200,
        await reviewers().command(a, {
          command: v.command,
          target,
          operation: v.operation as 'approve' | 'suspend',
          revision: v.revision,
          body: { reason: v.reason },
        }),
      );
    }
    return reply(
      200,
      await partners().command(a, {
        commandId: v.command,
        target,
        command: v.operation,
        revision: v.revision,
        ...(v.reason ? { reason: v.reason } : {}),
      }),
    );
  } catch (e) {
    const state = e instanceof DatabaseError ? e.sqlState : undefined;
    return reply(
      state === '40001'
        ? 409
        : state === '42501'
          ? 403
          : state === '22023'
            ? 400
            : 503,
      { code: state === '40001' ? 'STATE_CONFLICT' : 'UNAVAILABLE' },
    );
  }
}
