import { expect, it } from 'vitest';
import { loginFailure } from './login-outcome';

it('does not blame accepted credentials when a later language save loses its reply or access', () => {
  for (const code of ['Failed to fetch', 'UNAUTHENTICATED', 'TRY_LATER'])
    expect(loginFailure(code, true)).toBe('signin-preferences');
});
it('distinguishes rejected credentials and throttling from an unconfirmed sign-in response', () => {
  expect(loginFailure('INVALID_CREDENTIALS', false)).toBe('signin');
  expect(loginFailure('TRY_LATER', false)).toBe('limit');
  for (const code of [
    'Failed to fetch',
    'Response not confirmed',
    'SERVICE_UNAVAILABLE',
  ])
    expect(loginFailure(code, false)).toBe('signin-unconfirmed');
});
