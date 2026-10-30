import { it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ error: '' }));
vi.mock('server-only', () => ({}));
vi.mock('@capstone/domain/showcase-engine', () => ({
  createShowcaseEngine: () => ({
    read: async () => {
      if (state.error) throw Error(state.error);
      return { main: [], recent: [], total: 0 };
    },
  }),
}));
vi.mock('../auth/server', () => ({ currentAccount: async () => null }));
vi.mock('../native-files/server', () => ({
  privateFileHeaders: { 'Cache-Control': 'private, no-store' },
}));
import { showcaseHandler } from './server';
it('distinguishes invalid showcase filters from service failure without disclosing internal diagnostics', async () => {
  state.error = 'INVALID_FILTER';
  const invalid = await showcaseHandler(
    new Request('http://localhost/api/showcase'),
  );
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ code: 'INVALID_PUBLIC_FILTER' });
  state.error = 'PRIVATE_CONNECTION_DIAGNOSTIC';
  const unavailable = await showcaseHandler(
    new Request('http://localhost/api/showcase'),
  );
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ code: 'PUBLIC_UNAVAILABLE' });
  state.error = '';
  expect(
    (await showcaseHandler(new Request('http://localhost/api/showcase')))
      .status,
  ).toBe(200);
});
