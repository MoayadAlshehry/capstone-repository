import { expect, it } from 'vitest';
import { completeTransferLeave, transferNeedsSettlement } from './files';

it('defers the original navigation until every real transfer is safely paused or already ready', async () => {
  const jobs = [{ state: 'uploading' }, { state: 'confirming' }],
    events: string[] = [];
  expect(
    await completeTransferLeave(
      jobs,
      'pause',
      async (job) => {
        events.push('settle');
        job.state = events.length === 1 ? 'paused' : 'ready';
      },
      () => {
        events.push('original intent');
      },
    ),
  ).toBe(true);
  expect(events).toEqual(['settle', 'settle', 'original intent']);
});
it('does not execute Sign out or traversal when cancellation is still unknown or pause failed', async () => {
  let committed = false;
  expect(
    await completeTransferLeave(
      [{ state: 'uploading' }],
      'cancel',
      async (job) => {
        job.state = 'unknown';
      },
      () => {
        committed = true;
      },
    ),
  ).toBe(false);
  await expect(
    completeTransferLeave(
      [{ state: 'uploading' }],
      'pause',
      async () => {
        throw Error('Controlled interrupted pause');
      },
      () => {
        committed = true;
      },
    ),
  ).rejects.toThrow('Controlled interrupted pause');
  expect(committed).toBe(false);
});
it('a failed cancellation keeps the exact unfinished job in a healthy retry before the original navigation', async () => {
  const jobs = [{ state: 'uploading' }, { state: 'paused' }],
    events: string[] = [];
  const original = () => {
    events.push('original intent');
  };
  expect(
    await completeTransferLeave(
      jobs.filter((j) => transferNeedsSettlement(j.state)),
      'cancel',
      async (job) => {
        events.push('unavailable cancel');
        job.state = 'unknown';
      },
      original,
    ),
  ).toBe(false);
  expect(jobs.map((j) => j.state)).toEqual(['unknown', 'paused']);
  expect(
    await completeTransferLeave(
      jobs.filter((j) => transferNeedsSettlement(j.state)),
      'cancel',
      async (job) => {
        events.push('confirmed cancel');
        job.state = 'cancelled';
      },
      original,
    ),
  ).toBe(true);
  expect(events).toEqual([
    'unavailable cancel',
    'confirmed cancel',
    'confirmed cancel',
    'original intent',
  ]);
  expect(jobs.every((j) => !transferNeedsSettlement(j.state))).toBe(true);
});
