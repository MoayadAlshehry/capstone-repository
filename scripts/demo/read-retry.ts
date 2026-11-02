import { DatabaseError } from '@capstone/db';

/**
 * Retry one current-state Demo read once after a database statement timeout.
 * Call only read operations. Never replay a command or restart a stage here.
 * Existing query deadlines, authorization and allocation remain unchanged.
 */
export async function readDemoState<T>(
  operation: () => Promise<T>,
  reportRetry: (failure: DatabaseError) => void,
): Promise<T> {
  try {
    return await operation();
  } catch (failure) {
    if (!(failure instanceof DatabaseError) || failure.sqlState !== '57014') {
      throw failure;
    }
    reportRetry(failure);
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    return operation();
  }
}
