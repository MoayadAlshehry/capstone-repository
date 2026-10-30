import { expect, it } from 'vitest';
import { recheckGrantRead } from './reader-recovery';

const scope = {
  actor: 'controlled-actor',
  id: 'controlled-grant',
  project: 'controlled-project',
  version: 'controlled-version',
};
const permitted = {
  usable: true,
  grant: { ...scope, state: 'active', canRead: true },
};

it('reopens only an exact freshly confirmed own active grant using the frozen actor read', async () => {
  let observed: { url: unknown; options: RequestInit | undefined } | undefined;
  const result = await recheckGrantRead(scope, (async (url, options) => {
    observed = { url, options };
    return Response.json(permitted);
  }) as typeof fetch);
  expect(result).toBe(true);
  expect(observed).toEqual({
    url: '/api/partner-access?grant=controlled-grant',
    options: {
      cache: 'no-store',
      headers: { 'X-Workspace-Actor': scope.actor },
    },
  });
});

it.each([403, 404, 503])(
  'keeps a denied reader closed for response %s',
  async (status) => {
    expect(
      await recheckGrantRead(scope, (async () =>
        Response.json(permitted, { status })) as typeof fetch),
    ).toBe(false);
  },
);

it.each([
  { ...permitted, usable: false },
  { ...permitted, grant: { ...permitted.grant, id: 'foreign-grant' } },
  { ...permitted, grant: { ...permitted.grant, project: 'foreign-project' } },
  { ...permitted, grant: { ...permitted.grant, version: 'another-version' } },
  { ...permitted, grant: { ...permitted.grant, state: 'revoked' } },
  { ...permitted, grant: { ...permitted.grant, canRead: false } },
])('does not reuse stale props or another returned target %#', async (body) => {
  expect(
    await recheckGrantRead(scope, (async () =>
      Response.json(body)) as typeof fetch),
  ).toBe(false);
});

it('keeps the reader closed when transport or returned JSON cannot be confirmed', async () => {
  expect(
    await recheckGrantRead(scope, (async () => {
      throw new TypeError('Controlled transport loss');
    }) as typeof fetch),
  ).toBe(false);
  expect(
    await recheckGrantRead(
      scope,
      (async () => new Response('{', { status: 200 })) as typeof fetch,
    ),
  ).toBe(false);
});
