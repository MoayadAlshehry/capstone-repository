import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseError } from '@capstone/db';
import { readDemoState } from '../../scripts/demo/read-retry.js';

afterEach(() => vi.useRealTimers());

it('returns a successful read without a retry or delay', async () => {
  const operation = vi.fn().mockResolvedValue({ completed: true });
  const report = vi.fn();
  await expect(readDemoState(operation, report)).resolves.toEqual({
    completed: true,
  });
  expect(operation).toHaveBeenCalledTimes(1);
  expect(report).not.toHaveBeenCalled();
});

it('records a statement timeout and retries once after the bounded backoff', async () => {
  vi.useFakeTimers();
  const failure = new DatabaseError('QUERY_FAILED', '57014');
  const operation = vi
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce('resumed');
  const report = vi.fn();
  const result = readDemoState(operation, report);
  await vi.advanceTimersByTimeAsync(999);
  expect(operation).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledExactlyOnceWith(failure);
  await vi.advanceTimersByTimeAsync(1);
  await expect(result).resolves.toBe('resumed');
  expect(operation).toHaveBeenCalledTimes(2);
});

it('propagates the second timeout without an unbounded retry', async () => {
  vi.useFakeTimers();
  const failure = new DatabaseError('QUERY_FAILED', '57014');
  const operation = vi.fn().mockRejectedValue(failure);
  const report = vi.fn();
  const result = expect(readDemoState(operation, report)).rejects.toBe(failure);
  await vi.runAllTimersAsync();
  await result;
  expect(operation).toHaveBeenCalledTimes(2);
  expect(report).toHaveBeenCalledTimes(1);
});

it.each(['40001', '42501', '22023', '23514'])(
  'does not retry a conflict, authorization or validation error %s',
  async (sqlState) => {
    const failure = new DatabaseError('QUERY_FAILED', sqlState);
    const operation = vi.fn().mockRejectedValue(failure);
    const report = vi.fn();
    await expect(readDemoState(operation, report)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  },
);

it('does not admit an unrelated error merely carrying the same state string', async () => {
  const failure = Object.assign(new Error('unrelated'), { sqlState: '57014' });
  const operation = vi.fn().mockRejectedValue(failure);
  const report = vi.fn();
  await expect(readDemoState(operation, report)).rejects.toBe(failure);
  expect(operation).toHaveBeenCalledTimes(1);
  expect(report).not.toHaveBeenCalled();
});

it('does not start a replacement read before awaited read cleanup finishes', async () => {
  vi.useFakeTimers();
  const order: string[] = [];
  let attempt = 0;
  const operation = async () => {
    attempt++;
    order.push('open-' + attempt);
    if (attempt === 2) return 'complete';
    try {
      throw new DatabaseError('QUERY_FAILED', '57014');
    } finally {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      order.push('closed-1');
    }
  };
  const result = readDemoState(operation, () => order.push('retry-recorded'));
  await vi.advanceTimersByTimeAsync(49);
  expect(order).toEqual(['open-1']);
  await vi.advanceTimersByTimeAsync(1051);
  await expect(result).resolves.toBe('complete');
  expect(order).toEqual(['open-1', 'closed-1', 'retry-recorded', 'open-2']);
});
