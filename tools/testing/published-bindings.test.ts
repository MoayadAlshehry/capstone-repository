import { it, expect } from 'vitest';
import { assertRequiredBindings } from '../../scripts/verify-owned.mjs';
const container = (binds: unknown) => ({
  NetworkSettings: { Ports: { '5432/tcp': binds } },
});
it('accepts only the exact required owned loopback publication', () => {
  expect(() =>
    assertRequiredBindings(
      container([{ HostIp: '127.0.0.1', HostPort: '16530' }]),
      { '5432/tcp': 16530 },
    ),
  ).not.toThrow();
});
it('does not treat an unpublished running-container port as owned target proof', () => {
  for (const value of [null, []])
    expect(() =>
      assertRequiredBindings(container(value), { '5432/tcp': 16530 }),
    ).toThrow('TEST_REQUIRED_PUBLISHED_BINDING_MISMATCH');
});
it('rejects another host port even when the container label could match', () => {
  expect(() =>
    assertRequiredBindings(
      container([{ HostIp: '127.0.0.1', HostPort: '16531' }]),
      { '5432/tcp': 16530 },
    ),
  ).toThrow('TEST_REQUIRED_PUBLISHED_BINDING_MISMATCH');
});
it('rejects wildcard exposure for a required loopback binding', () => {
  expect(() =>
    assertRequiredBindings(
      container([{ HostIp: '0.0.0.0', HostPort: '16530' }]),
      { '5432/tcp': 16530 },
    ),
  ).toThrow('TEST_REQUIRED_PUBLISHED_BINDING_MISMATCH');
});
