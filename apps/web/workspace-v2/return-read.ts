import 'server-only';
import {
  knownUnavailableFile,
  privateReadError,
} from '../semester/private-read-error';

/** A failed availability check must keep the original task recoverable. */
export function confirmedUnavailableReturn(error: unknown): boolean {
  return (
    knownUnavailableFile(error) ||
    privateReadError(error).status === 400 ||
    (error instanceof Error &&
      [
        'RETURN_UNAVAILABLE',
        'FORBIDDEN',
        'NOT_FOUND',
        'INVALID_INPUT',
      ].includes(error.message))
  );
}
