import 'server-only';
import { DatabaseError } from '@capstone/db';
import { NativeReadError } from '@capstone/infrastructure/native-files';

export function knownUnavailableFile(error: unknown): boolean {
  return (
    error instanceof NativeReadError ||
    (error instanceof DatabaseError &&
      ['P0002', '42501'].includes(error.sqlState ?? ''))
  );
}

/** Private reads conceal denied targets but must not disguise service outages. */
export function privateReadError(error: unknown) {
  const state = error instanceof DatabaseError ? error.sqlState : undefined;
  if (state === 'P0002' || state === '42501')
    return { status: 404, code: 'NOT_FOUND' } as const;
  if (state?.startsWith('22'))
    return { status: 400, code: 'INVALID_INPUT' } as const;
  if (state === '40001' || state === '40P01')
    return { status: 409, code: 'CONFLICT' } as const;
  return { status: 503, code: 'READ_UNAVAILABLE' } as const;
}
