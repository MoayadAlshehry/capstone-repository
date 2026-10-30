import { expect, it } from 'vitest';
import {
  MutableClock,
  deterministicId,
  namespace,
  Cleanup,
  authStatePath,
} from './index.js';
it('controls UTC fixed/advanced exact before, at and after instants without mutating returned Dates', () => {
  const clock = new MutableClock('2026-10-04T00:00:00.000Z');
  const boundary = Date.parse('2026-10-04T00:00:00.001Z');
  expect(clock.now().toISOString()).toBe('2026-10-04T00:00:00.000Z');
  expect(clock.now().getTime()).toBeLessThan(boundary);
  clock.now().setFullYear(2000);
  clock.advance(1);
  expect(clock.now().getTime()).toBe(boundary);
  clock.advance(1);
  expect(clock.now().getTime()).toBeGreaterThan(boundary);
  expect(() => new MutableClock('not UTC')).toThrow();
  expect(() => clock.advance(NaN)).toThrow();
});
it('uses deterministic names and disjoint run/worker namespaces', () => {
  expect(deterministicId('seed', 1)).toBe(deterministicId('seed', 1));
  expect(namespace('run', '1')).not.toBe(namespace('run', '2'));
  expect(namespace()).not.toBe(namespace());
});
it('defines future per-role/worker auth paths without fabricating any login/state', () => {
  expect(authStatePath('run', '0', 'admin')).not.toBe(
    authStatePath('run', '1', 'admin'),
  );
  expect(authStatePath('run', '0', 'admin')).not.toBe(
    authStatePath('run', '0', 'reviewer'),
  );
  expect(() => authStatePath('run', '0', '../unsafe')).toThrow();
});
it('cleans in reverse registration order even after a failed action and is idempotent', async () => {
  const cleanup = new Cleanup();
  const calls: number[] = [];
  cleanup.register(async () => {
    calls.push(1);
  });
  cleanup.register(async () => {
    calls.push(2);
    throw new Error('controlled');
  });
  await expect(cleanup.close()).rejects.toThrow('cleanup failed');
  expect(calls).toEqual([2, 1]);
  await cleanup.close();
  expect(calls).toEqual([2, 1]);
});
