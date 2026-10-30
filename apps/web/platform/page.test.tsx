import { beforeEach, expect, it, vi } from 'vitest';
import type { AccountView } from '@capstone/db/auth';
const read = vi.hoisted(() => vi.fn());
vi.mock('../allocation/server', () => ({ allocation: () => ({ view: read }) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('./operations', () => ({
  SchedulingRecords: () => null,
  MetadataAccess: () => null,
}));
vi.mock('../onboarding/common', () => ({ ReadUnavailable: () => null }));
import { platformPage } from './page';
const admin = {
  id: 'controlled-platform',
  role: 'platform_admin',
} as AccountView;
beforeEach(() => read.mockReset());
it('does not query allocation records for the retired Operations route', async () => {
  expect(
    await platformPage(admin, 'en', '/admin/platform/operations', {}),
  ).toBeNull();
  expect(
    await platformPage(admin, 'ar', '/admin/platform/operations', {
      run: '11111111-1111-4111-8111-111111111111',
    }),
  ).toBeNull();
  expect(read).not.toHaveBeenCalled();
});
it('rejects the platform-admin allocation alias before its shared loader executes', async () => {
  await expect(
    platformPage(admin, 'en', '/evaluation/allocation', {}),
  ).rejects.toThrow('NEXT_NOT_FOUND');
  expect(read).not.toHaveBeenCalled();
});
