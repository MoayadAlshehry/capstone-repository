type LoginFailure =
  'signin' | 'signin-unconfirmed' | 'signin-preferences' | 'limit';

/** A preference failure after acknowledged authentication cannot invalidate the credentials. */
export function loginFailure(
  code: string,
  authenticationConfirmed: boolean,
): LoginFailure {
  if (authenticationConfirmed) return 'signin-preferences';
  if (code === 'TRY_LATER') return 'limit';
  return code === 'INVALID_CREDENTIALS' ? 'signin' : 'signin-unconfirmed';
}
