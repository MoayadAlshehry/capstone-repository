import 'server-only';
import { createAccountAccess } from '@capstone/db/account-access';
let service: ReturnType<typeof createAccountAccess> | undefined;
export function accountAccess() {
  return (service ??= createAccountAccess(process.env['DATABASE_URL'] ?? ''));
}
