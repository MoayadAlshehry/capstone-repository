import { AccountDrafts } from '../../account-entry/drafts';
import type { ReactNode } from 'react';
export default function Layout({ children }: { children: ReactNode }) {
  return <AccountDrafts>{children}</AccountDrafts>;
}
